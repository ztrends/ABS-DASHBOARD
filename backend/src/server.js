const path=require('path');
const fs=require('fs');
const express=require('express');
const cors=require('cors');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const Database=require('better-sqlite3');
const rateLimit=require('express-rate-limit');
const firebaseAdmin=require('firebase-admin');

const ROOT=path.join(__dirname,'..');
const DB_DIR=path.join(ROOT,'data'); fs.mkdirSync(DB_DIR,{recursive:true});
const db=new Database(path.join(DB_DIR,'abs-dashboard.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, abs_id TEXT UNIQUE, name TEXT NOT NULL, mobile TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0, premium INTEGER NOT NULL DEFAULT 0, avatar TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS transactions(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,date TEXT,type TEXT NOT NULL,category TEXT,description TEXT,amount REAL NOT NULL,payment_mode TEXT,person_name TEXT,ledger_direction TEXT,created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS loans(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,name TEXT NOT NULL,principal REAL DEFAULT 0,interest REAL DEFAULT 0,emi REAL DEFAULT 0,start_date TEXT,end_date TEXT,status TEXT DEFAULT 'Active',created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS feedback(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,name TEXT,mobile TEXT,type TEXT,rating INTEGER,message TEXT,created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS ads(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT,text TEXT,badge TEXT,image TEXT,link TEXT,active INTEGER DEFAULT 1,starts_at TEXT,ends_at TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,message TEXT NOT NULL,type TEXT NOT NULL DEFAULT 'announcement',link TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS support_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,firebase_uid TEXT NOT NULL,abs_id TEXT NOT NULL DEFAULT '',name TEXT NOT NULL DEFAULT '',mobile TEXT NOT NULL,issue TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'open',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
`);
// Safe migrations for existing Render SQLite databases.
const adColumns = new Set(db.prepare('PRAGMA table_info(ads)').all().map(c=>c.name));
if(!adColumns.has('starts_at')) db.exec('ALTER TABLE ads ADD COLUMN starts_at TEXT');
if(!adColumns.has('ends_at')) db.exec('ALTER TABLE ads ADD COLUMN ends_at TEXT');
const JWT_SECRET=process.env.JWT_SECRET||'CHANGE_THIS_ABS_SECRET_IN_PRODUCTION';
const ADMIN_USER=process.env.ADMIN_USER||'riyazalipvt@gmail.com';
const ADMIN_PASS=process.env.ADMIN_PASS||'Shkriyaz@abs70';
const FIREBASE_ADMIN_UID=process.env.FIREBASE_ADMIN_UID||'5OjOnepPFOYe49OspKbpBWy3x2e2';
function now(){return new Date().toISOString()}
function getFirebaseAdmin(){
  if(firebaseAdmin.apps.length) return firebaseAdmin;
  // Prefer an Environment Variable if supplied; otherwise use Render Secret File.
  // Render mounts Secret Files under /etc/secrets/<filename>.
  let raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const secretFile=process.env.FIREBASE_SERVICE_ACCOUNT_FILE||'/etc/secrets/firebase-service-account.json';
  if(!raw && fs.existsSync(secretFile)){
    raw=fs.readFileSync(secretFile,'utf8');
  }
  if(!raw){
    const err=new Error('Firebase Admin is not configured. Add a FIREBASE_SERVICE_ACCOUNT_JSON environment variable or provide the Render Secret File /etc/secrets/firebase-service-account.json.');
    err.code='FIREBASE_ADMIN_NOT_CONFIGURED';
    throw err;
  }
  let serviceAccount;
  try{serviceAccount=JSON.parse(raw)}catch(e){
    const err=new Error('Firebase service-account credentials are not valid JSON. Check the FIREBASE_SERVICE_ACCOUNT_JSON value or firebase-service-account.json Secret File.');
    err.code='FIREBASE_ADMIN_BAD_CREDENTIALS';
    throw err;
  }
  firebaseAdmin.initializeApp({
    credential:firebaseAdmin.credential.cert(serviceAccount),
    projectId:process.env.FIREBASE_PROJECT_ID||serviceAccount.project_id||'abs-dashboard-dd0b2'
  });
  return firebaseAdmin;
}
function publicAdminError(res,e){
  console.error('Firebase Admin operation failed:',e);
  if(e.code==='FIREBASE_ADMIN_NOT_CONFIGURED'||e.code==='FIREBASE_ADMIN_BAD_CREDENTIALS'){
    return res.status(503).json({error:e.message});
  }
  if(e.code==='auth/user-not-found'||e.code==='not-found'){
    return res.status(404).json({error:'Firebase user/profile was not found.'});
  }
  return res.status(500).json({error:e.message||'Firebase Admin operation failed.'});
}

function nextAbsId(mobile){const last=mobile.slice(-2); const row=db.prepare("SELECT COUNT(*) c FROM users WHERE mobile LIKE ?").get('%'); return `ABS${last}${1001+row.c}`}
function sign(u){return jwt.sign({sub:u.id,mobile:u.mobile,role:'user'},JWT_SECRET,{expiresIn:'7d'})}
function auth(req,res,next){try{const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))throw 0;const p=jwt.verify(h.slice(7),JWT_SECRET);const u=db.prepare('SELECT id,abs_id,name,mobile,verified,premium,avatar,created_at FROM users WHERE id=?').get(p.sub);if(!u)throw 0;req.user=u;next()}catch(e){res.status(401).json({error:'Unauthorized'})}}
function admin(req,res,next){try{const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))throw 0;const p=jwt.verify(h.slice(7),JWT_SECRET);if(p.role!=='admin')throw 0;next()}catch(e){res.status(401).json({error:'Admin authorization required'})}}
async function firebaseUserAuth(req,res,next){try{const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return res.status(401).json({error:'Please login to ABS first.'});const sdk=getFirebaseAdmin();const decoded=await sdk.auth().verifyIdToken(h.slice(7));const snap=await sdk.firestore().collection('users').doc(decoded.uid).get();const profile=snap.exists?(snap.data()||{}):{};req.firebaseUser={uid:decoded.uid,absId:String(profile.absId||profile.abs_id||profile.absID||'').trim(),verified:profile.verified===true,name:String(profile.name||'')};if(!req.firebaseUser.absId)req.firebaseUser.absId='ABS USER';next()}catch(e){console.error('ABS notification auth failed:',e.message);res.status(401).json({error:'Session could not be verified. Please sign in again.'})}}
const app=express();
app.use(cors()); app.use(express.json({limit:'10mb'}));
app.use('/api/auth/',rateLimit({windowMs:15*60*1000,max:100}));
app.get('/api/health',(req,res)=>res.json({ok:true,service:'ABS DASHBOARD API',time:now()}));
app.post('/api/auth/register',(req,res)=>{const {name,mobile,password}=req.body||{};if(!name||!/^[6-9]\d{9}$/.test(String(mobile||''))||String(password||'').length<6)return res.status(400).json({error:'Name, valid 10-digit mobile and 6+ character password are required'});if(db.prepare('SELECT 1 FROM users WHERE mobile=?').get(mobile))return res.status(409).json({error:'Mobile number already registered'});const created=now(),hash=bcrypt.hashSync(password,12),absId=nextAbsId(String(mobile));const info=db.prepare('INSERT INTO users(abs_id,name,mobile,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(absId,name,mobile,hash,created,created);const u=db.prepare('SELECT id,abs_id,name,mobile,verified,premium,avatar,created_at FROM users WHERE id=?').get(info.lastInsertRowid);res.status(201).json({user:u,token:sign(u)})});
app.post('/api/auth/login',(req,res)=>{const {identifier,password}=req.body||{};const u=db.prepare('SELECT * FROM users WHERE mobile=? OR abs_id=?').get(identifier,identifier);if(!u||!bcrypt.compareSync(password||'',u.password_hash))return res.status(401).json({error:'Incorrect login details'});res.json({user:{id:u.id,abs_id:u.abs_id,name:u.name,mobile:u.mobile,verified:!!u.verified,premium:!!u.premium,avatar:u.avatar,created_at:u.created_at},token:sign(u)})});
app.get('/api/me',auth,(req,res)=>res.json({user:req.user}));
app.put('/api/me',auth,(req,res)=>{const {name,avatar}=req.body||{};db.prepare('UPDATE users SET name=COALESCE(?,name),avatar=COALESCE(?,avatar),updated_at=? WHERE id=?').run(name||null,avatar||null,now(),req.user.id);res.json({user:db.prepare('SELECT id,abs_id,name,mobile,verified,premium,avatar,created_at FROM users WHERE id=?').get(req.user.id)})});
app.put('/api/me/password',auth,(req,res)=>{const {oldPassword,newPassword}=req.body||{};const row=db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);if(!bcrypt.compareSync(oldPassword||'',row.password_hash))return res.status(400).json({error:'Current password is incorrect'});if(String(newPassword||'').length<6)return res.status(400).json({error:'New password must be at least 6 characters'});db.prepare('UPDATE users SET password_hash=?,updated_at=? WHERE id=?').run(bcrypt.hashSync(newPassword,12),now(),req.user.id);res.json({ok:true})});
app.get('/api/transactions',auth,(req,res)=>res.json({items:db.prepare('SELECT * FROM transactions WHERE user_id=? ORDER BY date DESC,id DESC').all(req.user.id)}));
app.post('/api/transactions',auth,(req,res)=>{const x=req.body||{};if(!x.type||!Number.isFinite(Number(x.amount)))return res.status(400).json({error:'type and amount are required'});const info=db.prepare('INSERT INTO transactions(user_id,date,type,category,description,amount,payment_mode,person_name,ledger_direction,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(req.user.id,x.date||now().slice(0,10),x.type,x.category||'',x.description||'',Number(x.amount),x.payment_mode||'',x.person_name||'',x.ledger_direction||'',now());res.status(201).json({item:db.prepare('SELECT * FROM transactions WHERE id=?').get(info.lastInsertRowid)})});
app.delete('/api/transactions/:id',auth,(req,res)=>{db.prepare('DELETE FROM transactions WHERE id=? AND user_id=?').run(req.params.id,req.user.id);res.json({ok:true})});
app.get('/api/loans',auth,(req,res)=>res.json({items:db.prepare('SELECT * FROM loans WHERE user_id=? ORDER BY id DESC').all(req.user.id)}));
app.post('/api/loans',auth,(req,res)=>{const x=req.body||{};if(!x.name)return res.status(400).json({error:'Loan name is required'});const info=db.prepare('INSERT INTO loans(user_id,name,principal,interest,emi,start_date,end_date,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(req.user.id,x.name,Number(x.principal||0),Number(x.interest||0),Number(x.emi||0),x.start_date||'',x.end_date||'',x.status||'Active',now());res.status(201).json({item:db.prepare('SELECT * FROM loans WHERE id=?').get(info.lastInsertRowid)})});
app.get('/api/summary',auth,(req,res)=>{const t=db.prepare(`SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) income,COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) expense,COUNT(*) entries FROM transactions WHERE user_id=?`).get(req.user.id);res.json({...t,net:t.income-t.expense})});
app.post('/api/feedback',auth,(req,res)=>{const x=req.body||{};db.prepare('INSERT INTO feedback(user_id,name,mobile,type,rating,message,created_at) VALUES(?,?,?,?,?,?,?)').run(req.user.id,req.user.name,req.user.mobile,x.type||'Feedback',Number(x.rating||0),x.message||'',now());res.status(201).json({ok:true})});

// Customer Support requests from Firebase-authenticated ABS app users.
const SUPPORT_ISSUES=[
  'Password Change / Login Issue',
  'Income / Expense / Data Problem',
  'Statement / PDF Download Problem',
  'App Crash / Error',
  'Profile / Photo Problem',
  'Premium / Verification Request',
  'Notifications / Update Problem',
  'Request a Call',
  'Feature Request / Suggestion',
  'Other'
];
app.post('/api/support-requests',firebaseUserAuth,(req,res)=>{
  const x=req.body||{};
  let mobile=String(x.mobile||'').replace(/\D/g,'');
  if(mobile.length===12&&mobile.startsWith('91'))mobile=mobile.slice(2);
  const issue=String(x.issue||'').trim();
  const description=String(x.description||'').trim();
  if(!/^[6-9]\d{9}$/.test(mobile))return res.status(400).json({error:'Enter a valid 10-digit Indian mobile number.'});
  if(!SUPPORT_ISSUES.includes(issue))return res.status(400).json({error:'Please choose a valid support issue.'});
  if(description.length>1200)return res.status(400).json({error:'Description must be 1,200 characters or less.'});
  const stamp=now();
  const info=db.prepare('INSERT INTO support_requests(firebase_uid,abs_id,name,mobile,issue,description,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(req.firebaseUser.uid,req.firebaseUser.absId||'',req.firebaseUser.name||'',mobile,issue,description,'open',stamp,stamp);
  res.status(201).json({ok:true,id:Number(info.lastInsertRowid)});
});
// Notifications: broadcast admin notices to every authenticated ABS user; active ads appear here too.
app.get('/api/notifications',firebaseUserAuth,(req,res)=>{
  const stamp=now();
  const notices=db.prepare('SELECT id,title,message,type,link,active,created_at FROM notifications WHERE active=1 ORDER BY id DESC LIMIT 100').all();
  const ads=db.prepare("SELECT id,title,text,badge,image,link,created_at FROM ads WHERE active=1 AND (starts_at IS NULL OR starts_at='' OR starts_at<=?) AND (ends_at IS NULL OR ends_at='' OR ends_at>=?) ORDER BY id DESC LIMIT 100").all(stamp,stamp);
  const items=[
    ...notices.map(x=>({id:`notice-${x.id}`,source_id:String(x.id),type:x.type||'announcement',title:x.title,message:x.message,link:x.link||'',image:'',created_at:x.created_at})),
    ...ads.map(x=>({id:`ad-${x.id}`,source_id:String(x.id),type:'ad',title:x.title||x.badge||'ABS update',message:x.text||'A new update is available from ABS DASHBOARD.',link:x.link||'',image:x.image||'',created_at:x.created_at||stamp}))
  ].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,100);
  res.json({items});
});
app.get('/api/admin/notifications',admin,(req,res)=>res.json({items:db.prepare('SELECT id,title,message,type,link,active,created_at FROM notifications ORDER BY id DESC LIMIT 500').all().map(x=>({...x,active:!!x.active}))}));
app.post('/api/admin/notifications',admin,(req,res)=>{
  const x=req.body||{},title=String(x.title||'').trim(),message=String(x.message||'').trim(),link=String(x.link||'').trim();
  if(!title||!message)return res.status(400).json({error:'Notification title and message are required.'});
  if(title.length>120)return res.status(400).json({error:'Title must be 120 characters or less.'});
  if(message.length>2000)return res.status(400).json({error:'Message must be 2,000 characters or less.'});
  if(link&&!/^https:\/\//i.test(link))return res.status(400).json({error:'Link must start with https://'});
  const type=['update','announcement','important'].includes(String(x.type||''))?String(x.type):'announcement';
  const info=db.prepare('INSERT INTO notifications(title,message,type,link,active,created_at) VALUES(?,?,?,?,1,?)').run(title,message,type,link,now());
  res.status(201).json({ok:true,item:db.prepare('SELECT id,title,message,type,link,active,created_at FROM notifications WHERE id=?').get(info.lastInsertRowid)});
});
app.delete('/api/admin/notifications/:id',admin,(req,res)=>{const result=db.prepare('DELETE FROM notifications WHERE id=?').run(Number(req.params.id));if(!result.changes)return res.status(404).json({error:'Notification not found.'});res.json({ok:true})});
app.get('/api/ads',(req,res)=>{const stamp=now();res.json({items:db.prepare("SELECT id,title,text,badge,image,link,starts_at,ends_at FROM ads WHERE active=1 AND (starts_at IS NULL OR starts_at='' OR starts_at<=?) AND (ends_at IS NULL OR ends_at='' OR ends_at>=?) ORDER BY id DESC").all(stamp,stamp)});});
app.get('/api/admin/ads',admin,(req,res)=>res.json({items:db.prepare('SELECT id,title,text,badge,image,link,active,starts_at,ends_at,created_at FROM ads ORDER BY id DESC').all().map(x=>({...x,active:!!x.active}))}));
app.post('/api/admin/login',(req,res)=>{const {username,password}=req.body||{};if(username!==ADMIN_USER||password!==ADMIN_PASS)return res.status(401).json({error:'Invalid admin credentials'});res.json({token:jwt.sign({role:'admin'},JWT_SECRET,{expiresIn:'8h'})})});
app.get('/api/admin/users',admin,(req,res)=>res.json({items:db.prepare('SELECT id,abs_id,name,mobile,verified,premium,created_at,updated_at FROM users ORDER BY id DESC').all()}));
app.post('/api/admin/users',admin,(req,res)=>{const {name,mobile,password}=req.body||{};if(!name||!/^[6-9]\d{9}$/.test(String(mobile||''))||String(password||'').length<6)return res.status(400).json({error:'Name, valid 10-digit mobile and 6+ character password are required'});if(db.prepare('SELECT 1 FROM users WHERE mobile=?').get(mobile))return res.status(409).json({error:'Mobile number already registered'});const created=now(),hash=bcrypt.hashSync(password,12),absId=nextAbsId(String(mobile));const info=db.prepare('INSERT INTO users(abs_id,name,mobile,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(absId,name,mobile,hash,created,created);res.status(201).json({user:db.prepare('SELECT id,abs_id,name,mobile,verified,premium,created_at,updated_at FROM users WHERE id=?').get(info.lastInsertRowid)});});
app.get('/api/admin/summary',admin,(req,res)=>{const users=db.prepare('SELECT COUNT(*) c FROM users').get().c;const verified=db.prepare('SELECT COUNT(*) c FROM users WHERE verified=1').get().c;const premium=db.prepare('SELECT COUNT(*) c FROM users WHERE premium=1').get().c;const feedback=db.prepare('SELECT COUNT(*) c FROM feedback').get().c;const ads=db.prepare('SELECT COUNT(*) c FROM ads WHERE active=1').get().c;res.json({users,verified,premium,feedback,ads});});
// Firebase is the source of truth for accounts used by the GitHub Pages app.
app.get('/api/admin/firebase-users',admin,async(req,res)=>{
  try{
    const sdk=getFirebaseAdmin();
    const snap=await sdk.firestore().collection('users').get();
    const items=snap.docs.map(doc=>({uid:doc.id,...doc.data()}));
    res.json({items});
  }catch(e){publicAdminError(res,e)}
});

app.get('/api/admin/firebase-users/:uid/details',admin,async(req,res)=>{
  const uid=String(req.params.uid||'').trim();
  if(!uid) return res.status(400).json({error:'A Firebase UID is required.'});
  try{
    const sdk=getFirebaseAdmin();
    const userRef=sdk.firestore().collection('users').doc(uid);
    const [profileSnap,privateSnap]=await Promise.all([userRef.get(),userRef.collection('private').doc('data').get()]);
    if(!profileSnap.exists) return res.status(404).json({error:'Firebase user profile was not found.'});
    const profile=profileSnap.data()||{};
    const data=privateSnap.exists?(privateSnap.data()||{}):{};
    const income=Array.isArray(data.income)?data.income:[];
    const expenses=Array.isArray(data.expenses)?data.expenses:[];
    const emi=Array.isArray(data.emi)?data.emi:[];
    const loans=Array.isArray(data.loans)?data.loans:[];
    const ledger=Array.isArray(data.ledger)?data.ledger:[];
    const sum=arr=>arr.reduce((n,x)=>n+Number(x.amount||0),0);
    res.json({ok:true,user:{uid,...profile},summary:{income:sum(income),expense:sum(expenses),emi:sum(emi),loanPrincipal:loans.reduce((n,x)=>n+Number(x.principal||0),0),toReceive:ledger.filter(x=>['lena','receive'].includes(x.direction)).reduce((n,x)=>n+Number(x.amount||0),0),toPay:ledger.filter(x=>['dena','pay'].includes(x.direction)).reduce((n,x)=>n+Number(x.amount||0),0),entries:income.length+expenses.length+emi.length+loans.length+ledger.length},records:{income,expenses,emi,loans,ledger}});
  }catch(e){publicAdminError(res,e)}
});

app.patch('/api/admin/firebase-users/:uid',admin,async(req,res)=>{
  const uid=String(req.params.uid||'').trim();
  if(!uid) return res.status(400).json({error:'A Firebase UID is required.'});
  try{
    const sdk=getFirebaseAdmin();
    await sdk.auth().getUser(uid);
    const ref=sdk.firestore().collection('users').doc(uid);
    const snap=await ref.get();
    if(!snap.exists) return res.status(404).json({error:'Firebase profile was not found.'});
    const old=snap.data()||{};
    const input=req.body||{};
    const update={updatedAt:now()};
    if(typeof input.name==='string'){
      const name=input.name.trim();
      if(!name) return res.status(400).json({error:'Display name cannot be empty.'});
      update.name=name;
    }
    if(typeof input.absId==='string'){
      const absId=input.absId.trim();
      if(!absId) return res.status(400).json({error:'ABS ID cannot be empty.'});
      update.absId=absId;
    }
    if(typeof input.verified==='boolean'){
      update.verified=input.verified;
      // Blue tick and Premium are the same entitlement in this app.
      update.premium=input.verified;
    }
    const nameChanged=typeof update.name==='string'&&update.name!==String(old.name||'');
    const idChanged=typeof update.absId==='string'&&update.absId!==String(old.absId||'');
    const verificationChanged=typeof input.verified==='boolean'&&input.verified!==(old.verified===true);
    if(verificationChanged){
      update.adminNotice={
        id:`verification-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
        type:'verification',
        message:input.verified?'Your ABS account is now verified. Your blue tick and Premium access are unlocked.':'Admin has updated your ABS verification status.',
        updatedAt:now()
      };
    }else if(nameChanged||idChanged){
      update.adminNotice={
        id:`profile-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
        type:'profile',
        message:nameChanged?`Admin updated your display name to ${update.name}.`:'Admin updated your ABS account profile.',
        updatedAt:now()
      };
    }
    if(Object.keys(update).length===1) return res.status(400).json({error:'No supported user fields were provided.'});
    await ref.set(update,{merge:true});
    const after=await ref.get();
    res.json({ok:true,user:{uid,...after.data()}});
  }catch(e){publicAdminError(res,e)}
});

app.delete('/api/admin/firebase-users/:uid',admin,async(req,res)=>{
  const uid=String(req.params.uid||'').trim();
  if(!uid) return res.status(400).json({error:'A Firebase UID is required.'});
  if(uid===FIREBASE_ADMIN_UID) return res.status(403).json({error:'The administrator account cannot be deleted from this endpoint.'});
  try{
    const sdk=getFirebaseAdmin();
    let authDeleted=false;
    try{
      await sdk.auth().deleteUser(uid);
      authDeleted=true;
    }catch(e){
      // Allow cleanup of a profile whose Auth user was already removed.
      if(e.code!=='auth/user-not-found') throw e;
    }
    try{
      await sdk.firestore().recursiveDelete(sdk.firestore().collection('users').doc(uid));
    }catch(e){
      console.error('Firebase user data cleanup failed after Auth deletion:',e);
      return res.status(500).json({error:'Firebase Auth account was removed, but Firestore data cleanup failed. Check the Render service-account permissions and retry cleanup.',accountDeleted:authDeleted,uid});
    }
    res.json({ok:true,uid,authDeleted,dataDeleted:true});
  }catch(e){publicAdminError(res,e)}
});

app.patch('/api/admin/users/:id',admin,(req,res)=>{const {verified,premium,abs_id,name}=req.body||{};db.prepare('UPDATE users SET verified=COALESCE(?,verified),premium=COALESCE(?,premium),abs_id=COALESCE(?,abs_id),name=COALESCE(?,name),updated_at=? WHERE id=?').run(verified==null?null:(verified?1:0),premium==null?null:(premium?1:0),abs_id||null,name||null,now(),req.params.id);res.json({ok:true})});
app.delete('/api/admin/users/:id',admin,(req,res)=>{db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);res.json({ok:true})});
app.post('/api/admin/users/:id/reset-password',admin,(req,res)=>{const p=String(req.body?.password||'');if(p.length<6)return res.status(400).json({error:'Password must be at least 6 characters'});db.prepare('UPDATE users SET password_hash=?,updated_at=? WHERE id=?').run(bcrypt.hashSync(p,12),now(),req.params.id);res.json({ok:true})});
app.get('/api/admin/feedback',admin,(req,res)=>res.json({items:db.prepare('SELECT * FROM feedback ORDER BY id DESC').all()}));
app.get('/api/admin/support-requests',admin,(req,res)=>res.json({items:db.prepare('SELECT id,firebase_uid,abs_id,name,mobile,issue,description,status,created_at,updated_at FROM support_requests ORDER BY id DESC LIMIT 1000').all()}));
app.patch('/api/admin/support-requests/:id',admin,(req,res)=>{
  const status=String(req.body?.status||'').trim();
  if(!['open','in-progress','resolved'].includes(status))return res.status(400).json({error:'Choose open, in-progress or resolved.'});
  const result=db.prepare('UPDATE support_requests SET status=?,updated_at=? WHERE id=?').run(status,now(),Number(req.params.id));
  if(!result.changes)return res.status(404).json({error:'Support request not found.'});
  res.json({ok:true});
});
app.post('/api/admin/ads',admin,(req,res)=>{const x=req.body||{};const info=db.prepare('INSERT INTO ads(title,text,badge,image,link,active,created_at) VALUES(?,?,?,?,?,?,?)').run(x.title||'',x.text||'',x.badge||'FEATURED',x.image||'',x.link||'',x.active===false?0:1,now());res.status(201).json({item:db.prepare('SELECT * FROM ads WHERE id=?').get(info.lastInsertRowid)})});
app.patch('/api/admin/ads/:id',admin,(req,res)=>{const x=req.body||{};db.prepare('UPDATE ads SET title=COALESCE(?,title),text=COALESCE(?,text),badge=COALESCE(?,badge),image=COALESCE(?,image),link=COALESCE(?,link),active=COALESCE(?,active),starts_at=COALESCE(?,starts_at),ends_at=COALESCE(?,ends_at) WHERE id=?').run(x.title??null,x.text??null,x.badge??null,x.image??null,x.link??null,x.active==null?null:(x.active?1:0),x.starts_at??null,x.ends_at??null,req.params.id);res.json({ok:true})});
app.delete('/api/admin/ads/:id',admin,(req,res)=>{db.prepare('DELETE FROM ads WHERE id=?').run(req.params.id);res.json({ok:true})});
const frontend=path.join(__dirname,'../../frontend');
app.get('/admin', (req,res)=>res.sendFile(path.join(frontend,'admin','index.html')));
app.get('/admin/', (req,res)=>res.sendFile(path.join(frontend,'admin','index.html')));
app.use(express.static(frontend));
app.use((req,res)=>{
  res.sendFile(path.join(frontend,'index.html'));
});
const port=process.env.PORT||3000;app.listen(port,()=>console.log(`ABS DASHBOARD running at http://localhost:${port}`));
