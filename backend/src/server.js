const path=require('path');
const fs=require('fs');
const express=require('express');
const cors=require('cors');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const Database=require('better-sqlite3');
const rateLimit=require('express-rate-limit');
const firebaseAdmin=require('firebase-admin');
const multer=require('multer');

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
  const projectId=process.env.FIREBASE_PROJECT_ID||serviceAccount.project_id||'abs-dashboard-dd0b2';
  const storageBucket=process.env.FIREBASE_STORAGE_BUCKET||'abs-dashboard-dd0b2.firebasestorage.app';
  firebaseAdmin.initializeApp({
    credential:firebaseAdmin.credential.cert(serviceAccount),
    projectId,
    storageBucket
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
function firebaseAuth(req,res,next){
  (async()=>{
    const h=req.headers.authorization||'';
    if(!h.startsWith('Bearer ')) return res.status(401).json({error:'Sign in to use this feature.'});
    try{
      const sdk=getFirebaseAdmin();
      req.firebaseUser=await sdk.auth().verifyIdToken(h.slice(7));
      next();
    }catch(e){
      console.warn('Firebase token verification failed:',e.code||e.message);
      return res.status(401).json({error:'Your session has expired. Please sign in again.'});
    }
  })().catch(e=>{console.error(e);res.status(500).json({error:'Unable to verify account.'})});
}
const app=express();
app.use(cors()); app.use(express.json({limit:'10mb'}));
app.use('/api/auth/',rateLimit({windowMs:15*60*1000,max:100}));
app.get('/api/health',(req,res)=>res.json({ok:true,service:'ABS DASHBOARD API',time:now()}));

// Firebase-backed public features. Only the signed-in user's Firebase token is accepted.
function firebaseBucket(sdk){
  return sdk.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET||'abs-dashboard-dd0b2.firebasestorage.app');
}
async function currentUpdateDoc(){
  const sdk=getFirebaseAdmin();
  const snap=await sdk.firestore().collection('appConfig').doc('currentUpdate').get();
  return snap.exists?(snap.data()||{}):null;
}
app.get('/api/app-update',async(req,res)=>{
  try{
    const d=await currentUpdateDoc();
    res.set('Cache-Control','no-store');
    if(!d||!d.storagePath) return res.json({available:false,version:'',notes:'',uploadedAt:'',size:0});
    res.json({available:true,version:String(d.version||''),notes:String(d.notes||''),uploadedAt:d.uploadedAt||'',size:Number(d.size||0),fileName:String(d.fileName||'ABS-DASHBOARD.apk')});
  }catch(e){publicAdminError(res,e)}
});
app.get('/api/app-update/download',async(req,res)=>{
  try{
    const d=await currentUpdateDoc();
    if(!d||!d.storagePath) return res.status(404).json({error:'No update has been uploaded yet.'});
    const safeName=String(d.fileName||'ABS-DASHBOARD.apk').replace(/[\\"\r\n]/g,'_');
    res.setHeader('Content-Type','application/vnd.android.package-archive');
    res.setHeader('Content-Disposition',`attachment; filename="${safeName}"`);
    res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');
    const stream=firebaseBucket(getFirebaseAdmin()).file(d.storagePath).createReadStream();
    stream.on('error',e=>{console.error('APK download failed:',e.message);if(!res.headersSent)res.status(404).json({error:'The uploaded APK could not be opened. Ask the administrator to upload it again.'});else res.destroy(e)});
    stream.pipe(res);
  }catch(e){publicAdminError(res,e)}
});

app.post('/api/activity',firebaseAuth,async(req,res)=>{
  try{
    const sdk=getFirebaseAdmin(),dbfs=sdk.firestore(),uid=req.firebaseUser.uid;
    const userRef=dbfs.collection('users').doc(uid),snap=await userRef.get();
    if(!snap.exists) return res.status(404).json({error:'ABS user profile was not found.'});
    const profile=snap.data()||{},at=now(),date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
    const activityRef=dbfs.collection('appActivity').doc(`${uid}_${date}`);
    await activityRef.set({uid,absId:String(profile.absId||''),at,date,source:'app-open'},{merge:true});
    await userRef.set({lastActiveAt:at,lastLoginAt:profile.lastLoginAt||at},{merge:true});
    res.json({ok:true,date});
  }catch(e){publicAdminError(res,e)}
});

function tweetShape(doc,viewerUid,adminView=false){
  const d=doc.data()||{};
  const out={id:doc.id,absId:String(d.absId||'ABS USER'),verified:d.verified===true,text:String(d.text||''),createdAt:d.createdAt||'',createdAtMs:Number(d.createdAtMs||0)};
  if(adminView)out.uid=String(d.uid||''); else out.isMine=String(d.uid||'')===String(viewerUid||'');
  return out;
}
app.get('/api/tweets',firebaseAuth,async(req,res)=>{
  try{
    const sdk=getFirebaseAdmin(),dbfs=sdk.firestore();
    let query=dbfs.collection('tweets').orderBy('createdAtMs','desc');
    const cursor=String(req.query.before||'').trim();
    if(cursor){const snap=await dbfs.collection('tweets').doc(cursor).get();if(snap.exists)query=query.startAfter(snap)}
    const snap=await query.limit(40).get();
    res.set('Cache-Control','no-store');
    res.json({items:snap.docs.map(d=>tweetShape(d,req.firebaseUser.uid)),hasMore:snap.size===40,nextCursor:snap.docs.length?snap.docs[snap.docs.length-1].id:''});
  }catch(e){publicAdminError(res,e)}
});
app.post('/api/tweets',firebaseAuth,async(req,res)=>{
  const text=String(req.body?.text||'').trim();
  if(!text||text.length>280)return res.status(400).json({error:'Tweet must contain 1–280 characters.'});
  try{
    const sdk=getFirebaseAdmin(),dbfs=sdk.firestore(),uid=req.firebaseUser.uid;
    const profileSnap=await dbfs.collection('users').doc(uid).get();
    if(!profileSnap.exists)return res.status(404).json({error:'ABS user profile was not found.'});
    const profile=profileSnap.data()||{};
    if(!profile.absId)return res.status(400).json({error:'Your ABS ID is missing. Contact Admin before posting.'});
    const at=now(),ref=dbfs.collection('tweets').doc();
    await ref.set({uid,absId:String(profile.absId),verified:profile.verified===true,text,createdAt:at,createdAtMs:Date.now()});
    res.status(201).json({ok:true,item:{id:ref.id,absId:String(profile.absId),verified:profile.verified===true,text,createdAt:at,createdAtMs:Date.now(),isMine:true}});
  }catch(e){publicAdminError(res,e)}
});
app.delete('/api/tweets/:id',firebaseAuth,async(req,res)=>{
  try{
    const ref=getFirebaseAdmin().firestore().collection('tweets').doc(String(req.params.id||''));
    const snap=await ref.get();if(!snap.exists)return res.status(404).json({error:'Tweet was not found.'});
    if(String(snap.data()?.uid||'')!==String(req.firebaseUser.uid))return res.status(403).json({error:'You can delete only your own tweets.'});
    await ref.delete();res.json({ok:true});
  }catch(e){publicAdminError(res,e)}
});

// Support Chat messages are separate Firestore documents, so history does not disappear
// when a new message is sent and the thread is not constrained to one large document.
async function readSupportThread(uid){
  const dbfs=getFirebaseAdmin().firestore(),parent=dbfs.collection('users').doc(uid).collection('private').doc('adminChat');
  const parentSnap=await parent.get(),parentData=parentSnap.exists?(parentSnap.data()||{}):{};
  const legacy=Array.isArray(parentData.messages)?parentData.messages:[];
  const msgSnap=await parent.collection('messages').orderBy('createdAtMs','desc').limit(300).get();
  const modern=msgSnap.docs.map(d=>({id:d.id,...(d.data()||{})})).reverse();
  const messages=[...legacy.map((m,i)=>({...m,id:m.id||`legacy-${i}`})),...modern];
  return {parent,parentData,messages,updatedAt:parentData.updatedAt||''};
}
async function storeSupportMessage(uid,from,text){
  const sdk=getFirebaseAdmin(),dbfs=sdk.firestore(),userRef=dbfs.collection('users').doc(uid);
  const userSnap=await userRef.get();if(!userSnap.exists)throw Object.assign(new Error('ABS user profile was not found.'),{code:'not-found'});
  const profile=userSnap.data()||{},parent=userRef.collection('private').doc('adminChat'),at=now(),id=`m-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
  const msg={from,text,createdAt:at,createdAtMs:Date.now(),id};
  await parent.collection('messages').doc(id).set(msg);
  await parent.set({lastMessage:{from,text,createdAt:at},updatedAt:at,absId:String(profile.absId||''),name:String(profile.name||''),mobile:String(profile.mobile||'')},{merge:true});
  return msg;
}
function cleanChatMessage(m){return {id:String(m.id||''),from:m.from==='admin'?'admin':'user',text:String(m.text||''),createdAt:m.createdAt||'',createdAtMs:Number(m.createdAtMs||0)}}
app.get('/api/support-chat',firebaseAuth,async(req,res)=>{
  try{const thread=await readSupportThread(req.firebaseUser.uid);res.set('Cache-Control','no-store');res.json({ok:true,messages:thread.messages.map(cleanChatMessage),updatedAt:thread.updatedAt})}
  catch(e){publicAdminError(res,e)}
});
app.post('/api/support-chat',firebaseAuth,async(req,res)=>{
  const text=String(req.body?.text||'').trim();
  if(!text||text.length>1500)return res.status(400).json({error:'Message must contain 1–1500 characters.'});
  try{const msg=await storeSupportMessage(req.firebaseUser.uid,'user',text);res.status(201).json({ok:true,message:cleanChatMessage(msg)})}
  catch(e){publicAdminError(res,e)}
});
app.get('/api/admin/support-chats',admin,async(req,res)=>{
  try{
    const sdk=getFirebaseAdmin(),dbfs=sdk.firestore(),snap=await dbfs.collection('users').get();
    const items=await Promise.all(snap.docs.map(async doc=>{
      const p=doc.data()||{};let meta={};
      try{const c=await doc.ref.collection('private').doc('adminChat').get();if(c.exists)meta=c.data()||{}}catch(e){}
      return {uid:doc.id,absId:String(p.absId||''),name:String(p.name||''),mobile:String(p.mobile||''),verified:p.verified===true,lastMessage:meta.lastMessage||null,updatedAt:meta.updatedAt||p.lastActiveAt||p.lastActive||p.createdAt||''};
    }));
    items.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
    res.json({items});
  }catch(e){publicAdminError(res,e)}
});
app.get('/api/admin/support-chats/:uid',admin,async(req,res)=>{
  const uid=String(req.params.uid||'').trim();if(!uid)return res.status(400).json({error:'ABS UID required.'});
  try{const thread=await readSupportThread(uid);res.set('Cache-Control','no-store');res.json({ok:true,messages:thread.messages.map(cleanChatMessage),updatedAt:thread.updatedAt})}
  catch(e){publicAdminError(res,e)}
});
app.post('/api/admin/support-chats/:uid',admin,async(req,res)=>{
  const uid=String(req.params.uid||'').trim(),text=String(req.body?.text||'').trim();
  if(!text||text.length>1500)return res.status(400).json({error:'Message must contain 1–1500 characters.'});
  try{const msg=await storeSupportMessage(uid,'admin',text);res.status(201).json({ok:true,message:cleanChatMessage(msg)})}
  catch(e){publicAdminError(res,e)}
});

const apkUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:120*1024*1024},fileFilter:(req,file,cb)=>{
  if(!String(file.originalname||'').toLowerCase().endsWith('.apk'))return cb(new Error('Please select an APK file (.apk).'));
  cb(null,true);
}});
app.post('/api/admin/app-update',admin,(req,res,next)=>{
  apkUpload.single('apk')(req,res,async err=>{
    if(err)return res.status(err.code==='LIMIT_FILE_SIZE'?413:400).json({error:err.code==='LIMIT_FILE_SIZE'?'APK must be 120 MB or smaller.':err.message||'APK upload failed.'});
    if(!req.file)return res.status(400).json({error:'Choose an APK file first.'});
    const version=String(req.body?.version||'').trim(),notes=String(req.body?.notes||'').trim();
    if(!version)return res.status(400).json({error:'Version is required (for example 1.0.17).'});
    try{
      const sdk=getFirebaseAdmin(),dbfs=sdk.firestore(),storagePath='abs-dashboard/releases/current.apk';
      const bucket=firebaseBucket(sdk),file=bucket.file(storagePath);
      await file.save(req.file.buffer,{resumable:false,metadata:{contentType:'application/vnd.android.package-archive',cacheControl:'no-store'}});
      const meta={available:true,version,notes:notes.slice(0,1000),uploadedAt:now(),size:req.file.size,fileName:'ABS-DASHBOARD.apk',storagePath};
      await dbfs.collection('appConfig').doc('currentUpdate').set(meta);
      res.status(201).json({ok:true,update:{version,notes:meta.notes,uploadedAt:meta.uploadedAt,size:meta.size,fileName:meta.fileName}});
    }catch(e){console.error('ABS app update upload failed:',e);res.status(500).json({error:'APK upload failed. Check that Render Firebase service account has Firebase Storage/Object Admin permission and FIREBASE_STORAGE_BUCKET is set correctly.'})}
  });
});
app.get('/api/admin/tweets',admin,async(req,res)=>{
  try{const sdk=getFirebaseAdmin(),snap=await sdk.firestore().collection('tweets').orderBy('createdAtMs','desc').limit(300).get();res.json({items:snap.docs.map(d=>tweetShape(d,'',true))})}
  catch(e){publicAdminError(res,e)}
});
app.post('/api/admin/tweets',admin,async(req,res)=>{
  const text=String(req.body?.text||'').trim();if(!text||text.length>280)return res.status(400).json({error:'Tweet must contain 1–280 characters.'});
  try{
    const sdk=getFirebaseAdmin(),dbfs=sdk.firestore(),profileSnap=await dbfs.collection('users').doc(FIREBASE_ADMIN_UID).get(),p=profileSnap.exists?(profileSnap.data()||{}):{};
    const at=now(),ref=dbfs.collection('tweets').doc();
    await ref.set({uid:FIREBASE_ADMIN_UID,absId:String(p.absId||'ABSADMIN'),verified:p.verified===true,text,createdAt:at,createdAtMs:Date.now(),postedByAdmin:true});
    res.status(201).json({ok:true,item:tweetShape(await ref.get(),'',true)});
  }catch(e){publicAdminError(res,e)}
});
app.delete('/api/admin/tweets/:id',admin,async(req,res)=>{
  try{const ref=getFirebaseAdmin().firestore().collection('tweets').doc(String(req.params.id||'')),snap=await ref.get();if(!snap.exists)return res.status(404).json({error:'Tweet was not found.'});await ref.delete();res.json({ok:true})}
  catch(e){publicAdminError(res,e)}
});
app.get('/api/admin/activity',admin,async(req,res)=>{
  try{const snap=await getFirebaseAdmin().firestore().collection('appActivity').orderBy('at','desc').limit(2000).get();res.json({items:snap.docs.map(d=>({id:d.id,...(d.data()||{})}))})}
  catch(e){publicAdminError(res,e)}
});
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
