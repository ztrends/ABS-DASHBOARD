const API_BASE = 'https://abs-dashboard-t7up.onrender.com/api';

const $ = id => document.getElementById(id);
let adminToken = sessionStorage.getItem('abs_admin_token') || '';
let state = { users: [], feedback: [], ads: [], summary: {} };
let refreshInProgress = false;

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const escAttr = v => esc(v).replace(/`/g, '&#96;');

function api(path, opts = {}){
  const headers = Object.assign(
    {'Content-Type':'application/json'},
    opts.headers || {}
  );
  if(adminToken) headers.Authorization = `Bearer ${adminToken}`;

  return fetch(`${API_BASE}${path}`, {...opts, headers}).then(async r => {
    let d = {};
    try { d = await r.json(); } catch {}
    if(!r.ok){
      if(r.status === 401){
        adminToken = '';
        sessionStorage.removeItem('abs_admin_token');
        showLogin();
      }
      throw new Error(d.error || `Request failed (${r.status})`);
    }
    return d;
  });
}

async function login(){
  const username = $('adminUser').value.trim();
  const password = $('adminPass').value;
  $('loginMsg').textContent = '';

  try{
    const d = await api('/admin/login', {
      method:'POST',
      body:JSON.stringify({username,password})
    });

    // Render backend validates ADMIN_USER and ADMIN_PASS and issues a short-lived JWT.
    // Firebase client sign-in is intentionally not repeated here; Firebase admin tasks
    // are performed securely by the backend using its service-account Secret File.
    adminToken = d.token;
    sessionStorage.setItem('abs_admin_token', adminToken);
    showAdmin();

  }catch(e){
    console.error('Admin login failed:', e);
    $('loginMsg').textContent = e.message || 'Login failed.';
  }
}

function showLogin(){
  $('login').classList.remove('hidden');
  $('app').classList.add('hidden');
}

function showAdmin(){
  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');
  refreshAdmin();
}

async function adminLogout(){
  adminToken = '';
  sessionStorage.removeItem('abs_admin_token');
  showLogin();
  setAdminRefreshStatus('Signed out.');
}

function setAdminRefreshStatus(message, isError = false){
  let node = $('adminRefreshStatus');
  if(!node){
    node = document.createElement('span');
    node.id = 'adminRefreshStatus';
    node.style.cssText = 'display:inline-block;max-width:100%;font-size:12px;line-height:1.4;margin:4px 8px;color:var(--muted,#8a93a5);';
    const host = document.querySelector('.actions') || document.querySelector('header') || document.getElementById('app');
    if(host) host.appendChild(node);
  }
  if(node){
    node.textContent = message;
    node.style.color = isError ? '#ef6464' : 'var(--muted,#8a93a5)';
  }
}

async function refreshAdmin(){
  if(refreshInProgress) return;
  refreshInProgress = true;
  const refreshButtons = [...document.querySelectorAll('button')].filter(btn =>
    /refresh/i.test(`${btn.textContent || ''} ${btn.getAttribute('onclick') || ''}`)
  );
  const previousLabels = refreshButtons.map(btn => btn.textContent);
  refreshButtons.forEach(btn => { btn.disabled = true; if(/refresh/i.test(btn.textContent||'')) btn.textContent = '↻ Refreshing…'; });
  setAdminRefreshStatus('Refreshing users, banners and feedback…');

  try{
    if(!adminToken){
      throw new Error('Admin session expired. Please log in again.');
    }

    // Read Firebase data through the trusted API using the Render admin JWT.
    const usersResponse = await api('/admin/firebase-users');
    state.users = Array.isArray(usersResponse.items) ? usersResponse.items : [];

    const warnings = [];
    const [adsResult, feedbackResult] = await Promise.allSettled([
      api('/admin/ads'),
      api('/admin/feedback')
    ]);
    if(adsResult.status === 'fulfilled') state.ads = Array.isArray(adsResult.value.items) ? adsResult.value.items : [];
    else { state.ads = []; warnings.push(`banners: ${adsResult.reason?.message || 'failed'}`); }
    if(feedbackResult.status === 'fulfilled') state.feedback = Array.isArray(feedbackResult.value.items) ? feedbackResult.value.items : [];
    else { state.feedback = []; warnings.push(`feedback: ${feedbackResult.reason?.message || 'failed'}`); }

    state.summary = {
      users: state.users.length,
      newToday: state.users.filter(u=>dateKey(u.createdAt||u.created_at)===new Date().toISOString().slice(0,10)).length,
      activeToday: state.users.filter(u=>dateKey(u.lastActiveAt||u.lastLoginAt)===new Date().toISOString().slice(0,10)).length,
      verified: state.users.filter(u => u.verified === true).length,
      premium: state.users.filter(u => u.verified === true).length,
      feedback: state.feedback.length,
      ads: state.ads.filter(a => a.active === true || a.active === 1).length
    };

    renderStats();
    renderUsers();
    renderAds();
    renderFeedback();
    setAdminRefreshStatus(warnings.length
      ? `Users refreshed; some data could not load (${warnings.join('; ')}).`
      : `Updated just now · ${state.users.length} users · ${state.ads.length} banners · ${state.feedback.length} feedback items.`, warnings.length > 0);

  }catch(e){
    console.error('ABS Admin refresh failed:', e);
    setAdminRefreshStatus(e.message || 'Unable to refresh admin data.', true);
    const msg = $('loginMsg');
    if(msg) msg.textContent = e.message || 'Unable to load admin data.';
  }finally{
    refreshButtons.forEach((btn, i) => { btn.disabled = false; if(previousLabels[i] != null) btn.textContent = previousLabels[i]; });
    refreshInProgress = false;
  }
}

function renderStats(){
  const s = state.summary;
  $('userCount').textContent = s.users ?? 0;
  $('feedbackCount').textContent = s.feedback ?? 0;
  $('adCount').textContent = s.ads ?? 0;
  $('verifiedCount').textContent = s.verified ?? 0;
  if($('requestCount')) $('requestCount').textContent = s.premium ?? 0;
  if($('newTodayCount')) $('newTodayCount').textContent = s.newToday ?? 0;
  if($('activeTodayCount')) $('activeTodayCount').textContent = s.activeToday ?? 0;
  const activity=$('activitySummary');
  if(activity){
    const today=new Date().toISOString().slice(0,10);
    const dayMs=24*60*60*1000, now=new Date();
    const active=state.users.filter(u=>dateKey(u.lastActiveAt||u.lastLoginAt)===today).length;
    const created=state.users.filter(u=>dateKey(u.createdAt||u.created_at)===today).length;
    const weekStart=new Date(now.getTime()-6*dayMs).toISOString().slice(0,10);
    const monthStart=new Date(now.getTime()-29*dayMs).toISOString().slice(0,10);
    const weekly=new Set(),monthly=new Set();
    state.users.forEach(u=>(Array.isArray(u.activityLog)?u.activityLog:[]).forEach(x=>{if(x?.date>=weekStart)weekly.add(u.uid);if(x?.date>=monthStart)monthly.add(u.uid)}));
    const days=Array.from({length:7},(_,i)=>{const d=new Date(now.getTime()-(6-i)*dayMs);return d.toISOString().slice(0,10)});
    const daily=days.map(day=>({day,count:new Set(state.users.filter(u=>(Array.isArray(u.activityLog)?u.activityLog:[]).some(x=>x?.date===day)).map(u=>u.uid)).size}));
    const max=Math.max(1,...daily.map(x=>x.count));
    activity.innerHTML=`<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px"><span class="badge">Today · ${active} active</span><span class="badge">New today · ${created}</span><span class="badge">7 days · ${weekly.size} users</span><span class="badge">30 days · ${monthly.size} users</span></div><div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;align-items:end;height:118px">${daily.map(x=>`<div style="display:flex;flex-direction:column;justify-content:end;align-items:center;gap:6px;min-width:0;height:100%"><small>${x.count}</small><div title="${esc(x.day)}: ${x.count} active" style="width:100%;max-width:36px;height:${Math.max(4,x.count/max*76)}px;background:linear-gradient(180deg,#7c5cff,#1877f2);border-radius:7px 7px 3px 3px"></div><small style="font-size:10px">${esc(x.day.slice(5))}</small></div>`).join('')}</div><p class="muted">Activity is recorded from app sign-ins after this update. Earlier activity cannot be reconstructed retroactively.</p>`;
  }
}

function clearUserSearch(){if($('userSearch'))$('userSearch').value='';renderUsers()}
function renderUsers(){
  const query=String($('userSearch')?.value||'').trim().toLowerCase();
  const list = state.users.filter(u=>!query||[u.absId,u.abs_id,u.name,u.mobile,u.email].some(v=>String(v||'').toLowerCase().includes(query)));

  $('users').innerHTML = list.length
    ? list.map(u => `
      <div class="user">
        <div class="userhead">
          <div>
            <div class="name">
              ${esc(u.name || 'User')}
              ${u.verified ? '<span class="verify">✓</span>' : ''}
            </div>
            <div class="mobile">${esc(u.mobile || '')}</div>
            <div class="sub">
              <b>ABS ID:</b> ${esc(u.absId || '—')} ·
              ${u.verified ? 'BLUE TICK ACTIVE' : 'STANDARD ACCOUNT'}
            </div>
          </div>
          <span class="badge">
            ${u.verified ? 'VERIFIED' : 'REGISTERED'}
          </span>
        </div>

        <div class="sub">
          Created: ${esc(formatDate(u.createdAt || u.created_at))} · Last active: ${esc(formatDate(u.lastActiveAt || u.lastLoginAt || 'Not recorded'))}
        </div>

        <div class="row">
          <button class="btn"
            onclick="openUserManager('${escAttr(u.uid)}')">
            VIEW / MANAGE
          </button>
          <button class="btn secondary" onclick="openUserDetails('${escAttr(u.uid)}')">FINANCE DETAILS</button>
          <button class="btn secondary" onclick="openAdminChat('${escAttr(u.uid)}')">LIVE CHAT</button>

          <button class="btn ${u.verified ? 'secondary' : 'blue'}"
            onclick="toggleVerified('${escAttr(u.uid)}',${!u.verified})">
            ${u.verified ? 'REMOVE BLUE TICK' : '✓ VERIFY ACCOUNT'}
          </button>
          <button class="btn danger"
            onclick="deleteUser('${escAttr(u.uid)}')">
            DELETE ACCOUNT
          </button>
        </div>
      </div>
    `).join('')
    : '<div class="empty">No registered users found.</div>';
}


async function openUserDetails(uid){
  const u=state.users.find(x=>x.uid===uid);if(!u)return;
  $('modalTitle').textContent='Customer Finance Overview';
  $('modalBody').innerHTML='<p class="muted">Loading saved account data…</p>';
  $('modal').classList.remove('hidden');
  try{
    const d=await api(`/admin/firebase-users/${encodeURIComponent(uid)}/details`);
    const s=d.summary||{};
    $('modalBody').innerHTML=`
      <div class="user"><div class="name">${esc(d.user?.name||u.name||'User')}</div><div class="sub">ABS ID: ${esc(d.user?.absId||u.absId||'—')} · ${esc(u.mobile||d.user?.mobile||'')}</div></div>
      <div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr))">
       <div class="stat"><small>Total Income</small><b>${moneyAdmin(s.income)}</b></div>
       <div class="stat"><small>Total Expenses</small><b>${moneyAdmin(s.expense)}</b></div>
       <div class="stat"><small>Net Difference</small><b>${moneyAdmin(Number(s.income||0)-Number(s.expense||0))}</b></div>
       <div class="stat"><small>Loan Principal</small><b>${moneyAdmin(s.loanPrincipal)}</b></div>
       <div class="stat"><small>Pending EMI</small><b>${moneyAdmin(s.pendingEmi)}</b></div>
       <div class="stat"><small>Transactions / Entries</small><b>${Number(s.entries||0)}</b></div>
       <div class="stat"><small>To Receive</small><b>${moneyAdmin(s.toReceive)}</b></div>
       <div class="stat"><small>To Pay</small><b>${moneyAdmin(s.toPay)}</b></div>
      </div>
      <h3 style="margin:18px 0 8px">Recent Financial Records</h3>
      <div style="max-height:250px;overflow:auto">${(()=>{
        const r=d.records||{};
        const items=[
          ...(r.income||[]).map(x=>({...x,kind:'Income',label:x.description||x.source||'Income',value:Number(x.amount||0)})),
          ...(r.expenses||[]).map(x=>({...x,kind:'Expense',label:x.description||x.category||'Expense',value:Number(x.amount||0)})),
          ...(r.emi||[]).map(x=>({...x,kind:'EMI',label:x.name||x.loan||'EMI',value:Number(x.amount||x.emi||0)})),
          ...(r.loans||[]).map(x=>({...x,kind:'Loan',label:x.name||'Loan',value:Number(x.principal||0)})),
          ...(r.ledger||[]).map(x=>({...x,kind:'Ledger',label:`${x.person||'Person'} · ${x.description||x.direction||''}`,value:Number(x.amount||0)}))
        ].sort((a,b)=>String(b.date||b.createdAt||'').localeCompare(String(a.date||a.createdAt||''))).slice(0,30);
        return items.length?items.map(x=>`<div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line)"><div><b>${esc(x.label)}</b><div class="sub">${esc(x.date||'—')} · ${esc(x.kind)}</div></div><strong>${moneyAdmin(x.value)}</strong></div>`).join(''):'<p class="muted">No financial records found.</p>';
      })()}</div>
      <p class="muted">This view displays only records returned by the user's saved private data. Activity history begins after users update to the new app version.</p>
      <button class="btn full" onclick="openAdminChat('${escAttr(uid)}')">OPEN LIVE CHAT</button>`;
  }catch(e){$('modalBody').innerHTML=`<div class="msg">${esc(e.message||'Could not load customer details.')}</div>`}
}
function moneyAdmin(n){return '₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2})}
async function openAdminChat(uid){
  const u=state.users.find(x=>x.uid===uid);if(!u)return;
  $('modalTitle').textContent=`Live Chat · ${u.name||'Customer'}`;
  $('modalBody').innerHTML='<p class="muted">Loading conversation…</p>';
  $('modal').classList.remove('hidden');
  try{
    const d=await api(`/admin/firebase-users/${encodeURIComponent(uid)}/chat`);
    const messages=Array.isArray(d.messages)?d.messages:[];
    $('modalBody').innerHTML=`<div id="adminChatMessages" style="max-height:45vh;overflow:auto;display:grid;gap:8px;margin:12px 0">${messages.length?messages.map(m=>`<div style="padding:10px 12px;border-radius:12px;background:${m.from==='admin'?'#18372e':'#171e2e'}"><b>${m.from==='admin'?'Admin':'Customer'}</b><div>${esc(m.text||'')}</div><small class="muted">${esc(formatDate(m.createdAt||''))}</small></div>`).join(''):'<p class="muted">No messages yet. Send a reply to start the conversation.</p>'}</div>
      <form id="adminChatForm"><textarea id="adminChatReply" maxlength="1500" required placeholder="Write a reply…"></textarea><button class="btn full" style="margin-top:10px">SEND REPLY</button></form>`;
    $('adminChatForm').onsubmit=async e=>{e.preventDefault();const text=$('adminChatReply').value.trim();if(!text)return;const btn=e.submitter;btn.disabled=true;try{await api(`/admin/firebase-users/${encodeURIComponent(uid)}/chat`,{method:'POST',body:JSON.stringify({text})});await openAdminChat(uid)}catch(err){alert(err.message||'Reply failed')}finally{btn.disabled=false}};
  }catch(e){$('modalBody').innerHTML=`<div class="msg">${esc(e.message||'Could not load chat.')}</div>`}
}

function openUserManager(uid){
  const u = state.users.find(x => x.uid === uid);
  if(!u) return;

  $('modalTitle').textContent = 'User Account';

  $('modalBody').innerHTML = `
    <p class="muted">
      <b>${esc(u.name || 'User')}</b><br>
      ${esc(u.mobile || '')}
    </p>

    <label>ABS ID</label>
    <input id="editAbsId"
      value="${escAttr(u.absId || '')}"
      placeholder="ABS701001">

    <label>Display Name</label>
    <input id="editName"
      value="${escAttr(u.name || '')}">

    <div id="userMsg" class="msg"></div>

    <button class="btn full"
      onclick="saveUser('${escAttr(u.uid)}')">
      SAVE USER
    </button>

    <div class="row">
      <button class="btn ${u.verified ? 'secondary' : 'blue'}"
        onclick="toggleVerified('${escAttr(u.uid)}',${!u.verified})">
        ${u.verified ? 'REMOVE BLUE TICK' : '✓ VERIFY ACCOUNT'}
      </button>

      <button class="btn danger"
        onclick="deleteUser('${escAttr(u.uid)}')">
        DELETE ACCOUNT
      </button>
    </div>

    <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">

    <div class="sub">
      Verification also unlocks Premium. Delete Account permanently removes this user's Firebase sign-in and saved profile data.
    </div>
  `;

  $('modalBody').insertAdjacentHTML('beforeend', `<hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><h3>Financial summary</h3><div id="userFinancialDetails" class="msg">Loading saved income, expenses, loans and EMI…</div>`);
  $('modal').classList.remove('hidden');
  loadUserFinancialDetails(uid);
}

async function loadUserFinancialDetails(uid){
  const target=$('userFinancialDetails'); if(!target) return;
  try{
    const d=await api(`/admin/firebase-users/${encodeURIComponent(uid)}/details`);
    const s=d.summary||{}; const r=d.records||{};
    const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2});
    const list=(label,items)=>`<details style="margin:10px 0"><summary>${label} (${items.length})</summary><div style="max-height:220px;overflow:auto">${items.map(x=>`<div class="sub" style="padding:7px 0;border-bottom:1px solid var(--line)">${esc(x.date||x.start||'—')} · ${esc(x.category||x.source||x.name||x.loan||x.directionLabel||'Record')} · ${money(x.amount??x.principal??0)}</div>`).join('')||'<div class="sub">No records saved.</div>'}</div></details>`;
    target.innerHTML=`<div class="row"><span class="badge">Income ${money(s.income)}</span><span class="badge">Expenses ${money(s.expense)}</span><span class="badge">EMI ${money(s.emi)}</span><span class="badge">Balance ${money(Number(s.income||0)-Number(s.expense||0)-Number(s.emi||0))}</span><span class="badge">Loans ${money(s.loanPrincipal)}</span><span class="badge">To receive ${money(s.toReceive)}</span><span class="badge">To pay ${money(s.toPay)}</span></div>${list('Income',r.income||[])}${list('Expenses',r.expenses||[])}${list('Loans',r.loans||[])}${list('EMI payments',r.emi||[])}${list('Lena / Dena',r.ledger||[])}`;
  }catch(e){target.textContent=`Unable to load financial data: ${e.message||'request failed'}`;}
}

async function saveUser(uid){
  const name = $('editName').value.trim();
  const absId = $('editAbsId').value.trim();
  if(!name || !absId){
    return $('userMsg').textContent = 'Name and ABS ID are required.';
  }
  const msg = $('userMsg');
  if(msg) msg.textContent = 'Saving changes…';
  try{
    await api(`/admin/firebase-users/${encodeURIComponent(uid)}`, {
      method:'PATCH',
      body:JSON.stringify({name,absId})
    });
    closeModal();
    await refreshAdmin();
    setAdminRefreshStatus(`Updated profile for ${name}. The user will see an in-app notice.`);
  }catch(e){
    console.error('Admin user update failed:', e);
    if(msg) msg.textContent = e.message || 'Unable to update user.';
    else alert(e.message || 'Unable to update user.');
  }
}

async function toggleVerified(uid, value){
  const user = state.users.find(x => x.uid === uid);
  if(!user) return alert('User account could not be found. Refresh and try again.');
  try{
    await api(`/admin/firebase-users/${encodeURIComponent(uid)}`, {
      method:'PATCH',
      body:JSON.stringify({verified:!!value})
    });
    await refreshAdmin();
    setAdminRefreshStatus(value
      ? `Blue tick unlocked for ${user.name || user.mobile}. User will receive an in-app notice.`
      : `Blue tick removed for ${user.name || user.mobile}. User will receive an in-app notice.`);
  }catch(e){
    console.error('Admin verification update failed:', e);
    alert(e.message || 'Unable to update verification.');
  }
}

/*
  These two actions cannot safely modify another Firebase Authentication
  user's password/account from browser-side Firebase SDK.
  They are intentionally kept as clear admin messages instead of
  calling the old SQLite endpoints for a different user database.
*/
function changePassword(){
  $('modalTitle').textContent = 'Reset User Password';
  $('modalBody').innerHTML = `
    <div class="msg">
      Password reset is not connected to Firebase Admin yet.
      Do not use the old SQLite reset endpoint for Firebase users.
    </div>
  `;
}

async function deleteUser(uid){
  const user = state.users.find(x => x.uid === uid);
  if(!uid || !user) return alert('User account could not be found. Refresh and try again.');
  if(uid === ADMIN_UID) return alert('The administrator account cannot be deleted from this panel.');
  const display = `${user.name || 'User'} (${user.mobile || uid})`;
  if(!confirm(`Permanently delete ${display}? This removes the Firebase sign-in and the user's saved ABS profile/data. This cannot be undone.`)) return;
  const typed = prompt(`To confirm permanent deletion, type DELETE exactly.

Account: ${display}`);
  if(typed !== 'DELETE') return alert('Deletion cancelled. Nothing was changed.');
  try{
    setAdminRefreshStatus(`Deleting ${display}…`);
    await api(`/admin/firebase-users/${encodeURIComponent(uid)}`, {method:'DELETE'});
    closeModal();
    await refreshAdmin();
    setAdminRefreshStatus(`Deleted ${display}.`);
    alert('Account deleted successfully.');
  }catch(e){
    console.error('Firebase account deletion failed:', e);
    alert(e.message || 'Account could not be deleted.');
    setAdminRefreshStatus(e.message || 'Account deletion failed.', true);
  }
}

