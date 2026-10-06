const ADMIN_USER="Shkadmin",ADMIN_PASS="Shk2005";
const $=id=>document.getElementById(id);
function users(){try{return JSON.parse(localStorage.getItem("abs_users")||"[]")}catch{return[]}}
function nextAbsSerial(list){const nums=list.map(u=>String(u.absId||"").match(/(\d{4,})$/)).filter(Boolean).map(m=>Number(m[1])).filter(Number.isFinite);return Math.max(1000,...nums)+1}
function makeAbsId(mobile,serial){return `ABS${String(mobile||"").slice(-2)}${serial}`}
function ensureAbsIds(){const list=users();let serial=nextAbsSerial(list);list.slice().sort((a,b)=>new Date(a.createdAt||0)-new Date(b.createdAt||0)).forEach(u=>{if(!u.absId){u.absSerial=serial;u.absId=makeAbsId(u.mobile||u.phone,serial);serial++}});saveUsers(list);return list}
ensureAbsIds();
function feedback(){try{return JSON.parse(localStorage.getItem("abs_feedback")||"[]")}catch{return[]}}
function premiumRequests(){try{return JSON.parse(localStorage.getItem("abs_premium_requests")||"[]")}catch{return[]}}
function saveRequests(x){localStorage.setItem("abs_premium_requests",JSON.stringify(x))}
function ads(){try{return JSON.parse(localStorage.getItem("abs_ads")||"[]")}catch{return[]}}
function saveUsers(x){localStorage.setItem("abs_users",JSON.stringify(x))}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
function escAttr(v){return esc(v).replace(/`/g,"&#96;")}
function login(){if($("adminUser").value.trim()===ADMIN_USER&&$("adminPass").value===ADMIN_PASS){sessionStorage.setItem("abs_admin","1");showAdmin()}else $("loginMsg").textContent="Invalid admin credentials."}
function showAdmin(){$("login").classList.add("hidden");$("app").classList.remove("hidden");refreshAdmin()}
function adminLogout(){sessionStorage.removeItem("abs_admin");location.reload()}
function refreshAdmin(){renderStats();renderUsers();renderPremiumRequests();renderAds();renderFeedback()}
function renderStats(){const u=users(),a=ads();$("userCount").textContent=u.length;$("feedbackCount").textContent=feedback().length;$("adCount").textContent=a.filter(x=>x.active!==false).length;$("verifiedCount").textContent=u.filter(x=>x.verified===true).length;if($("requestCount"))$("requestCount").textContent=premiumRequests().filter(x=>x.status==="pending").length}
function renderUsers(){
 const list=users();
 $("users").innerHTML=list.length?list.map(u=>{const m=u.mobile||u.phone||"",name=u.name||u.fullName||"User",verified=u.verified===true;
 return `<div class="user"><div class="userhead"><div><div class="name">${esc(name)}${verified?'<span class="verify" title="Verified">✓</span>':''}</div><div class="mobile">${esc(m)}</div><div class="sub"><b>ABS ID:</b> ${esc(u.absId||"—")}</div></div><span class="badge">${verified?"VERIFIED":"REGISTERED"}</span></div><div class="sub">Created: ${esc(formatDate(u.createdAt))}</div><div class="row"><button class="btn" onclick="openUserManager('${escAttr(m)}')">VIEW / MANAGE</button><button class="btn ${verified?'secondary':'blue'}" onclick="toggleVerified('${escAttr(m)}')">${verified?'REMOVE BLUE TICK':'✓ VERIFY ACCOUNT'}</button><button class="btn danger" onclick="deleteUser('${escAttr(m)}')">DELETE ACCOUNT</button></div></div>`}).join(''):'<div class="empty">No registered users found.</div>';
}
function renderPremiumRequests(){const list=premiumRequests().filter(x=>x.status==="pending");const box=$("premiumRequests");if(!box)return;box.innerHTML=list.length?list.map(r=>`<div class="request"><div><b>${esc(r.name||"User")}</b><div class="sub">${esc(r.mobile||"")} · ${esc((users().find(u=>u.mobile===r.mobile)||{}).absId||"—")} · ${esc(formatDate(r.createdAt))}</div></div><div class="row"><button class="btn blue" onclick="approvePremium('${escAttr(r.mobile)}')">APPROVE & BLUE TICK</button><button class="btn danger" onclick="rejectPremium('${escAttr(r.id)}')">REJECT</button></div></div>`).join(""): '<div class="empty">No pending Premium requests.</div>'}
function approvePremium(mobile){const us=users();const u=us.find(x=>(x.mobile||x.phone)===mobile);if(!u)return;u.verified=true;u.verifiedAt=new Date().toISOString();saveUsers(us);const rs=premiumRequests();rs.forEach(r=>{if(r.mobile===mobile&&r.status==="pending"){r.status="approved";r.resolvedAt=new Date().toISOString()}});saveRequests(rs);refreshAdmin();alert("Premium unlocked and blue tick added.")}
function rejectPremium(id){const rs=premiumRequests();const r=rs.find(x=>String(x.id)===String(id));if(r){r.status="rejected";r.resolvedAt=new Date().toISOString();saveRequests(rs)}refreshAdmin()}

function openUserManager(mobile){
 const u=users().find(x=>(x.mobile||x.phone)===mobile)||{},name=u.name||"User";
 $("modalTitle").textContent="User Account";
 $("modalBody").innerHTML=`<p class="muted"><b>${esc(name)}</b><br>${esc(mobile)}</p><div class="sub"><b>ABS ID:</b> ${esc(u.absId||"—")}</div><label style="margin-top:12px">ABS ID</label><input id="editAbsId" value="${escAttr(u.absId||"")}" placeholder="ABS701001"><div id="absIdMsg" class="msg"></div><button class="btn full" style="margin-top:8px" onclick="saveAbsId('${escAttr(mobile)}')">SAVE ABS ID</button><div class="sub" style="margin-top:10px">Password is protected. Admin can reset it without viewing the existing password.</div><div class="row"><button class="btn" onclick="changePassword('${escAttr(mobile)}')">CHANGE PASSWORD</button><button class="btn ${u.verified===true?'secondary':'blue'}" onclick="toggleVerified('${escAttr(mobile)}');openUserManager('${escAttr(mobile)}')">${u.verified===true?'REMOVE BLUE TICK':'✓ VERIFY ACCOUNT'}</button></div><button class="btn danger full" style="margin-top:10px" onclick="deleteUser('${escAttr(mobile)}')">DELETE ACCOUNT</button>`;
 $("modal").classList.remove("hidden");
}
function saveAbsId(mobile){const value=$("editAbsId").value.trim();if(!value)return $("absIdMsg").textContent="ABS ID cannot be empty.";if(!/^[A-Za-z0-9_-]{3,30}$/.test(value))return $("absIdMsg").textContent="Use 3–30 letters, numbers, _ or -.";const list=users();if(list.some(u=>(u.absId||"").toLowerCase()===value.toLowerCase()&&(u.mobile||u.phone)!==mobile))return $("absIdMsg").textContent="This ABS ID is already used.";const u=list.find(x=>(x.mobile||x.phone)===mobile);if(!u)return;u.absId=value;saveUsers(list);openUserManager(mobile);alert("ABS ID updated successfully.")}
function changePassword(mobile){
 $("modalTitle").textContent="Change Password";
 $("modalBody").innerHTML=`<label>New Password</label><input id="newPass" type="password" minlength="6">
 <label>Confirm Password</label><input id="newPass2" type="password" minlength="6">
 <button class="btn full" style="margin-top:16px" onclick="savePassword('${escAttr(mobile)}')">UPDATE PASSWORD</button><div id="passMsg" class="msg"></div>`;
}
function savePassword(mobile){const a=$("newPass").value,b=$("newPass2").value;if(a.length<6)return $("passMsg").textContent="Password must be at least 6 characters.";if(a!==b)return $("passMsg").textContent="Passwords do not match.";localStorage.setItem(`abs_password_${mobile}`,a);closeModal();refreshAdmin();alert("Password updated successfully.")}
function toggleVerified(mobile){const list=users(),u=list.find(x=>(x.mobile||x.phone)===mobile);if(!u)return;u.verified=u.verified!==true;u.verifiedAt=u.verified?new Date().toISOString():null;saveUsers(list);refreshAdmin()}
function openCreateUser(){
 $("modalTitle").textContent="Create User Account";
 $("modalBody").innerHTML=`<p class="muted">Create an account that can immediately be used from the ABS DASHBOARD login screen.</p><label>Full Name</label><input id="createName" placeholder="User name"><label>Mobile Number</label><input id="createMobile" inputmode="numeric" maxlength="10" placeholder="10 digit mobile"><label>Password</label><input id="createPass" type="password" minlength="6" placeholder="Minimum 6 characters"><label>Confirm Password</label><input id="createPass2" type="password" minlength="6" placeholder="Repeat password"><div id="createMsg" class="msg"></div><button class="btn full" style="margin-top:8px" onclick="createUser()">CREATE ACCOUNT</button>`;
 $("modal").classList.remove("hidden");
}
function createUser(){
 const name=$("createName").value.trim(),mobile=$("createMobile").value.trim(),pass=$("createPass").value,pass2=$("createPass2").value;
 if(!name)return $("createMsg").textContent="Enter the user's name.";
 if(!/^[6-9]\d{9}$/.test(mobile))return $("createMsg").textContent="Enter a valid 10-digit Indian mobile number.";
 if(pass.length<6)return $("createMsg").textContent="Password must be at least 6 characters.";
 if(pass!==pass2)return $("createMsg").textContent="Passwords do not match.";
 const list=users();if(list.some(x=>(x.mobile||x.phone)===mobile))return $("createMsg").textContent="An account with this mobile already exists.";
 const serial=nextAbsSerial(list);list.push({name,mobile,absSerial:serial,absId:makeAbsId(mobile,serial),createdAt:new Date().toISOString(),income:0,expense:0,net:0,entries:0});saveUsers(list);localStorage.setItem(`abs_password_${mobile}`,pass);localStorage.setItem(`abs_data_${mobile}`,JSON.stringify({income:[],expenses:[],loans:[],emi:[],people:[],ledger:[],career:[],settings:{budgets:{},categories:["Food & Dining","Mobile & Internet","Shopping","Travel","Bills & Utilities","Health","Education","Entertainment","Salary","Freelance","Bonus","Other"],incomeCategories:["Salary","Freelance","Business","Bonus","Interest","Gift","Other"],customCategories:[]}}));closeModal();refreshAdmin();alert(`Account created for ${name}.`);
}
function deleteUser(mobile){
 const u=users().find(x=>(x.mobile||x.phone)===mobile);if(!u)return;if(!confirm(`Delete the account of ${u.name||"this user"}? This will remove the account password and all saved financial data from this device.`))return;
 saveUsers(users().filter(x=>(x.mobile||x.phone)!==mobile));localStorage.removeItem(`abs_password_${mobile}`);localStorage.removeItem(`abs_data_${mobile}`);if(localStorage.getItem("abs_user")?.includes(mobile))localStorage.removeItem("abs_user");closeModal();refreshAdmin();alert("User account deleted.");
}
function formatDate(v){if(!v)return"—";const d=new Date(v);return isNaN(d)?"—":d.toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"})}

function renderPremiumRequestSection(){const list=premiumRequests().filter(x=>x.status==="pending");return `<section class="admin-section"><div class="section-title"><div><div class="eyebrow">PREMIUM ACCESS</div><h2>Premium Requests</h2></div><span>${list.length} pending</span></div><div id="premiumRequests">${list.length?list.map(r=>`<div class="request"><div><b>${esc(r.name||"User")}</b><div class="sub">${esc(r.mobile||"")} · ${esc((users().find(u=>u.mobile===r.mobile)||{}).absId||"—")} · ${esc(formatDate(r.createdAt))}</div></div><div class="row"><button class="btn blue" onclick="approvePremium('${escAttr(r.mobile)}')">APPROVE & BLUE TICK</button><button class="btn danger" onclick="rejectPremium('${escAttr(r.id)}')">REJECT</button></div></div>`).join(""):'<div class="empty">No pending Premium requests.</div>'}</div></section>`}
function renderAds(){
 const list=ads();
 $("ads").innerHTML=list.length?list.map((a,i)=>`<div class="ad"><div class="adtitle">${esc(a.title||"Advertisement")}</div><div class="sub">${esc(a.text||"")}</div>${a.image?`<img src="${esc(a.image)}" alt="">`:''}<div class="ad-actions"><button class="btn ${a.active===false?'blue':'ok'}" onclick="toggleAd(${i})">${a.active===false?'ENABLE':'ACTIVE'}</button><button class="btn secondary" onclick="openAdModal(${i})">EDIT</button><button class="btn danger" onclick="deleteAd(${i})">DELETE</button></div></div>`).join(""):'<div class="empty">No advertisements added yet.</div>';
}
function openAdModal(index=-1){
 const a=index>=0?ads()[index]:{badge:"FEATURED",title:"",text:"",link:"",image:"",active:true};
 $("modalTitle").textContent=index>=0?"Edit Advertisement":"Add Advertisement";
 $("modalBody").innerHTML=`<label>Upload Image</label><input id="adImageFile" type="file" accept="image/*"><div class="preview" id="adPreview">${a.image?`<img src="${esc(a.image)}">`:''}</div>
 <label>Badge</label><input id="adBadge" value="${escAttr(a.badge||"FEATURED")}" placeholder="FEATURED">
 <label>Title</label><input id="adTitle" value="${escAttr(a.title||"")}" placeholder="Advertisement title">
 <label>Text</label><textarea id="adText" placeholder="Short advertisement description">${esc(a.text||"")}</textarea>
 <label>Link (optional)</label><input id="adLink" value="${escAttr(a.link||"")}" placeholder="https://...">
 <button class="btn full" style="margin-top:16px" onclick="saveAd(${index})">SAVE ADVERTISEMENT</button><div id="adMsg" class="msg"></div>`;
 const f=$("adImageFile");f.onchange=()=>{const file=f.files?.[0];if(!file)return;const r=new FileReader();r.onload=e=>{$("adPreview").style.display="block";$("adPreview").innerHTML=`<img src="${e.target.result}">`;window._adImage=e.target.result};r.readAsDataURL(file)};
 window._adImage=a.image||"";
 $("modal").classList.remove("hidden");
}
function saveAd(index){
 const title=$("adTitle").value.trim();if(!title)return $("adMsg").textContent="Title is required.";
 const list=ads(),old=index>=0?list[index]:{};
 list[index>=0?index:list.length]={id:old.id||Date.now(),badge:$("adBadge").value.trim()||"FEATURED",title,text:$("adText").value.trim(),link:$("adLink").value.trim(),image:window._adImage||"",active:old.active!==false,updatedAt:new Date().toISOString()};
 localStorage.setItem("abs_ads",JSON.stringify(list));window._adImage="";closeModal();refreshAdmin();
}
function toggleAd(i){const list=ads();if(!list[i])return;list[i].active=list[i].active===false;localStorage.setItem("abs_ads",JSON.stringify(list));refreshAdmin()}
function deleteAd(i){if(!confirm("Delete this advertisement?"))return;const list=ads();list.splice(i,1);localStorage.setItem("abs_ads",JSON.stringify(list));refreshAdmin()}

function renderFeedback(){
 const list=feedback();
 $("feedback").innerHTML=list.length?list.map((f,i)=>`<div class="feedback"><b>${esc(f.subject||f.type||"Feedback")}</b><div class="sub">${esc(f.message||f.text||"")}</div><div class="sub">${esc(f.name||f.mobile||"User")} · ${esc(f.date||f.createdAt||"")}</div><div class="row"><button class="btn danger" onclick="deleteFeedback(${i})">DELETE</button></div></div>`).join(""):'<div class="empty">No feedback yet.</div>';
}
function deleteFeedback(i){if(!confirm("Delete this feedback?"))return;const list=feedback();list.splice(i,1);localStorage.setItem("abs_feedback",JSON.stringify(list));refreshAdmin()}
function closeModal(){$("modal").classList.add("hidden");window._adImage=""}
$("loginForm").addEventListener("submit",e=>{e.preventDefault();login()});
if(sessionStorage.getItem("abs_admin")==="1")showAdmin();

window.approvePremium=approvePremium;window.rejectPremium=rejectPremium;window.renderPremiumRequests=renderPremiumRequests;
