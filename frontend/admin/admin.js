const API_BASE = 'https://abs-dashboard-t7up.onrender.com/api';

const $ = id => document.getElementById(id);
let adminToken = sessionStorage.getItem('abs_admin_token') || '';
let state = { users: [], feedback: [], ads: [], summary: {}, tweets: [], activity: [], chatContacts: [], selectedChatUid: '', chatPollTimer: null, update: null };
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
    const [adsResult, feedbackResult, activityResult, tweetsResult, updateResult] = await Promise.allSettled([
      api('/admin/ads'), api('/admin/feedback'), api('/admin/activity'), api('/admin/tweets'), api('/app-update')
    ]);
    if(adsResult.status === 'fulfilled') state.ads = Array.isArray(adsResult.value.items) ? adsResult.value.items : [];
    else { state.ads = []; warnings.push(`banners: ${adsResult.reason?.message || 'failed'}`); }
    if(feedbackResult.status === 'fulfilled') state.feedback = Array.isArray(feedbackResult.value.items) ? feedbackResult.value.items : [];
    else { state.feedback = []; warnings.push(`feedback: ${feedbackResult.reason?.message || 'failed'}`); }
    if(activityResult.status === 'fulfilled') state.activity = Array.isArray(activityResult.value.items) ? activityResult.value.items : [];
    else { state.activity = []; warnings.push(`activity: ${activityResult.reason?.message || 'failed'}`); }
    if(tweetsResult.status === 'fulfilled') state.tweets = Array.isArray(tweetsResult.value.items) ? tweetsResult.value.items : [];
    else { state.tweets = []; warnings.push(`tweets: ${tweetsResult.reason?.message || 'failed'}`); }
    if(updateResult.status === 'fulfilled') state.update = updateResult.value || null;
    else { state.update = null; warnings.push(`app update: ${updateResult.reason?.message || 'failed'}`); }

    const today = adminDayKey(new Date());
    const activityToday = new Set(state.activity.filter(x => String(x.date || x.at || '').slice(0,10) === today).map(x => x.uid || x.absId || x.id));
    const newToday = state.users.filter(u => adminDayKey(u.createdAt || u.created_at) === today).length;
    state.summary = {
      users: state.users.length,
      verified: state.users.filter(u => u.verified === true).length,
      premium: state.users.filter(u => u.premium === true || u.verified === true).length,
      feedback: state.feedback.length,
      ads: state.ads.filter(a => a.active === true || a.active === 1).length,
      tweets: state.tweets.length,
      activeToday: activityToday.size,
      newToday
    };

    renderStats(); renderUsers(); renderAds(); renderFeedback(); renderActivity(); renderAdminTweets(); renderCurrentAppUpdate();
    if($('chatContacts') && (!state.chatContacts.length || state.chatContacts.length !== state.users.length)) loadAdminChats(true);
    setAdminRefreshStatus(warnings.length
      ? `Data refreshed; some sections could not load (${warnings.join('; ')}).`
      : `Updated just now · ${state.users.length} users · ${state.tweets.length} Tweets · ${state.ads.length} banners.`, warnings.length > 0);

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
  const put=(id,value)=>{const n=$(id);if(n)n.textContent=String(value??0)};
  put('userCount',s.users);put('feedbackCount',s.feedback);put('adCount',s.ads);put('verifiedCount',s.verified);put('requestCount',s.premium);put('activeToday',s.activeToday);put('newToday',s.newToday);put('tweetCount',s.tweets);
}