async function openCreateUser(){
  $('modalTitle').textContent = 'Create User Account';

  $('modalBody').innerHTML = `
    <p class="muted">
      Create User is temporarily disabled here because the main app
      uses Firebase Authentication. Creating a SQLite-only user would
      make the account invisible to the main app.
    </p>
  `;

  $('modal').classList.remove('hidden');
}

function createUser(){
  openCreateUser();
}

function renderAds(){
  $('ads').innerHTML = state.ads.length
    ? state.ads.map(a => `
      <div class="ad">
        <div class="adtitle">
          ${esc(a.title || 'Advertisement')}
        </div>

        <div class="sub">${esc(a.text || '')}</div>

        ${a.image ? `<img src="${esc(a.image)}" alt="">` : ''}
        <div class="sub">Starts: ${esc(formatDate(a.starts_at))} · Ends: ${esc(formatDate(a.ends_at))}</div>

        <div class="ad-actions">
          <button class="btn ${a.active ? 'ok' : 'blue'}"
            onclick="toggleAd(${a.id},${!a.active})">
            ${a.active ? 'ACTIVE' : 'ENABLE'}
          </button>

          <button class="btn danger"
            onclick="deleteAd(${a.id})">
            DELETE
          </button>
        </div>
      </div>
    `).join('')
    : '<div class="empty">No advertisements added yet.</div>';
}

