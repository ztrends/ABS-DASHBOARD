/* ABS DASHBOARD — Pro Admin Experience
   Adds navigation, analytics and search enhancements without replacing existing API actions. */
(function(){
  'use strict';
  const byId = id => document.getElementById(id);
  const titles = {
    dashboard:'Overview',
    users:'Users & Accounts',
    ads:'Ads & Campaigns',
    notifications:'Broadcasts',
    support:'Support Inbox',
    feedback:'Feedback'
  };
  const currency = value => '₹' + Number(value || 0).toLocaleString('en-IN',{maximumFractionDigits:0});
  const truthy = value => value === true || value === 1 || value === 'true';
  const safeDate = value => {
    if(!value) return null;
    const date = value.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const searchValue = id => (byId(id)?.value || '').trim().toLowerCase();

  window.showView = function(name){
    if(!titles[name]) return;
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active',view.dataset.view === name));
    document.querySelectorAll('.nav-link[data-view]').forEach(link => link.classList.toggle('active',link.dataset.view === name));
    const title = byId('topViewTitle');
    if(title) title.textContent = titles[name];
    const global = byId('globalSearch');
    if(global) global.value = '';
    const sidebar = byId('adminSidebar');
    if(sidebar) sidebar.classList.remove('open');
    const backdrop = byId('sidebarBackdrop');
    if(backdrop) backdrop.classList.remove('visible');
    window.scrollTo({top:0,behavior:'smooth'});
  };

  function applySearch(inputId, render){
    const input = byId(inputId);
    if(!input || input.dataset.proBound === '1') return;
    input.dataset.proBound = '1';
    input.addEventListener('input',render);
  }

  // Keep the existing data renderers and actions, adding client-side search only.
  const baseRenderUsers = window.renderUsers || renderUsers;
  window.renderUsers = function(){
    if(typeof state === 'undefined' || !byId('users')) return baseRenderUsers();
    const query = searchValue('userSearch') || searchValue('globalSearch');
    const original = state.users;
    if(query) state.users = original.filter(user => [user.name,user.mobile,user.absId,user.email].some(value => String(value || '').toLowerCase().includes(query)));
    baseRenderUsers();
    state.users = original;
  };
  const baseRenderAds = window.renderAds || renderAds;
  window.renderAds = function(){
    if(typeof state === 'undefined' || !byId('ads')) return baseRenderAds();
    const query = searchValue('adSearch') || searchValue('globalSearch');
    const original = state.ads;
    if(query) state.ads = original.filter(ad => [ad.title,ad.text,ad.badge,ad.link].some(value => String(value || '').toLowerCase().includes(query)));
    baseRenderAds();
    state.ads = original;
  };
  const baseRenderFeedback = window.renderFeedback || renderFeedback;
  window.renderFeedback = function(){
    if(typeof state === 'undefined' || !byId('feedback')) return baseRenderFeedback();
    const query = searchValue('feedbackSearch') || searchValue('globalSearch');
    const original = state.feedback;
    if(query) state.feedback = original.filter(item => [item.name,item.mobile,item.type,item.message].some(value => String(value || '').toLowerCase().includes(query)));
    baseRenderFeedback();
    state.feedback = original;
  };
  const baseRenderSupport = window.renderSupportRequests || renderSupportRequests;
  window.renderSupportRequests = function(){
    if(typeof state === 'undefined' || !byId('supportRequests')) return baseRenderSupport();
    const query = searchValue('supportSearch') || searchValue('globalSearch');
    const original = state.supportRequests;
    if(query) state.supportRequests = original.filter(item => [item.name,item.mobile,item.abs_id,item.issue,item.description,item.status].some(value => String(value || '').toLowerCase().includes(query)));
    baseRenderSupport();
    state.supportRequests = original;
  };
  const baseRenderNotifications = window.renderAdminNotifications || renderAdminNotifications;
  window.renderAdminNotifications = function(){
    if(typeof state === 'undefined' || !byId('notifications')) return baseRenderNotifications();
    const query = searchValue('notificationSearch') || searchValue('globalSearch');
    const original = state.notifications;
    if(query) state.notifications = original.filter(item => [item.title,item.message,item.type,item.link].some(value => String(value || '').toLowerCase().includes(query)));
    baseRenderNotifications();
    state.notifications = original;
  };

  function renderGrowth(){
    const host = byId('growthChart');
    if(!host || typeof state === 'undefined') return;
    const users = Array.isArray(state.users) ? state.users : [];
    const days = [];
    for(let offset=6;offset>=0;offset--){
      const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-offset);
      days.push({date:d,label:d.toLocaleDateString('en-IN',{weekday:'short'}),count:0});
    }
    let dated = 0;
    users.forEach(user=>{
      const date = safeDate(user.createdAt || user.created_at || user.joinedAt || user.registrationDate);
      if(!date) return;
      dated++;
      const day = days.find(item=>item.date.toDateString()===date.toDateString());
      if(day) day.count++;
    });
    if(!dated){
      host.innerHTML = '<div class="empty">Registration dates are not available in the current user profiles yet. User count is still shown above.</div>';
      return;
    }
    const max = Math.max(1,...days.map(x=>x.count));
    const points = days.map((item,index)=>{
      const x = 10 + index* (780/6);
      const y = 172 - (item.count/max)*136;
      return {x,y,...item};
    });
    const line = points.map(p=>p.x+','+p.y).join(' ');
    const area = '10,180 '+line+' 790,180';
    host.innerHTML = `<svg viewBox="0 0 800 205" role="img" aria-label="New user registrations over the last seven days">
      <defs><linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#e49c63" stop-opacity=".30"/><stop offset="100%" stop-color="#e49c63" stop-opacity="0"/></linearGradient></defs>
      <line class="chart-gridline" x1="8" y1="42" x2="792" y2="42"/><line class="chart-gridline" x1="8" y1="88" x2="792" y2="88"/><line class="chart-gridline" x1="8" y1="134" x2="792" y2="134"/>
      <polygon class="chart-area" points="${area}"/><polyline class="chart-line" points="${line}"/>
      ${points.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="5" fill="#e9a56d" stroke="#17191e" stroke-width="3"><title>${p.label}: ${p.count} new users</title></circle>`).join('')}
      ${points.map(p=>`<text x="${p.x}" y="199" fill="#848a95" font-size="11" text-anchor="middle">${p.label}</text>`).join('')}
    </svg>`;
  }

  function updateOverview(){
    if(typeof state === 'undefined') return;
    const users = Array.isArray(state.users) ? state.users : [];
    const verified = users.filter(u=>truthy(u.verified)).length;
    const standard = Math.max(0,users.length-verified);
    const openSupport = (state.supportRequests||[]).filter(r=>String(r.status||'open')!=='resolved').length;
    const resolvedSupport = (state.supportRequests||[]).filter(r=>String(r.status||'')==='resolved').length;
    const activeAds = (state.ads||[]).filter(a=>truthy(a.active)).length;
    const set = (id,value) => {const el=byId(id);if(el)el.textContent=value;};
    set('userCount',users.length.toLocaleString('en-IN'));
    set('requestCount',verified.toLocaleString('en-IN'));
    set('verifiedCount',verified.toLocaleString('en-IN'));
    set('standardCount',standard.toLocaleString('en-IN'));
    set('feedbackCount',(state.feedback||[]).length.toLocaleString('en-IN'));
    set('adCount',activeAds.toLocaleString('en-IN'));
    set('supportKpi',openSupport.toLocaleString('en-IN'));
    set('openSupportFoot',openSupport+' open · '+resolvedSupport+' resolved');
    set('openSupportCount',openSupport.toLocaleString('en-IN'));
    set('supportTotalView',(state.supportRequests||[]).length.toLocaleString('en-IN'));
    set('supportOpenView',openSupport.toLocaleString('en-IN'));
    set('supportResolvedView',resolvedSupport.toLocaleString('en-IN'));
    set('broadcastCount',(state.notifications||[]).length.toLocaleString('en-IN'));
    set('feedbackMiniCount',(state.feedback||[]).length.toLocaleString('en-IN'));
    set('activeAdsMini',activeAds.toLocaleString('en-IN'));
    const pct = users.length ? Math.round(verified/users.length*100) : 0;
    set('verifiedPercent',pct+'%');
    const donut=byId('accountDonut');
    if(donut) donut.style.background=`conic-gradient(#e39a5c 0 ${pct}%,#4e525a ${pct}% 100%)`;
    const income=users.reduce((sum,u)=>sum+Number(u.income||0),0);
    const expense=users.reduce((sum,u)=>sum+Number(u.expense||0),0);
    set('sumIncome',currency(income));set('sumExpense',currency(expense));
    const recent=byId('recentUsers');
    if(recent){
      const latest=users.slice().sort((a,b)=>(safeDate(b.createdAt||b.created_at)?.getTime()||0)-(safeDate(a.createdAt||a.created_at)?.getTime()||0)).slice(0,5);
      recent.innerHTML=latest.length?latest.map(user=>{
        const initials=String(user.name||'U').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
        return `<div class="recent-user"><div class="avatar">${escapeHtml(initials)}</div><div class="grow"><b>${escapeHtml(user.name||'ABS User')}</b><small>${escapeHtml(user.absId||'No ABS ID')} · ${escapeHtml(user.mobile||'')}</small></div><strong>${truthy(user.verified)?'✓ VERIFIED':'REGISTERED'}</strong></div>`;
      }).join(''):'<div class="empty">No users registered yet.</div>';
    }
    const today=byId('todayLabel');if(today)today.textContent=new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
    renderGrowth();
  }

  function escapeHtml(value){
    return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  const originalStats = renderStats;
  renderStats = function(){
    originalStats();
    updateOverview();
  };

  window.exportUsersCsv = function(){
    const users = (typeof state!=='undefined' && Array.isArray(state.users)) ? state.users : [];
    const fields=['name','mobile','absId','verified','premium','income','expense','net','createdAt'];
    const rows=[fields.join(',')].concat(users.map(user=>fields.map(field=>{
      let value=user[field] ?? '';
      if(typeof value==='boolean') value=value?'Yes':'No';
      value=String(value).replace(/^[=+@\-]/,'\u0027$&');
      return '"'+value.replace(/"/g,'""')+'"';
    }).join(',')));
    const blob=new Blob(['\ufeff'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download='ABS-DASHBOARD-users-'+new Date().toISOString().slice(0,10)+'.csv';
    document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
  };

  function bindSearches(){
    applySearch('userSearch',()=>window.renderUsers());
    applySearch('adSearch',()=>window.renderAds());
    applySearch('feedbackSearch',()=>window.renderFeedback());
    applySearch('supportSearch',()=>window.renderSupportRequests());
    applySearch('notificationSearch',()=>window.renderAdminNotifications());
    const global=byId('globalSearch');
    if(global && global.dataset.proBound!=='1'){
      global.dataset.proBound='1';
      global.addEventListener('input',()=>{
        const active=document.querySelector('.view.active')?.dataset.view;
        if(active==='users') window.renderUsers();
        if(active==='ads') window.renderAds();
        if(active==='support') window.renderSupportRequests();
        if(active==='feedback') window.renderFeedback();
        if(active==='notifications') window.renderAdminNotifications();
      });
    }
  }

  function bindMobileMenu(){
    const sidebar=byId('adminSidebar'),button=byId('menuToggle'),backdrop=byId('sidebarBackdrop');
    if(!sidebar||!button)return;
    if(backdrop)backdrop.style.cssText='position:fixed;inset:0;background:#0009;z-index:55;opacity:0;pointer-events:none;transition:opacity .2s';
    const close=()=>{sidebar.classList.remove('open');if(backdrop){backdrop.style.opacity='0';backdrop.style.pointerEvents='none';}};
    button.addEventListener('click',()=>{const open=!sidebar.classList.contains('open');sidebar.classList.toggle('open',open);if(backdrop){backdrop.style.opacity=open?'1':'0';backdrop.style.pointerEvents=open?'auto':'none';}});
    if(backdrop)backdrop.addEventListener('click',close);
    document.querySelectorAll('.nav-link[data-view]').forEach(link=>link.addEventListener('click',close));
  }

  document.addEventListener('DOMContentLoaded',()=>{
    bindSearches();bindMobileMenu();
    const loginForm=byId('loginForm');
    if(loginForm && loginForm.dataset.proSubmit!=='1'){
      loginForm.dataset.proSubmit='1';
      loginForm.addEventListener('submit',()=>{setTimeout(updateOverview,400)});
    }
    updateOverview();
  });

  // renderStats is triggered by the existing refresh cycle after successful admin login.
  // This observer covers admin pages restored from an already valid session.
  const previousRefresh=window.refreshAdmin;
  if(typeof previousRefresh==='function'){
    window.refreshAdmin=async function(){const result=await previousRefresh.apply(this,arguments);updateOverview();return result;};
  }
})();