(function(){
"use strict";
const $=s=>document.querySelector(s),money=n=>"₹"+Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:2});
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")};
const dateObj=s=>{const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d,12)};
const dateLabel=s=>dateObj(s).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
const dates=(a,b)=>{const x=dateObj(a),z=dateObj(b),r=[];if(!a||!b||z<x)return r;for(let d=new Date(x);d<=z&&r.length<366;d.setDate(d.getDate()+1))r.push([d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"));return r};
const originalOpenFeature=window.openFeature;
let bill=null,cv="0",fresh=true,op=null,stored=null;
function key(){return "abs_food_bill_v1_"+String(window.state?.user?.uid||window.state?.user?.mobile||"guest").replace(/[^a-zA-Z0-9_-]/g,"_")}
function persist(){try{localStorage.setItem(key(),JSON.stringify(bill))}catch(e){}}
function explore(){
const a=[["🧮","Normal Calculator","Quick everyday calculations","normal-calculator"],["🍱","Food Bill Calculator","Lunch, dinner and date-wise report","food-bill"],["💰","Add Income","Salary, bonus & other income","income"],["💸","Add Expense","Track spending by category","expense"],["📥","Bulk Data","Add many old records at once","bulk"],["🏦","Add Loan","Principal, interest & tenure","loan"],["💳","Add EMI","Record repayment","emi"],["📅","Loan Schedule","Principal & interest timeline","schedule"],["👥","People","Name, phone & balances","people"],["🤝","Ledger","Lena / Dena — receive & pay","ledger"],["🎯","Budget","Monthly spending limits","budget"],["💼","Career","Jobs & salary history","career"],["📊","Reports","Income, expense & Lena/Dena report","report"],["🧾","Statement","Filter and export a statement","statement"],["⚙️","Settings","Personalize the app","settings"],["🗂","Categories","Manage categories","categories"],["🕘","History","View records","history"],["✎","Edit Records","Correct saved records","editrecords"],["💬","Feedback","Share your experience","feedback"],["📘","Guide","Learn every feature","guide"]];
$("#screen").innerHTML='<div class="explore-head"><div><div class="eyebrow">YOUR FINANCIAL TOOLKIT</div><div class="page-title">Explore</div><p class="page-sub">Calculators and tools for everyday tasks.</p></div><div class="explore-count">'+a.length+'<small>TOOLS</small></div></div><section class="abs-calculator-intro"><div><span>NEW TOOLS</span><b>Calculators</b><small>Quick calculations and food bill reports, separate from your finances.</small></div><span class="abs-calc-spark">✦</span></section><div class="explore-grid professional-grid">'+a.map((x,i)=>'<button class="action-card professional-action" style="animation-delay:'+(i*20)+'ms" onclick="openFeature(\''+x[3]+'\')"><div class="action-top"><div class="ico">'+x[0]+'</div><span>↗</span></div><b>'+x[1]+'</b><small>'+x[2]+'</small></button>').join("")+'</div>';
}
function normal(){
cv="0";fresh=true;op=null;stored=null;
$("#screen").innerHTML='<div class="abs-calc-page"><button class="abs-back" onclick="goTab(\'explore\')">← Explore</button><div class="page-title">Normal Calculator</div><p class="page-sub">Everyday calculations.</p><div class="abs-calc-shell"><div class="abs-calc-display"><small>CALCULATION</small><output id="absCalcDisplay">0</output></div><div class="abs-calc-keys">'+["AC","±","%","÷","7","8","9","×","4","5","6","−","1","2","3","+","0",".","⌫","="].map(k=>'<button class="'+(["÷","×","−","+","="].includes(k)?"operator":k==="AC"?"clear":"")+'" onclick="absCalcKey(\''+k+'\')">'+k+'</button>').join("")+'</div></div></div>';
}
function calc(k){
if(k==="AC"){cv="0";fresh=true;op=null;stored=null}
else if(k==="⌫")cv=cv.length>1?cv.slice(0,-1):"0";
else if(k==="."){if(fresh){cv="0.";fresh=false}else if(!cv.includes("."))cv+="."}
else if(k==="±")cv=String(-Number(cv||0));
else if(k==="%")cv=String(Number(cv||0)/100);
else if(["+","−","×","÷"].includes(k)){stored=Number(cv);op=k;fresh=true}
else if(k==="="&&op&&stored!==null){const b=Number(cv),a=stored,v=op==="+"?a+b:op==="−"?a-b:op==="×"?a*b:b===0?NaN:a/b;cv=Number.isFinite(v)?String(Number(v.toFixed(8))):"Error";op=null;stored=null;fresh=true}
else if(/^\d$/.test(k)){cv=fresh?k:(cv==="0"?k:cv+k);fresh=false}
const el=$("#absCalcDisplay");if(el)el.textContent=cv;
}
function setupBill(){
$("#screen").innerHTML='<div class="abs-calc-page"><button class="abs-back" onclick="goTab(\'explore\')">← Explore</button><div class="page-title">Food Bill Calculator</div><p class="page-sub">Enter lunch and dinner amounts day by day. Skipped meals stay blank.</p><div class="abs-food-panel"><div class="abs-food-icon">🍱</div><h3>Create a food bill</h3><p>Choose the date range to begin.</p><label>Starting date<input id="foodStart" type="date" value="'+today()+'"></label><label>Ending date<input id="foodEnd" type="date" value="'+today()+'"></label><button class="primary full" onclick="absStartFoodBill()">START FOOD BILL →</button><small class="abs-isolation-note">This calculator will not change Income, Expense or Available Balance.</small></div></div>';
}
function startBill(){
const start=$("#foodStart").value,end=$("#foodEnd").value,ds=dates(start,end);
if(!ds.length)return toast("Select a valid date range (maximum 366 days).");
bill={start,end,days:ds,index:0,meal:"lunch",entries:{},complete:false};
ds.forEach(d=>bill.entries[d]={lunch:"",dinner:"",lunchSkipped:false,dinnerSkipped:false});
persist();step();
}
function step(){
const d=bill.days[bill.index],m=bill.meal,e=bill.entries[d],v=e[m],pct=Math.round(((bill.index+(m==="dinner"?.5:0))/bill.days.length)*100);
$("#screen").innerHTML='<div class="abs-calc-page"><button class="abs-back" onclick="goTab(\'explore\')">← Explore</button><div class="abs-food-step-top"><div><div class="eyebrow">FOOD BILL · '+(bill.index+1)+' OF '+bill.days.length+' DAYS</div><div class="page-title">'+dateLabel(d)+'</div></div><span class="abs-food-progress">'+pct+'%</span></div><div class="abs-food-progress-track"><i style="width:'+Math.max(3,pct)+'%"></i></div><div class="abs-food-meal-card"><span class="abs-food-icon">'+(m==="lunch"?"☀️":"🌙")+'</span><div class="eyebrow">MEAL '+(m==="lunch"?"01":"02")+'</div><h2>'+(m==="lunch"?"Lunch":"Dinner")+'</h2><p>Enter today\\'s '+m+' amount</p><label class="abs-amount-label">AMOUNT (₹)<input id="foodAmount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Enter amount" value="'+esc(v)+'"></label><div class="abs-quick-amounts">'+[50,100,40,70,75].map(n=>'<button onclick="absQuickFoodAmount('+n+')">₹'+n+'</button>').join("")+'</div><div class="abs-food-step-actions"><button class="secondary" onclick="absSkipFoodMeal()">SKIP MEAL</button><button class="primary" onclick="absNextFoodMeal()">SAVE & NEXT →</button></div><small class="abs-isolation-note">Skipped meals are shown as blank — no amount is added.</small></div><div class="abs-food-step-footer"><button class="abs-text-button" onclick="absBackFoodMeal()" '+(bill.index===0&&m==="lunch"?"disabled":"")+' >← Previous meal</button><button class="abs-text-button" onclick="absCancelFoodBill()">Cancel bill</button></div></div>';
}
function next(skip){
const d=bill.days[bill.index],m=bill.meal,e=bill.entries[d],raw=$("#foodAmount")?.value.trim()??"";
if(skip){e[m]="";e[m+"Skipped"]=true}
else{if(raw===""||!Number.isFinite(Number(raw))||Number(raw)<0)return toast("Enter an amount or choose Skip.");e[m]=String(Number(raw));e[m+"Skipped"]=false}
if(m==="lunch")bill.meal="dinner";else{bill.index++;bill.meal="lunch"}
persist();if(bill.index>=bill.days.length){bill.complete=true;bill.completedAt=new Date().toISOString();persist();report()}else step();
}
function back(){if(bill.meal==="dinner")bill.meal="lunch";else if(bill.index>0){bill.index--;bill.meal="dinner"}persist();step()}
function totals(){let total=0,entered=0,skipped=0,blank=0;bill.days.forEach(d=>["lunch","dinner"].forEach(m=>{const e=bill.entries[d];if(e[m]!==""){total+=Number(e[m]||0);entered++}else{blank++;if(e[m+"Skipped"])skipped++}}));return{total,entered,skipped,blank}}
function report(){
const t=totals();
$("#screen").innerHTML='<div class="abs-calc-page abs-food-report"><div class="abs-report-head"><div class="eyebrow">ABS FOOD BILL · COMPLETED</div><h1>Food Bill Report</h1><p>'+dateLabel(bill.start)+' – '+dateLabel(bill.end)+'</p></div><div class="abs-report-total"><small>TOTAL FOOD AMOUNT</small><strong>'+money(t.total)+'</strong><span>'+t.entered+' meals entered · '+t.skipped+' skipped</span></div><div class="abs-report-stats"><div><small>Entered meals</small><b>'+t.entered+'</b></div><div><small>Skipped meals</small><b>'+t.skipped+'</b></div><div><small>Blank meals</small><b>'+t.blank+'</b></div></div><div class="abs-report-table-wrap"><table class="abs-report-table"><thead><tr><th>Date</th><th>Lunch</th><th>Dinner</th><th>Daily total</th></tr></thead><tbody>'+bill.days.map(d=>{const e=bill.entries[d],sum=(Number(e.lunch)||0)+(Number(e.dinner)||0);return '<tr><td>'+dateLabel(d)+'</td><td>'+(e.lunch===""?"—":money(e.lunch))+'</td><td>'+(e.dinner===""?"—":money(e.dinner))+'</td><td>'+money(sum)+'</td></tr>'}).join("")+'</tbody><tfoot><tr><th colspan="3">Grand Total</th><th>'+money(t.total)+'</th></tr></tfoot></table></div><div class="abs-report-actions"><button class="secondary" onclick="absPrintFoodReport()">PRINT / SAVE PDF</button><button class="primary" onclick="absNewFoodBill()">NEW FOOD BILL</button></div><p class="abs-isolation-note">Calculation report only. Not added to ABS financial records.</p></div>';
}
function printReport(){
const t=totals(),rows=bill.days.map(d=>{const e=bill.entries[d];return '<tr><td>'+dateLabel(d)+'</td><td>'+(e.lunch===""?"—":money(e.lunch))+'</td><td>'+(e.dinner===""?"—":money(e.dinner))+'</td><td>'+money((Number(e.lunch)||0)+(Number(e.dinner)||0))+'</td></tr>'}).join("");
const w=window.open("","_blank");if(!w)return toast("Allow pop-ups to print the report.");
w.document.write('<!doctype html><html><head><title>ABS Food Bill Report</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:14px Arial;color:#172033;padding:28px}h1{margin:0 0 8px}p{color:#596579}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:12px;border:1px solid #dbe1ea;text-align:left}th{background:#f0f3f8}</style></head><body><h1>ABS Food Bill Report</h1><p>'+dateLabel(bill.start)+' – '+dateLabel(bill.end)+'</p><h2>Total: '+money(t.total)+'</h2><p>Entered meals: '+t.entered+' · Skipped meals: '+t.skipped+' · Blank meals: '+t.blank+'</p><table><thead><tr><th>Date</th><th>Lunch</th><th>Dinner</th><th>Daily total</th></tr></thead><tbody>'+rows+'</tbody></table><p>Calculation report only — not included in ABS financial records.</p><script>window.onload=()=>window.print()<\/script></body></html>');w.document.close();
}
function openFood(){try{const saved=JSON.parse(localStorage.getItem(key())||"null");if(saved&&!saved.complete){bill=saved;step();return}if(saved?.complete){bill=saved;report();return}}catch(e){}bill=null;setupBill()}
function cancel(){if(confirm("Cancel this food bill?")){localStorage.removeItem(key());bill=null;setupBill()}}
window.renderExplore=explore;
window.openFeature=function(type){if(type==="normal-calculator")return normal();if(type==="food-bill")return openFood();return originalOpenFeature(type)};
window.absCalcKey=calc;window.absStartFoodBill=startBill;window.absQuickFoodAmount=n=>{const e=$("#foodAmount");if(e)e.value=String(n)};
window.absNextFoodMeal=()=>next(false);window.absSkipFoodMeal=()=>next(true);window.absBackFoodMeal=back;
window.absPrintFoodReport=printReport;window.absNewFoodBill=()=>{bill=null;localStorage.removeItem(key());setupBill()};window.absCancelFoodBill=cancel;
function installPull(){
const shell=$("#mainApp"),screen=$("#screen");if(!shell||!screen||shell.dataset.absPullReady)return;shell.dataset.absPullReady="1";
let y=0,last=0,tracking=false,busy=false;const tip=document.createElement("div");tip.className="abs-pull-indicator";tip.textContent="↓ Pull to refresh";shell.insertBefore(tip,screen);
shell.addEventListener("touchstart",e=>{if(busy||!e.touches.length||e.target.closest("input,textarea,select,button,[contenteditable=true]"))return;if(window.scrollY>4||screen.scrollTop>4)return;y=last=e.touches[0].clientY;tracking=true},{passive:true});
shell.addEventListener("touchmove",e=>{if(!tracking||!e.touches.length)return;last=e.touches[0].clientY;const d=last-y;if(d<0){tracking=false;tip.classList.remove("visible","ready");return}if(d>0){tip.classList.add("visible");tip.classList.toggle("ready",d>72);tip.textContent=d>72?"↑ Release to refresh":"↓ Pull to refresh"}},{passive:true});
shell.addEventListener("touchend",async()=>{if(!tracking)return;tracking=false;if(last-y>72&&!busy&&window.state?.user&&typeof window.refreshAppData==="function"){busy=true;tip.classList.add("visible","loading");tip.textContent="↻ Refreshing…";try{await window.refreshAppData()}finally{busy=false;tip.classList.remove("visible","ready","loading")}}else tip.classList.remove("visible","ready")},{passive:true});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installPull);else installPull();window.addEventListener("load",installPull);
})();