function openAdModal(id = null){
  const a = id
    ? state.ads.find(x => x.id === id)
    : {badge:'FEATURED',title:'',text:'',link:'',image:'',active:true};

  $('modalTitle').textContent =
    id ? 'Edit Advertisement' : 'Add Advertisement';

  $('modalBody').innerHTML = `
    <label>Upload Image</label>
    <input id="adImageFile" type="file" accept="image/*">

    <div class="preview" id="adPreview">
      ${a.image ? `<img src="${esc(a.image)}">` : ''}
    </div>

    <label>Badge</label>
    <input id="adBadge"
      value="${escAttr(a.badge || 'FEATURED')}">

    <label>Title</label>
    <input id="adTitle"
      value="${escAttr(a.title || '')}">

    <label>Text</label>
    <textarea id="adText">${esc(a.text || '')}</textarea>

    <label>Link (optional)</label>
    <input id="adLink"
      value="${escAttr(a.link || '')}">

    <label>Start time (optional)</label>
    <input id="adStartsAt" type="datetime-local" value="${escAttr(toLocalDateTime(a.starts_at))}">
    <label>End time (optional — banner stops after this)</label>
    <input id="adEndsAt" type="datetime-local" value="${escAttr(toLocalDateTime(a.ends_at))}">

    <button class="btn full" style="margin-top:16px"
      onclick="saveAd(${id || 0})">
      SAVE ADVERTISEMENT
    </button>

    <div id="adMsg" class="msg"></div>
  `;

  window._adImage = a.image || '';

  $('adImageFile').onchange = () => {
    const f = $('adImageFile').files?.[0];
    if(!f) return;

    if(f.size > 2 * 1024 * 1024){
      $('adMsg').textContent =
        'Use an image smaller than 2 MB.';
      return;
    }

    const r = new FileReader();

    r.onload = e => {
      window._adImage = e.target.result;
      $('adPreview').style.display = 'block';
      $('adPreview').innerHTML =
        `<img src="${e.target.result}" alt="">`;
    };

    r.readAsDataURL(f);
  };

  $('modal').classList.remove('hidden');
}

