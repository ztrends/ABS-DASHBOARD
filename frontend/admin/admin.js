const API_BASE = 'https://abs-dashboard-t7up.onrender.com/api';
const ADMIN_UID = '5OjOnepPFOYe49OspKbpBWy3x2e2';

const $ = id => document.getElementById(id);
let adminToken = sessionStorage.getItem('abs_admin_token') || '';
let state = { users: [], feedback: [], ads: [], summary: {} };

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const escAttr = v => esc(v).replace(/`/g, '&#96;');

function ensureFirebase(){
  if(!window.firebase) throw new Error('Firebase SDK is not loaded.');
  if(!firebase.apps.length){
    firebase.initializeApp(window.ABS_FIREBASE_CONFIG);
  }
}

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

    ensureFirebase();

    const cred = await firebase.auth().signInWithEmailAndPassword(
      username,
      password
    );

    if(cred.user.uid !== ADMIN_UID){
      await firebase.auth().signOut();
      throw new Error('Administrator authorization failed.');
    }

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
  try{
    ensureFirebase();
    if(firebase.auth().currentUser) await firebase.auth().signOut();
  }catch{}
  adminToken = '';
  sessionStorage.removeItem('abs_admin_token');
  showLogin();
}

async function refreshAdmin(){
  try{
    ensureFirebase();

    const current = firebase.auth().currentUser;
    if(!current || current.uid !== ADMIN_UID){
      throw new Error('Administrator authorization failed.');
    }

    const snap = await firebase.firestore().collection('users').get();

    state.users = snap.docs.map(doc => ({
      uid: doc.id,
      ...doc.data()
    }));

    const ads = await api('/ads').catch(() => ({items:[]}));
    state.ads = ads.items || [];

    const feedback = await api('/admin/feedback').catch(() => ({items:[]}));
    state.feedback = feedback.items || [];

    state.summary = {
      users: state.users.length,
      verified: state.users.filter(u => u.verified === true).length,
      premium: state.users.filter(u => u.premium === true).length,
      feedback: state.feedback.length,
      ads: state.ads.filter(a => a.active).length
    };

    renderStats();
    renderUsers();
    renderAds();
    renderFeedback();

  }catch(e){
    console.error(e);
    $('loginMsg').textContent = e.message || 'Unable to load admin data.';
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
              ${u.premium ? 'PREMIUM' : 'STANDARD'}
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

      <button class="btn ok"
        onclick="togglePremium('${escAttr(u.uid)}',${!u.premium})">
        ${u.premium ? 'REMOVE PREMIUM' : 'MAKE PREMIUM'}
      </button>
    </div>

    <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">

    <div class="sub">
      Password reset and account deletion require Firebase Admin
      privileges on the server. They are not executed through the
      browser-only admin page.
    </div>
  `;

  $('modal').classList.remove('hidden');
}

async function saveUser(uid){
  const name = $('editName').value.trim();
  const absId = $('editAbsId').value.trim();

  if(!name || !absId){
    return $('userMsg').textContent =
      'Name and ABS ID are required.';
  }

  try{
    ensureFirebase();

    await firebase.firestore()
      .collection('users')
      .doc(uid)
      .set({
        name,
        absId,
        lastActive: new Date().toISOString()
      }, {merge:true});

    closeModal();
    await refreshAdmin();

  }catch(e){
    console.error(e);
    $('userMsg').textContent =
      e.message || 'Unable to update user.';
  }
}

async function toggleVerified(uid, value){
  try{
    ensureFirebase();

    await firebase.firestore()
      .collection('users')
      .doc(uid)
      .set({
        verified: !!value
      }, {merge:true});

    await refreshAdmin();

  }catch(e){
    console.error(e);
    alert(e.message || 'Unable to update verification.');
  }
}

async function togglePremium(uid, value){
  try{
    ensureFirebase();

    await firebase.firestore()
      .collection('users')
      .doc(uid)
      .set({
        premium: !!value
      }, {merge:true});

    closeModal();
    await refreshAdmin();

  }catch(e){
    console.error(e);
    alert(e.message || 'Unable to update premium.');
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

function deleteUser(){
  $('modalTitle').textContent = 'Delete User Account';
  $('modalBody').innerHTML = `
    <div class="msg">
      Account deletion is not connected to Firebase Admin yet.
      The Firebase Authentication account must be deleted from
      a trusted server/Admin SDK.
    </div>
  `;
}

async function openCreateUser(){
  $('modalTitle').textContent = 'Create User Account';

  $('modalBody').innerHTML = `
    <label>Name</label>
    <input id="createUserName"
      type="text"
      placeholder="Enter user name">

    <label>Mobile Number</label>
    <input id="createUserMobile"
      type="tel"
      inputmode="numeric"
      maxlength="10"
      placeholder="10-digit mobile number">

    <label>Password</label>
    <input id="createUserPassword"
      type="password"
      placeholder="Minimum 6 characters">

    <div id="createUserMsg" class="msg"></div>

    <button
      class="btn full"
      style="margin-top:16px"
      onclick="submitCreateUser()">
      CREATE USER
    </button>
  `;

  $('modal').classList.remove('hidden');
}

async function submitCreateUser(){
  const name = $('createUserName').value.trim();
  const mobile = $('createUserMobile').value.trim();
  const password = $('createUserPassword').value;

  const msg = $('createUserMsg');
  msg.textContent = '';

  if(!name){
    return msg.textContent = 'Enter user name.';
  }

  if(!/^[6-9]\d{9}$/.test(mobile)){
    return msg.textContent =
      'Enter a valid 10-digit Indian mobile number.';
  }

  if(password.length < 6){
    return msg.textContent =
      'Password must be at least 6 characters.';
  }

  try{
    const result = await api('/admin/firebase-users',{
      method:'POST',
      body:JSON.stringify({
        name,
        mobile,
        password
      })
    });

    alert(
      `User created successfully!\n\n` +
      `Name: ${result.user.name}\n` +
      `Mobile: ${result.user.mobile}\n` +
      `ABS ID: ${result.user.absId}`
    );

    closeModal();
    await refreshAdmin();

  }catch(e){
    console.error('Create user failed:',e);
    msg.textContent =
      e.message || 'Unable to create user.';
  }
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

if(adminToken){
  ensureFirebase();
  firebase.auth().onAuthStateChanged(user => {
    if(user && user.uid === ADMIN_UID){
      showAdmin();
    }else{
      showLogin();
    }
  });
}else{
  showLogin();
}

window.login = login;
window.refreshAdmin = refreshAdmin;
window.adminLogout = adminLogout;
window.openCreateUser = openCreateUser;
window.openUserManager = openUserManager;
window.toggleVerified = toggleVerified;
window.togglePremium = togglePremium;
window.changePassword = changePassword;
window.deleteUser = deleteUser;
window.saveUser = saveUser;
window.createUser = createUser;
window.openAdModal = openAdModal;
window.saveAd = saveAd;
window.toggleAd = toggleAd;
window.deleteAd = deleteAd;
window.closeModal = closeModal;
