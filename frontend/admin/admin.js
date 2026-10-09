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
}

function renderUsers(){
  const list = state.users;

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

  $('modal').classList.remove('hidden');
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

  const body = {
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