function saveAd(id){
  const title = $('adTitle').value.trim();

  if(!title){
    return $('adMsg').textContent =
      'Title is required.';
  }

  const startsRaw = $('adStartsAt')?.value || '';
  const endsRaw = $('adEndsAt')?.value || '';
  if(startsRaw && endsRaw && new Date(startsRaw) > new Date(endsRaw)) return $('adMsg').textContent = 'End time must be after start time.';
  const body = {
    starts_at: startsRaw ? new Date(startsRaw).toISOString() : '',
    ends_at: endsRaw ? new Date(endsRaw).toISOString() : '',
    badge: $('adBadge').value.trim() || 'FEATURED',
    title,
    text: $('adText').value.trim(),
    link: $('adLink').value.trim(),
    image: window._adImage || '',
    active: true
  };

  const req = id
    ? api(`/admin/ads/${id}`, {
        method:'PATCH',
        body:JSON.stringify(body)
      })
    : api('/admin/ads', {
        method:'POST',
        body:JSON.stringify(body)
      });

  req.then(() => {
    closeModal();
    refreshAdmin();
  }).catch(e => {
    $('adMsg').textContent =
      e.message || 'Unable to save advertisement.';
  });
}

function toggleAd(id, active){
  api(`/admin/ads/${id}`, {
    method:'PATCH',
    body:JSON.stringify({active})
  }).then(refreshAdmin)
    .catch(e => alert(e.message));
}

