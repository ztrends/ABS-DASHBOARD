(function(){
"use strict";
const $=s=>document.querySelector(s),money=n=>"₹"+Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:2});
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")};
const dateObj=s=>{const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d,12)};
const dateLabel=s=>dateObj(s).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
const dates=(a,b)=>{const x=dateObj(a),z=dateObj(b),r=[];if(!a||!b||z<x)return r;for(let d=new Date(x);d<=z;d.setDate(d.getDate()+1)){if(r.length>=366)return [];r.push([d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"))}return r};
const originalOpenFeature=window.openFeature;
let bill=null,cv="0",fresh=true,op=null,stored=null;
function currentUser(){try{return JSON.parse(localStorage.getItem("abs_user")||"null")}catch(e){return null}}
function key(){const u=currentUser();return "abs_food_bill_v1_"+String(u?.uid||u?.mobile||"guest").replace(/[^a-zA-Z0-9_-]/g,"_")}
function persist(){try{localStorage.setItem(key(),JSON.stringify(bill))}catch(e){}}
function quickAmountKey(){const u=currentUser();return "abs_food_quick_amounts_"+String(u?.uid||u?.mobile||"guest").replace(/[^a-zA-Z0-9_-]/g,"_")}
function quickAmounts(){try{const v=JSON.parse(localStorage.getItem(quickAmountKey())||"null");return Array.isArray(v)?v.filter(n=>Number.isFinite(Number(n))&&Number(n)>0).map(Number):[50,100,40,70,75]}catch(e){return[50,100,40,70,75]}}
function saveQuickAmounts(v){try{localStorage.setItem(quickAmountKey(),JSON.stringify(v))}catch(e){}}
function addQuickAmount(){const input=$("#foodCustomAmount"),n=Number(input?.value);if(!input||!Number.isFinite(n)||n<=0)return toast("Enter a valid amount greater than ₹0.");const values=quickAmounts();if(values.some(x=>x===n))return toast("This amount is already added.");if(values.length>=20)return toast("You can save up to 20 quick amounts.");values.push(n);saveQuickAmounts(values);step();toast("Custom amount added.");}
function removeQuickAmount(n){const values=quickAmounts().filter(x=>x!==Number(n));saveQuickAmounts(values);step();toast("Quick amount removed.");}

function explore(){
const a=[["💰","Add Income","Salary, bonus & other income","income"],["💸","Add Expense","Track spending by category","expense"],["📥","Bulk Data","Add many old records at once","bulk"],["🏦","Add Loan","Principal, interest & tenure","loan"],["💳","Add EMI","Record repayment","emi"],["📅","Loan Schedule","Principal & interest timeline","schedule"],["👥","People","Name, phone & balances","people"],["🤝","Ledger","Lena / Dena — receive & pay","ledger"],["🎯","Budget","Monthly spending limits","budget"],["💼","Career","Jobs & salary history","career"],["📊","Reports","Income, expense & Lena/Dena report","report"],["🧾","Statement","Filter and export a statement","statement"],["⚙️","Settings","Personalize the app","settings"],["🗂","Categories","Manage categories","categories"],["🕘","History","View records","history"],["✎","Edit Records","Correct saved records","editrecords"],["💬","Feedback","Share your experience","feedback"],["📘","Guide","Learn every feature","guide"],["🧮","Calculators","Normal calculator and food bill calculator","calculators"]];
$("#screen").innerHTML='<div class="explore-head"><div><div class="eyebrow">YOUR FINANCIAL TOOLKIT</div><div class="page-title">Explore</div><p class="page-sub">Calculators and tools for everyday tasks.</p></div><div class="explore-count">'+a.length+'<small>TOOLS</small></div></div><section class="abs-calculator-intro"><div><span>NEW TOOLS</span><b>Calculators</b><small>Quick calculations and food bill reports, separate from your finances.</small></div><span class="abs-calc-spark">✦</span></section><div class="explore-grid professional-grid">'+a.map((x,i)=>'<button class="action-card professional-action" style="animation-delay:'+(i*20)+'ms" onclick="openFeature(\''+x[3]+'\')"><div class="action-top"><div class="ico">'+x[0]+'</div><span>↗</span></div><b>'+x[1]+'</b><small>'+x[2]+'</small></button>').join("")+'</div>';
}
function calculatorMenu(){
$("#screen").innerHTML='<div class="abs-calc-page"><button class="abs-back" onclick="goTab(\'explore\')">← Explore</button><div class="page-title">Calculators</div><p class="page-sub">Choose the calculator you want to use.</p><div class="abs-calculator-options"><button class="abs-calc-option normal-option" onclick="openFeature(\'normal-calculator\')"><span>🧮</span><b>Normal Calculator</b><small>Everyday calculations</small><i>OPEN CALCULATOR →</i></button><button class="abs-calc-option food-option" onclick="openFeature(\'food-bill\')"><span>🍱</span><b>Food Bill Calculator</b><small>Lunch, dinner and date-wise receipt</small><i>CREATE FOOD BILL →</i></button></div></div>';
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
$("#screen").innerHTML='<div class="abs-calc-page"><button class="abs-back" onclick="goTab(\'explore\')">← Explore</button><div class="abs-food-step-top"><div><div class="eyebrow">FOOD BILL · '+(bill.index+1)+' OF '+bill.days.length+' DAYS</div><div class="page-title">'+dateLabel(d)+'</div></div><span class="abs-food-progress">'+pct+'%</span></div><div class="abs-food-progress-track"><i style="width:'+Math.max(3,pct)+'%"></i></div><div class="abs-food-meal-card"><span class="abs-food-icon">'+(m==="lunch"?"☀️":"🌙")+'</span><div class="eyebrow">MEAL '+(m==="lunch"?"01":"02")+'</div><h2>'+(m==="lunch"?"Lunch":"Dinner")+'</h2><p>Enter the '+m+' amount</p><label class="abs-amount-label">AMOUNT (₹)<input id="foodAmount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Enter amount" value="'+esc(v)+'"></label><div class="abs-quick-amounts">'+quickAmounts().map(n=>'<span class="abs-quick-amount-item"><button class="abs-quick-pick" onclick="absQuickFoodAmount('+n+')">₹'+n+'</button><button class="abs-quick-remove" aria-label="Remove ₹'+n+'" onclick="absRemoveQuickFoodAmount('+n+')">×</button></span>').join("")+'</div><div class="abs-quick-amount-add"><input id="foodCustomAmount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="Add your own amount"><button type="button" onclick="absAddQuickFoodAmount()">+ ADD</button></div><small class="abs-quick-help">Add or remove your own quick amounts. These are saved on this device for your account.</small><div class="abs-food-step-actions"><button class="secondary" onclick="absSkipFoodMeal()">SKIP MEAL</button><button class="primary" onclick="absNextFoodMeal()">SAVE & NEXT →</button></div><small class="abs-isolation-note">Skipped meals are shown as blank — no amount is added.</small></div><div class="abs-food-step-footer"><button class="abs-text-button" onclick="absBackFoodMeal()" '+(bill.index===0&&m==="lunch"?"disabled":"")+' >← Previous meal</button><button class="abs-text-button" onclick="absCancelFoodBill()">Cancel bill</button></div></div>';
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
const receiptRows=bill.days.map(d=>{const e=bill.entries[d],label=d.split("-").reverse().join("-");return '<div class="abs-receipt-day"><div class="abs-receipt-date">'+label+'</div><div class="abs-receipt-line"><span>Lunch</span><b>'+(e.lunch===""?"—":money(e.lunch))+'</b></div><div class="abs-receipt-line dinner-line"><span>Dinner</span><b>'+(e.dinner===""?"—":money(e.dinner))+'</b></div></div>'}).join("");
$("#screen").innerHTML='<div class="abs-calc-page abs-food-report"><div class="abs-receipt"><div class="abs-receipt-brand">ABS DASHBOARD</div><div class="abs-receipt-title">FOOD BILL RECEIPT</div><div class="abs-receipt-period">'+bill.start.split("-").reverse().join("-")+' — '+bill.end.split("-").reverse().join("-")+'</div><div class="abs-receipt-rule"></div><div class="abs-receipt-meta"><span>MEALS ENTERED</span><b>'+t.entered+'</b><span>SKIPPED</span><b>'+t.skipped+'</b></div><div class="abs-receipt-rule"></div><div class="abs-receipt-list">'+receiptRows+'</div><div class="abs-receipt-rule double"></div><div class="abs-receipt-total"><span>GRAND TOTAL</span><b>'+money(t.total)+'</b></div><div class="abs-receipt-foot">Thank you<br>Calculation only · Not part of financial records</div></div><div class="abs-report-actions receipt-actions"><button class="abs-print-button" onclick="absPrintFoodReport()">PRINT / SAVE PDF</button><button class="abs-share-button" onclick="absShareFoodReport()">SHARE RECEIPT</button><button class="abs-new-button" onclick="absNewFoodBill()">NEW FOOD BILL</button></div></div>';
}
function receiptText(){
const t=totals(),lines=["ABS DASHBOARD","FOOD BILL RECEIPT",bill.start.split("-").reverse().join("-")+" to "+bill.end.split("-").reverse().join("-"),"------------------------"];
bill.days.forEach(d=>{const e=bill.entries[d],label=d.split("-").reverse().join("-");lines.push(label+"  Lunch  "+(e.lunch===""?"—":money(e.lunch)));lines.push("           Dinner "+(e.dinner===""?"—":money(e.dinner)))});
lines.push("------------------------","TOTAL: "+money(t.total),"Entered meals: "+t.entered,"Skipped meals: "+t.skipped,"Calculation only — not added to financial records.");
return lines.join("\n");
}
async function shareReport(){
const text=receiptText();
if(navigator.share){try{await navigator.share({title:"ABS Food Bill Receipt",text});return}catch(e){if(e.name==="AbortError")return}}
try{await navigator.clipboard.writeText(text);toast("Receipt copied. Paste it in WhatsApp or Instagram.")}catch(e){window.open("https://wa.me/?text="+encodeURIComponent(text),"_blank")}
}
function printReport(){
const t=totals(),rows=bill.days.map(d=>{const e=bill.entries[d],label=d.split("-").reverse().join("-");return '<div class="pday"><b>'+label+'</b><div><span>Lunch</span><strong>'+(e.lunch===""?"—":money(e.lunch))+'</strong></div><div><span>Dinner</span><strong>'+(e.dinner===""?"—":money(e.dinner))+'</strong></div></div>'}).join("");
const w=window.open("","_blank");if(!w)return toast("Allow pop-ups to print the receipt.");
w.document.write('<!doctype html><html><head><title>ABS Food Bill Receipt</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>@page{size:auto;margin:8mm}body{font:11px Arial;color:#172033;margin:0 auto;padding:12px;max-width:320px}.center{text-align:center}.rule{border-top:1px dashed #777;margin:9px 0}.pday{padding:5px 0;border-bottom:1px dotted #bbb}.pday>b{display:block;margin-bottom:4px}.pday div{display:flex;justify-content:space-between;padding:2px 0 2px 12px}.total{display:flex;justify-content:space-between;font-size:16px;font-weight:bold;margin-top:10px}.muted{font-size:9px;text-align:center;color:#666;margin-top:14px}</style></head><body><div class="center"><b>ABS DASHBOARD</b><h3>FOOD BILL RECEIPT</h3>'+bill.start.split("-").reverse().join("-")+' — '+bill.end.split("-").reverse().join("-")+'</div><div class="rule"></div>'+rows+'<div class="rule"></div><div class="total"><span>GRAND TOTAL</span><span>'+money(t.total)+'</span></div><p>Entered: '+t.entered+' · Skipped: '+t.skipped+'</p><div class="muted">Calculation only · Not part of financial records</div><script>window.onload=()=>window.print()<\\/script></body></html>');
w.document.close();
}
function openFood(){try{const saved=JSON.parse(localStorage.getItem(key())||"null");if(saved&&!saved.complete){bill=saved;step();return}if(saved?.complete){bill=saved;report();return}}catch(e){}bill=null;setupBill()}
function cancel(){if(confirm("Cancel this food bill?")){localStorage.removeItem(key());bill=null;setupBill()}}
window.renderExplore=explore;
window.openFeature=function(type){if(type==="calculators")return calculatorMenu();if(type==="normal-calculator")return normal();if(type==="food-bill")return openFood();return originalOpenFeature(type)};
window.absCalcKey=calc;window.absStartFoodBill=startBill;window.absQuickFoodAmount=n=>{const e=$("#foodAmount");if(e)e.value=String(n)};window.absAddQuickFoodAmount=addQuickAmount;window.absRemoveQuickFoodAmount=removeQuickAmount;
window.absNextFoodMeal=()=>next(false);window.absSkipFoodMeal=()=>next(true);window.absBackFoodMeal=back;
window.absPrintFoodReport=printReport;window.absShareFoodReport=shareReport;window.absNewFoodBill=()=>{bill=null;localStorage.removeItem(key());setupBill()};window.absCancelFoodBill=cancel;
function installPull(){
const shell=$("#mainApp"),screen=$("#screen");if(!shell||!screen||shell.dataset.absPullReady)return;shell.dataset.absPullReady="1";
let y=0,last=0,tracking=false,busy=false;const tip=document.createElement("div");tip.className="abs-pull-indicator";tip.textContent="↓ Pull to refresh";shell.insertBefore(tip,screen);
shell.addEventListener("touchstart",e=>{if(busy||!e.touches.length||e.target.closest("input,textarea,select,button,[contenteditable=true]"))return;if(window.scrollY>4||screen.scrollTop>4)return;y=last=e.touches[0].clientY;tracking=true},{passive:true});
shell.addEventListener("touchmove",e=>{if(!tracking||!e.touches.length)return;last=e.touches[0].clientY;const d=last-y;if(d<0){tracking=false;tip.classList.remove("visible","ready");return}if(d>0){tip.classList.add("visible");tip.classList.toggle("ready",d>72);tip.textContent=d>72?"↑ Release to refresh":"↓ Pull to refresh"}},{passive:true});
shell.addEventListener("touchend",async()=>{if(!tracking)return;tracking=false;if(last-y>72&&!busy&&currentUser()&&typeof window.refreshAppData==="function"){busy=true;tip.classList.add("visible","loading");tip.textContent="↻ Refreshing…";try{await window.refreshAppData()}finally{busy=false;tip.classList.remove("visible","ready","loading")}}else tip.classList.remove("visible","ready")},{passive:true});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installPull);else installPull();window.addEventListener("load",installPull);
})();