function renderUsers(){
  const query = String($('userSearch')?.value || '').trim().toLowerCase();
  const list = state.users.filter(u => !query || [u.absId,u.name,u.mobile,u.uid].some(v => String(v || '').toLowerCase().includes(query)));

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
          Created: ${esc(formatDate(u.createdAt))}
        </div>

        <div class="row">
          <button class="btn"
            onclick="openUserManager('${escAttr(u.uid)}')">
            VIEW / MANAGE
          </button>

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

function adminDayKey(value){
  if(!value)return '';
  const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value).slice(0,10);
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
function switchAdminSection(name){
  const valid=['dashboard','users','chats','tweets','update','ads','feedback'];
  if(!valid.includes(name))name='dashboard';
  document.querySelectorAll('[data-admin-section]').forEach(s=>s.classList.toggle('hidden-section',s.dataset.adminSection!==name));
  document.querySelectorAll('[data-admin-tab]').forEach(t=>t.classList.toggle('active',t.dataset.adminTab===name));
  if(name==='chats')loadAdminChats();
  if(name==='tweets')loadAdminTweets();
  if(name==='update')loadCurrentAppUpdate();
  if(name==='dashboard')loadActivity();
  if(name!=='chats' && state.chatPollTimer){clearInterval(state.chatPollTimer);state.chatPollTimer=null;}
  if(name==='chats' && state.selectedChatUid)startAdminChatPolling();
  window.scrollTo({top:0,behavior:'smooth'});
}
function renderActivity(){
  const today=adminDayKey(new Date());
  const daily=new Map();
  for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const key=adminDayKey(d);daily.set(key,{key,label:new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',weekday:'short'}).format(d),count:0});}
  for(const item of state.activity){const key=String(item.date||item.at||'').slice(0,10);if(daily.has(key))daily.get(key).count++;}
  const bars=[...daily.values()],max=Math.max(1,...bars.map(x=>x.count));
  const host=$('activityChart');if(host)host.innerHTML=bars.map((x,i)=>`<div class="activity-col" title="${esc(x.key)}: ${x.count} active users"><b>${x.count}</b><div class="activity-bar" style="height:${Math.max(5,Math.round(x.count/max*82))}px;animation-delay:${i*45}ms"></div><small>${esc(x.label)}</small></div>`).join('');
  const recent=$('recentActivity');if(recent){const items=[...state.activity].sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))).slice(0,12);const byUid=new Map(state.users.map(u=>[u.uid,u]));recent.innerHTML=items.length?items.map(x=>{const u=byUid.get(x.uid)||{};return `<div class="feedback"><b>${esc(x.absId||u.absId||'ABS USER')}</b><div class="sub">${esc(u.name||'User')} · ${esc(u.mobile||'')} · ${esc(x.source||'app-open')}</div><div class="sub">${esc(formatDate(x.at))}</div></div>`}).join(''):'<div class="empty">No recorded activity yet. Activity begins after users open the updated app.</div>'}
  const activeToday=new Set(state.activity.filter(x=>String(x.date||x.at||'').slice(0,10)===today).map(x=>x.uid||x.absId||x.id)).size;
  if(state.summary)state.summary.activeToday=activeToday;
  const n=$('activeToday');if(n)n.textContent=String(activeToday);
}
async function loadActivity(){try{const d=await api('/admin/activity');state.activity=Array.isArray(d.items)?d.items:[];renderActivity()}catch(e){const host=$('activityChart');if(host)host.innerHTML='<div class="empty">Activity history is not available right now.</div>';console.warn('Activity load failed:',e.message)}}
function renderAdminTweets(){
  const host=$('adminTweets');if(!host)return;
  const rows=[...(state.tweets||[])].sort((a,b)=>Number(b.createdAtMs||0)-Number(a.createdAtMs||0));
  host.innerHTML=rows.length?rows.map(t=>`<article class="tweet-admin"><div class="tweet-admin-head"><div class="chat-contact-avatar">𝕏</div><div><div class="tweet-admin-id">${esc(t.absId||'ABS USER')}${t.verified?'<span class="verify">✓</span>':''}</div><time>${esc(formatDate(t.createdAt))}</time></div></div><p>${esc(t.text||'')}</p><div class="row"><span class="badge">${t.postedByAdmin?'ADMIN POST':'PUBLIC TWEET'}</span><button type="button" class="btn danger" data-admin-delete-tweet="${escAttr(t.id)}">Delete Tweet</button></div></article>`).join(''):'<div class="empty">No Tweets to show. Post the first community update above.</div>';
  host.querySelectorAll('[data-admin-delete-tweet]').forEach(btn=>btn.addEventListener('click',async()=>{if(!confirm('Permanently delete this Tweet for every user?'))return;btn.disabled=true;try{await api(`/admin/tweets/${encodeURIComponent(btn.dataset.adminDeleteTweet)}`,{method:'DELETE'});state.tweets=state.tweets.filter(t=>t.id!==btn.dataset.adminDeleteTweet);state.summary.tweets=state.tweets.length;renderAdminTweets();renderStats();setAdminRefreshStatus('Tweet permanently deleted.')}catch(e){alert(e.message||'Unable to delete Tweet.')}finally{btn.disabled=false}}));
  const count=$('tweetCount');if(count)count.textContent=String(rows.length);
}
async function loadAdminTweets(){try{const d=await api('/admin/tweets');state.tweets=Array.isArray(d.items)?d.items:[];state.summary.tweets=state.tweets.length;renderAdminTweets();renderStats()}catch(e){const host=$('adminTweets');if(host)host.innerHTML=`<div class="empty">Could not load Tweets: ${esc(e.message||'request failed')}</div>`}}
function renderCurrentAppUpdate(){
  const host=$('currentAppUpdate');if(!host)return;const d=state.update;
  host.innerHTML=d?.available?`<div class="update-orb">⬆</div><div><h3>Version ${esc(d.version||'Available')} is published</h3><p>${esc(d.notes||'No release notes provided.')}<br>Uploaded ${esc(formatDate(d.uploadedAt))} · ${Math.max(0,Math.round(Number(d.size||0)/1024/1024))} MB</p></div>`:`<div class="update-orb">⬆</div><div><h3>No APK update published</h3><p>Upload an APK below. Users can check it from Profile → Update.</p></div>`;
  if(d?.available && $('appUpdateVersion') && !$('appUpdateVersion').value)$('appUpdateVersion').value=d.version||'';
  if(d?.available && $('appUpdateNotes') && !$('appUpdateNotes').value)$('appUpdateNotes').value=d.notes||'';
}
async function loadCurrentAppUpdate(){try{state.update=await api('/app-update');renderCurrentAppUpdate()}catch(e){const host=$('currentAppUpdate');if(host)host.innerHTML=`<div class="update-orb">!</div><div><h3>Update status unavailable</h3><p>${esc(e.message||'Please retry.')}</p></div>`}}
async function loadAdminChats(silent=false){
  try{
    const d=await api('/admin/support-chats');state.chatContacts=Array.isArray(d.items)?d.items:[];
    renderChatContacts();
    if(state.selectedChatUid)await refreshAdminChat(true);
    if(!silent&&state.selectedChatUid)startAdminChatPolling();
  }catch(e){const host=$('chatContacts');if(host)host.innerHTML=`<div class="empty">Unable to load chat list: ${esc(e.message||'request failed')}</div>`}
}
function renderChatContacts(){
  const host=$('chatContacts');if(!host)return;
  const q=String($('chatUserSearch')?.value||'').trim().toLowerCase();
  const rows=state.chatContacts.filter(u=>!q||[u.absId,u.name,u.mobile,u.uid,u.lastMessage?.text].some(v=>String(v||'').toLowerCase().includes(q))).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  host.innerHTML=rows.length?rows.map(u=>`<button type="button" class="chat-contact ${state.selectedChatUid===u.uid?'active':''}" data-open-admin-chat="${escAttr(u.uid)}"><span class="chat-contact-avatar">${esc(String(u.absId||u.name||'U').slice(0,1).toUpperCase())}</span><span class="chat-contact-info"><b>${esc(u.absId||'ABS USER')}${u.verified?'<span class="verify">✓</span>':''}</b><small>${esc(u.lastMessage?.text||u.name||u.mobile||'No messages yet')}</small><em>${esc(u.updatedAt?formatDate(u.updatedAt):'No conversation yet')}</em></span></button>`).join(''):'<div class="empty">No matching customer found.</div>';
  host.querySelectorAll('[data-open-admin-chat]').forEach(btn=>btn.addEventListener('click',()=>openAdminChat(btn.dataset.openAdminChat)));
}
async function openAdminChat(uid){
  state.selectedChatUid=uid;renderChatContacts();
  const u=state.chatContacts.find(x=>x.uid===uid);if($('adminChatTitle'))$('adminChatTitle').textContent=u?.absId||'ABS USER';if($('adminChatSub'))$('adminChatSub').textContent=`${u?.name||'Customer'} · ${u?.mobile||''}`;
  if($('adminChatReply'))$('adminChatReply').disabled=false;if($('adminChatSend'))$('adminChatSend').disabled=false;
  if($('adminChatMessages'))$('adminChatMessages').innerHTML='<div class="chat-empty">Loading conversation…</div>';
  await refreshAdminChat(false);startAdminChatPolling();
}
function drawAdminChat(messages){
  const host=$('adminChatMessages');if(!host)return;const atBottom=host.scrollHeight-host.scrollTop-host.clientHeight<70;
  host.innerHTML=(messages||[]).map(m=>`<div class="chat-bubble-row ${m.from==='admin'?'admin':'user'}"><div class="chat-bubble"><p>${esc(m.text||'')}</p><time>${esc(m.createdAt?new Date(m.createdAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'')}</time></div></div>`).join('')||'<div class="chat-empty">No messages yet. Send the first reply to start this conversation.</div>';
  if(atBottom||!host.dataset.absRendered){host.scrollTop=host.scrollHeight;host.dataset.absRendered='1'}
}
async function refreshAdminChat(silent=true){
  const uid=state.selectedChatUid;if(!uid||!adminToken)return;
  try{const d=await api(`/admin/support-chats/${encodeURIComponent(uid)}`);drawAdminChat(d.messages||[]);const c=state.chatContacts.find(x=>x.uid===uid);if(c){c.updatedAt=d.updatedAt||c.updatedAt;const last=(d.messages||[]).at(-1);if(last)c.lastMessage={text:last.text,from:last.from,createdAt:last.createdAt};renderChatContacts()}}
  catch(e){if(!silent&&$('adminChatMessages'))$('adminChatMessages').innerHTML=`<div class="chat-empty">${esc(e.message||'Unable to load conversation')}</div>`}
}
function startAdminChatPolling(){if(state.chatPollTimer)clearInterval(state.chatPollTimer);state.chatPollTimer=setInterval(()=>{if(document.hidden||!state.selectedChatUid||document.querySelector('[data-admin-section="chats"]')?.classList.contains('hidden-section'))return;loadAdminChats(true)},3000)}
async function sendAdminChat(event){
  event.preventDefault();const input=$('adminChatReply'),text=String(input?.value||'').trim(),uid=state.selectedChatUid;if(!uid||!text)return;
  const btn=$('adminChatSend');if(btn)btn.disabled=true;
  try{await api(`/admin/support-chats/${encodeURIComponent(uid)}`,{method:'POST',body:JSON.stringify({text})});input.value='';await refreshAdminChat(false);setAdminRefreshStatus('Support reply sent and saved.')}catch(e){alert(e.message||'Message was not sent.')}finally{if(btn)btn.disabled=!state.selectedChatUid}
}
async function uploadCurrentApk(event){
  event.preventDefault();const file=$('appUpdateFile')?.files?.[0],version=String($('appUpdateVersion')?.value||'').trim(),notes=String($('appUpdateNotes')?.value||'').trim(),msg=$('appUpdateMsg'),btn=$('uploadAppUpdate');
  if(!file||!file.name.toLowerCase().endsWith('.apk')){if(msg)msg.textContent='Please select a valid .apk file.';return}
  if(!version){if(msg)msg.textContent='Enter a version label first.';return}
  if(file.size>120*1024*1024){if(msg)msg.textContent='APK must be 120 MB or smaller.';return}
  if(btn)btn.disabled=true;if(msg)msg.textContent='Uploading APK securely to Firebase Storage…';$('appUpdateProgress')?.classList.remove('hidden');
  try{const fd=new FormData();fd.append('apk',file);fd.append('version',version);fd.append('notes',notes);const r=await fetch(`${API_BASE}/admin/app-update`,{method:'POST',headers:{Authorization:`Bearer ${adminToken}`},body:fd});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Upload failed (${r.status})`);state.update={available:true,...d.update};renderCurrentAppUpdate();if(msg)msg.textContent='APK uploaded successfully. Users can now open Profile → Update to see this version.';$('appUpdateFile').value='';setAdminRefreshStatus(`Published APK update ${version}.`)}catch(e){if(msg)msg.textContent=e.message||'APK upload failed.'}finally{if(btn)btn.disabled=false;$('appUpdateProgress')?.classList.add('hidden')}
}
function bindAdminFeatures(){
  document.querySelectorAll('[data-admin-tab]').forEach(b=>b.addEventListener('click',()=>switchAdminSection(b.dataset.adminTab)));
  $('userSearch')?.addEventListener('input',renderUsers);$('chatUserSearch')?.addEventListener('input',renderChatContacts);
  $('adminChatForm')?.addEventListener('submit',sendAdminChat);
  $('adminTweetText')?.addEventListener('input',()=>{const c=$('adminTweetCount');if(c)c.textContent=`${$('adminTweetText').value.length}/280`});
  $('adminTweetForm')?.addEventListener('submit',async e=>{e.preventDefault();const text=String($('adminTweetText')?.value||'').trim(),msg=$('adminTweetMsg'),btn=$('adminTweetPost');if(!text)return;if(btn)btn.disabled=true;if(msg)msg.textContent='Publishing Tweet…';try{await api('/admin/tweets',{method:'POST',body:JSON.stringify({text})});$('adminTweetText').value='';$('adminTweetCount').textContent='0/280';if(msg)msg.textContent='Tweet published to the ABS community.';await loadAdminTweets();setAdminRefreshStatus('Admin Tweet published.')}catch(err){if(msg)msg.textContent=err.message||'Tweet could not be published.'}finally{if(btn)btn.disabled=false}});
  $('appUpdateForm')?.addEventListener('submit',uploadCurrentApk);
}

function toLocalDateTime(v){ if(!v) return ''; const d=new Date(v); if(isNaN(d)) return ''; const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }

function formatDate(v){
  if(!v) return '—';
  const d = new Date(v);
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

bindAdminFeatures();

if(adminToken){
  // Restore the Render JWT session; refreshAdmin will validate it with the API.
  showAdmin();
}else{
  showLogin();
}

window.login = login;
window.refreshAdmin = refreshAdmin;
window.switchAdminSection = switchAdminSection;
window.loadAdminTweets = loadAdminTweets;
window.loadAdminChats = loadAdminChats;
window.loadCurrentAppUpdate = loadCurrentAppUpdate;
window.openAdminChat = openAdminChat;
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