function deleteAd(id){
  if(!confirm('Delete this advertisement?')) return;

  api(`/admin/ads/${id}`, {
    method:'DELETE'
  }).then(refreshAdmin)
    .catch(e => alert(e.message));
}

function renderFeedback(){
  $('feedback').innerHTML = state.feedback.length
    ? state.feedback.map(f => `
      <div class="feedback">
        <b>${esc(f.type || 'Feedback')}</b>
        <div class="sub">${esc(f.message || '')}</div>
        <div class="sub">
          ${esc(f.name || 'User')} ·
          ${esc(f.mobile || '')} ·
          ${esc(formatDate(f.created_at))}
        </div>
      </div>
    `).join('')
    : '<div class="empty">No feedback yet.</div>';
}

function toLocalDateTime(v){ if(!v) return ''; const d=new Date(v); if(isNaN(d)) return ''; const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }

function dateKey(v){
  if(!v)return '';
  let d;
  if(typeof v==='object'&&typeof v.toDate==='function')d=v.toDate();
  else if(typeof v==='object'&&Number.isFinite(Number(v._seconds??v.seconds)))d=new Date(Number(v._seconds??v.seconds)*1000);
  else d=new Date(v);
  return isNaN(d)?'':d.toISOString().slice(0,10);
}
function formatDate(v){
  if(!v) return '—';
  const d = (typeof v==='object'&&Number.isFinite(Number(v._seconds??v.seconds)))?new Date(Number(v._seconds??v.seconds)*1000):new Date(v);
  return isNaN(d)
    ? '—'
    : d.toLocaleString('en-IN', {
        dateStyle:'medium',
        timeStyle:'short'
      });
}

