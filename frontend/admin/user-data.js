/* ABS DASHBOARD — user-wise financial data workspace */
(function(){
  'use strict';
  const byId = id => document.getElementById(id);
  const money = value => '₹' + Number(value || 0).toLocaleString('en-IN',{maximumFractionDigits:2});
  let selectedUser = null;
  let selectedDetails = null;
  const cache = new Map();

  function safeText(value){
    if(value === null || value === undefined || value === '') return '—';
    if(typeof value === 'object'){
      if(value.seconds) return new Date(value.seconds * 1000).toLocaleString('en-IN');
      return JSON.stringify(value);
    }
    return String(value);
  }

  function renderDirectory(){
    const host = byId('userDataDirectory');
    if(!host || typeof state === 'undefined') return;
    const q = (byId('userDataSearch')?.value || byId('globalSearch')?.value || '').trim().toLowerCase();
    const users = (state.users || []).filter(user =>
      [user.name,user.mobile,user.absId,user.email].some(value => String(value || '').toLowerCase().includes(q))
    );
    if(!users.length){
      host.innerHTML = '<div class="empty">No matching user accounts found.</div>';
      return;
    }
    host.innerHTML = users.map(user => {
      const uid = escAttr(user.uid || '');
      return '<div class="userdata-row" style="display:grid;grid-template-columns:minmax(0,1.5fr) repeat(2,minmax(90px,.65fr)) auto;align-items:center;gap:12px;padding:14px 2px;border-bottom:1px solid var(--line)">' +
        '<div><b>'+esc(user.name || 'ABS User')+'</b><div class="sub">'+esc(user.mobile || 'No mobile')+' · ABS ID: '+esc(user.absId || '—')+'</div></div>' +
        '<div class="userdata-metric"><small class="muted">Income</small><b>'+money(user.income)+'</b></div>' +
        '<div class="userdata-metric"><small class="muted">Expense</small><b>'+money(user.expense)+'</b></div>' +
        '<button class="btn secondary" data-open-user="'+uid+'">'+(selectedUser===user.uid?'Selected':'View data')+'</button></div>';
    }).join('');
  }

  function recordTable(title, rows){
    const data = Array.isArray(rows) ? rows : [];
    if(!data.length) return '<div class="sub" style="padding:8px 0">No '+title.toLowerCase()+' records saved.</div>';
    const body = data.map(row => {
      const date = row.date || row.start || row.createdAt || row.created_at || row.timestamp;
      const detail = row.category || row.source || row.name || row.loan || row.directionLabel || row.description || row.note || row.type;
      const amount = row.amount ?? row.principal ?? row.paid ?? row.value ?? 0;
      const status = row.status || row.direction || row.mode || '';
      return '<tr><td>'+esc(safeText(date))+'</td><td>'+esc(safeText(detail))+'</td><td class="num">'+money(amount)+'</td><td>'+esc(safeText(status))+'</td></tr>';
    }).join('');
    return '<div class="userdata-records"><h3>'+title+' · '+data.length+'</h3><div class="userdata-table-wrap"><table class="userdata-table"><thead><tr><th>Date</th><th>Category / Details</th><th>Amount</th><th>Status / Type</th></tr></thead><tbody>'+body+'</tbody></table></div></div>';
  }

  function renderDetails(details, user){
    const host = byId('userDataDetails');
    if(!host) return;
    const summary = details.summary || {};
    const records = details.records || {};
    const balance = Number(summary.income || 0) - Number(summary.expense || 0) - Number(summary.emi || 0);
    host.innerHTML =
      '<div class="userdata-kpis" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0">' +
      [['Income',summary.income],['Expenses',summary.expense],['EMI paid',summary.emi],['Net balance',balance],['Loan principal',summary.loanPrincipal],['To receive',summary.toReceive],['To pay',summary.toPay]].map(item=>'<div class="panel" style="padding:12px;min-width:0"><small class="muted">'+item[0]+'</small><b style="display:block;margin-top:6px;overflow-wrap:anywhere">'+money(item[1])+'</b></div>').join('') +
      '</div>' +
      recordTable('Income',records.income) +
      recordTable('Expenses',records.expenses) +
      recordTable('Loans',records.loans) +
      recordTable('EMI payments',records.emi) +
      recordTable('Lena / Dena',records.ledger);
    const title = byId('userDataDetailTitle');
    const subtitle = byId('userDataDetailSubtitle');
    if(title) title.textContent = (user.name || 'User') + ' — Financial records';
    if(subtitle) subtitle.textContent = (user.mobile || 'No mobile') + ' · ABS ID: ' + (user.absId || '—') + ' · ' + user.uid;
  }

  window.renderUserData = renderDirectory;

  window.openUserData = async function(uid){
    const user = (state.users || []).find(item => item.uid === uid);
    if(!user) return;
    selectedUser = uid;
    selectedDetails = null;
    renderDirectory();
    const title = byId('userDataDetailTitle');
    const subtitle = byId('userDataDetailSubtitle');
    const host = byId('userDataDetails');
    if(title) title.textContent = (user.name || 'User') + ' — Financial records';
    if(subtitle) subtitle.textContent = (user.mobile || 'No mobile') + ' · ABS ID: ' + (user.absId || '—');
    if(cache.has(uid)){
      selectedDetails = cache.get(uid);
      renderDetails(selectedDetails,user);
      return;
    }
    host.innerHTML = '<div class="empty">Loading saved financial records…</div>';
    try{
      const result = await api('/admin/firebase-users/' + encodeURIComponent(uid) + '/details');
      if(selectedUser !== uid) return;
      cache.set(uid,result);
      selectedDetails = result;
      renderDetails(result,user);
    }catch(error){
      host.innerHTML = '<div class="empty">Unable to load this user data: '+esc(error.message || 'Request failed')+'</div>';
    }
  };

  window.exportUserDataCsv = function(){
    if(!selectedDetails || !selectedUser) return alert('Please open a user record first.');
    const user = (state.users || []).find(item => item.uid === selectedUser);
    const records = selectedDetails.records || {};
    const lines = [['User','ABS ID','Record type','Date','Details','Amount','Status']];
    Object.entries({Income:records.income,Expenses:records.expenses,Loans:records.loans,'EMI payments':records.emi,'Lena Dena':records.ledger}).forEach(([type,items])=>{
      (Array.isArray(items)?items:[]).forEach(row=>{
        lines.push([user?.name || '',user?.absId || '',type,row.date || row.start || row.createdAt || row.created_at || '',row.category || row.source || row.name || row.loan || row.directionLabel || row.description || row.note || '',row.amount ?? row.principal ?? row.paid ?? row.value ?? '',row.status || row.direction || row.mode || '']);
      });
    });
    const csv = lines.map(row=>row.map(value=>{
      let text = String(value ?? '').replace(/^[=+@-]/,"'$&");
      return '"'+text.replace(/"/g,'""')+'"';
    }).join(',')).join('\r\n');
    const blob = new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'ABS-user-data-'+(user?.absId || selectedUser)+'.csv';
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  };

  document.addEventListener('DOMContentLoaded',()=>{
    const style = document.createElement('style');
    style.textContent = '.userdata-table{width:100%;border-collapse:collapse;font-size:10px}.userdata-table th,.userdata-table td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:left}.userdata-table th{position:sticky;top:0;background:#1b1e24;color:#aeb4bf;font-size:9px;text-transform:uppercase}.userdata-table td{color:#d4d7dd}.userdata-table td.num{text-align:right;white-space:nowrap;font-weight:700}.userdata-table-wrap{max-height:280px;overflow:auto;border:1px solid var(--line);border-radius:10px}.userdata-records{margin:14px 0}.userdata-records h3{font:800 11px Manrope,sans-serif;color:#e4a16d;margin:0 0 8px}.userdata-kpis .panel{background:#171a20;border:1px solid var(--line);border-radius:10px}';
    document.head.appendChild(style);
    const host = byId('userDataDirectory');
    if(host){
      host.addEventListener('click',event=>{
        const button = event.target.closest('[data-open-user]');
        if(button) window.openUserData(button.getAttribute('data-open-user'));
      });
    }
    const search = byId('userDataSearch');
    if(search) search.addEventListener('input',renderDirectory);
  });

  const originalShowView = window.showView;
  window.showView = function(name){
    if(name !== 'user-data'){
      if(typeof originalShowView === 'function') return originalShowView(name);
      return;
    }
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active',view.dataset.view === name));
    document.querySelectorAll('.nav-link[data-view]').forEach(link => link.classList.toggle('active',link.dataset.view === name));
    const title = byId('topViewTitle');
    if(title) title.textContent = 'User Data';
    const search = byId('globalSearch');
    if(search) search.value = '';
    window.scrollTo({top:0,behavior:'smooth'});
    renderDirectory();
  };

  const baseRefresh = window.refreshAdmin;
  if(typeof baseRefresh === 'function'){
    window.refreshAdmin = async function(){
      const result = await baseRefresh.apply(this,arguments);
      renderDirectory();
      return result;
    };
  }
})();