function closeModal(){
  $('modal').classList.add('hidden');
  window._adImage = '';
}

// Bind the login form explicitly. Without this handler, the browser submits
// the HTML form and reloads the page instead of calling the Render login API.
const loginForm = $('loginForm');
if (loginForm && loginForm.dataset.absLoginBound !== '1') {
  loginForm.dataset.absLoginBound = '1';
  loginForm.addEventListener('submit', event => {
    event.preventDefault();
    login();
  });
}

if(adminToken){
  // Restore the Render JWT session; refreshAdmin will validate it with the API.
  showAdmin();
}else{
  showLogin();
}

window.login = login;
window.refreshAdmin = refreshAdmin;
window.addEventListener('DOMContentLoaded', () => {
  [...document.querySelectorAll('button')].filter(btn => /refresh/i.test(`${btn.textContent || ''} ${btn.getAttribute('onclick') || ''}`)).forEach(btn => {
    if(btn.dataset.absRefreshBound === '1') return;
    btn.dataset.absRefreshBound = '1';
    btn.addEventListener('click', () => { refreshAdmin(); });
  });
});
window.adminLogout = adminLogout;
window.openCreateUser = openCreateUser;
window.openUserManager = openUserManager;
window.toggleVerified = toggleVerified;
window.changePassword = changePassword;
window.deleteUser = deleteUser;
window.saveUser = saveUser;
window.createUser = createUser;
window.openAdModal = openAdModal;
window.saveAd = saveAd;
window.toggleAd = toggleAd;
window.deleteAd = deleteAd;
window.closeModal = closeModal;
