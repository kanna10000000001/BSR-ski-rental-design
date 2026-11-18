/* 板上有雪 · 浏览器后台。生产权限由服务端账号决定。 */
(() => {
const $ = selector => document.querySelector(selector);
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = value => '¥' + (Number(value || 0) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }) : '—';
const D = window.BsrDomain, C = window.BsrCustomer, P = window.BsrPresentation;
const icons = {
  home: '<path d="M3 10 12 3l9 7v10H3Z"/><path d="M9 20v-7h6v7"/>', calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v5m10-5v5M3 11h18m-12 4h2m3 0h2"/>',
  equipment: '<path d="m7 3 4 18M14 3l4 18M5 17h15M5 4l3-1m5 1 3-1"/>', contracts: '<path d="M5 3h10l4 4v14H5Z"/><path d="M9 11h6m-6 4h6m-6 3h3m2-15v5h5"/>', repair: '<path d="M14 5a5 5 0 0 0-7 6l-4 7 3 3 7-7a5 5 0 0 0 6-7l-4 4-4-4Z"/>', people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4m2-16a3 3 0 0 1 0 6m2 10v-4a5 5 0 0 0-3-4"/>', history: '<path d="M4 8a9 9 0 1 1-1 6m1-11v6h6m2-3v7l4 2"/>', arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', plus: '<path d="M12 4v16M4 12h16"/>', search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>', logout: '<path d="M9 4H4v16h5m4-12 4 4-4 4m-5-4h13"/>', refresh: '<path d="M20 10a8 8 0 1 0-1 7m1-14v7h-7"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>', snow: '<path d="M12 2v20M3 7l18 10M3 17 21 7m-12-2 3 3 3-3m-6 14 3-3 3 3"/>'
};
const icon = (name, size = 19) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.snow}</svg>`;
const art = `<svg class="hero-art" viewBox="0 0 330 200" fill="none" aria-hidden="true"><circle cx="256" cy="43" r="23" fill="#c5d7a9"/><path d="m0 200 92-139 57 87 57-112 124 164" fill="#c9dac3"/><path d="m117 200 89-164 124 164" fill="#abc4a8"/><path d="m206 36-30 56 20-8 12 18 11-18 13 9Z" fill="#f4f8ee"/><path d="m92 61-29 44 20-7 10 11 9-12 18 7Z" fill="#f4f8ee"/><g transform="rotate(18 235 155)"><rect x="221" y="94" width="9" height="112" rx="4.5" fill="#466e51"/><rect x="240" y="86" width="9" height="112" rx="4.5" fill="#65866a"/><path d="M220 139h12m7-6h12" stroke="#e3ead8" stroke-width="4"/></g></svg>`;
const tabs = [['home','工作台','home'],['calendar','取还日历','calendar'],['bookings','预约受理','calendar'],['customers','客户档案','people'],['equipment','装备库存','equipment'],['contracts','租赁合同','contracts'],['repairs','维修工单','repair'],['people','人员与排班','people'],['reports','经营报表','history'],['history','操作记录','history']];
const titles = Object.fromEntries(tabs.map(x => [x[0], x[1]]));
const roleNames = { manager: '经营负责人', staff: '门店员工', contractor: '维修承包商' };
let state = null, user = null, tab = 'home', store = '*', query = '', filter = '全部', modal = null, busy = false;
let demo = false, demoState = null, token = sessionStorage.getItem('bsr-web-token') || '';
let toastTimer, pageNumber = 1, fromDate = '', toDate = '', calendarDate = P.day(), calendarMode = 'week';
function toast(text) { $('#toast').textContent = text; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500); }
function storeName(id) { return ((state && state.stores) || []).find(x => x.id === id)?.name || (id ? id : '顾客持有'); }
function status(text) { const gray = ['已关闭','已取消','已完成','已开单'].includes(text); const amber = ['待确认','待检查','待处理','待维修','待验收','换装预留','故障待报修'].includes(text); const blue=['已确认','生效','租出','维修中'].includes(text); return `<span class="status ${gray ? 'gray' : amber ? 'amber' : blue ? 'blue' : ''}">${esc(text)}</span>`; }
function button(text, attrs = '', cls = '') { return `<button class="button ${cls}" ${attrs}>${esc(text)}</button>`; }
function matches(value) { return !query || JSON.stringify(value).toLowerCase().includes(query.toLowerCase()); }
async function api(action, payload = {}, requestId) {
  if (demo) {
    if (action === 'load') return { state: D.view(demoState, user), user };
    if (action === 'logout') return { ok: true };
    demoState = C.adminApply(demoState, action, payload, user, D);
    localStorage.setItem('bsr-admin-demo-v2', JSON.stringify(demoState));
    return { state: D.view(demoState, user), user };
  }
  const response = await fetch(window.BSR_WEB_CONFIG.apiBase, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, payload, requestId }) });
  const data = await response.json().catch(() => { throw Error('后台接口尚未连接，请检查部署地址'); });
  if (!data.ok) throw Error(data.message || '处理失败');
  return data;
}
function login(error = '') {
  $('#overlay').innerHTML = ''; state = null; user = null;
  $('#app').innerHTML = `<div class="login-screen"><section class="login-art"><div class="brand"><div class="brand-mark">╱╱</div><div><strong>板上有雪</strong><small>BSR · SKI RENTALS</small></div></div><div><div class="eyebrow">A BETTER DAY ON THE SLOPES</div><h1>好装备，<br>好服务，<br>每一程都从容。</h1><p>把门店、装备和服务连接起来。<br>BSR 多门店滑雪租赁管理系统 · 课程实现</p></div>${art}<p>顾客微信小程序 + 门店网页后台 + 腾讯云</p></section><section class="login-form-area"><form id="login-form" class="login-form"><div class="eyebrow">WELCOME BACK</div><h2 style="margin-top:14px">登录门店工作台</h2><div class="muted">使用管理员为你配置的后台账号。</div>${error ? `<div class="form-error">${esc(error)}</div>` : ''}<label class="field"><span>账号</span><input class="input" name="username" autocomplete="username" placeholder="请输入后台账号" required maxlength="32"></label><label class="field"><span>密码</span><input class="input" name="password" type="password" autocomplete="current-password" placeholder="请输入密码" required maxlength="128"></label><button class="button primary" type="submit">登录工作台 ${icon('arrow',16)}</button><div class="separator"></div><button class="button" type="button" data-demo>体验本机演示 ${icon('arrow',16)}</button><div class="login-foot">演示模式使用本机虚构数据，不写入腾讯云。<br>正式后台会验证账号权限，连续5次失败后暂时锁定。<br>课程演示 · 账号由负责人提供</div></form></section></div>`;
  $('#login-form').onsubmit = async event => {
    event.preventDefault(); const form = new FormData(event.target); const b = event.target.querySelector('[type=submit]'); b.disabled = true; b.textContent = '正在登录…';
    try { const data = await api('login', { username: form.get('username'), password: form.get('password') }); token = data.token; sessionStorage.setItem('bsr-web-token', token); await load(); }
    catch (err) { login(err.message); }
  };
  $('[data-demo]').onclick = startDemo;
}
function startDemo() {
  demo = true; token = ''; user = { username: 'demo-manager', role: 'manager', employeeId: 'E01', name: '演示负责人' };
  try { state = JSON.parse(localStorage.getItem('bsr-admin-demo-v2')); } catch (_) { state = null; }
  if (!state) {
    state = D.seed();
    state = C.applyCustomer(state, 'reservationCreate', { requestId: 'demo_booking_00001', storeId: 'east', startDate: D.dayAt(new Date()), days: 3, name: '林同学（演示）', email: 'demo@example.com', phone: '虚构联系电话', level: '中级', equipmentIds: ['3828','H100'], consent: true, note: '希望上午到店选配' }, 'demo-customer');
  }
  demoState = state; state = D.view(demoState, user); tab = 'home'; render();
}
async function load() {
  const data = await api('load'); state = data.state; user = data.user;
  if (user.role === 'contractor' && !['home','repairs'].includes(tab)) tab = 'repairs';
  render();
}
function scoped(kind, rows, withFilters = false) {
  return P.filterRows(state,kind,rows,{store,...(withFilters?{query,status:filter,from:fromDate,to:toDate}:{})});
}
function metrics() {
  const equipment=scoped('equipment',state.equipment), contracts=scoped('contracts',state.contracts), bookings=scoped('bookings',state.reservations||[]);
  return {available:equipment.filter(x=>x.status==='可租').length,rented:equipment.filter(x=>x.status==='租出').length,
    bookings:bookings.filter(x=>x.status==='待确认').length,repairs:scoped('repairs',state.repairs).filter(x=>x.status!=='已关闭').length,
    revenue:contracts.reduce((n,c)=>n+c.payments.reduce((a,p)=>a+p.amount,0),0)};
}
function table(headers, rows, empty = '当前条件下暂无记录', paged = true) {
  const result=P.paginate(rows,pageNumber,10); if(paged)pageNumber=result.page;
  const visible=paged?result.rows:rows;
  return `<div class="table-wrap"><table class="table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${visible.join('')}</tbody></table>${rows.length?`<div class="table-footer"><span>共 ${rows.length} 条记录${paged?` · 第 ${result.page} / ${result.pages} 页`:''}</span>${paged?`<div class="actions">${button('上一页',`data-page="${result.page-1}" ${result.page===1?'disabled':''}`,'small')}${button('下一页',`data-page="${result.page+1}" ${result.page===result.pages?'disabled':''}`,'small')}</div>`:''}</div>`:`<div class="empty">${icon('snow',28)}${esc(empty)}<div>可调整门店或筛选条件后再试</div></div>`}</div>`;
}
function bookingRows(rows) {
  return rows.map(r => `<tr><td><strong>${esc(r.name)}</strong><span class="mono">${esc(r.id)}</span></td><td>${esc(storeName(r.storeId))}<br><span class="muted">${esc(r.startDate)} · ${r.days}天</span></td><td>${r.items.length} 件<br><span class="muted">${money(r.estimate)}</span></td><td>${status(r.status)}</td><td>${button(({待确认:'核对并受理',已确认:'准备到店开单',已开单:'查看已开合同',已取消:'查看取消记录'})[r.status]||'查看预约',`data-booking="${esc(r.id)}"`,'small')}</td></tr>`);
}
function home() {
  const m=metrics(), today=P.day(), contractor=user.role==='contractor';
  const myRepairs=scoped('repairs',state.repairs);
  const events=P.events(state,store), pickups=events.filter(e=>e.kind==='pickup'&&e.date===today), returns=events.filter(e=>e.kind==='return'&&e.date===today);
  const late=events.filter(e=>e.kind==='return'&&e.date<today), inspecting=scoped('equipment',state.equipment).filter(e=>e.status==='待检查');
  const stat=(name,value,foot,symbol,target,f='全部')=>`<button class="stat" data-go="${target}" data-go-filter="${f}"><span class="stat-icon">${icon(symbol,20)}</span><div class="stat-title">${name}</div><div class="stat-value">${value}</div><div class="stat-foot">${foot} →</div></button>`;
  if(contractor)return `<div class="welcome-strip"><div><div class="eyebrow">REPAIR WORKSPACE</div><h2>把每一件装备，修到安心。</h2><p>只展示分配给你的维修任务，完成后由门店验收。</p></div>${button('进入我的工单','data-tab="repairs"','primary')}</div><div class="stats">${stat('待处理',myRepairs.filter(r=>r.status==='待处理').length,'登记开工','repair','repairs','待处理')}${stat('维修中',myRepairs.filter(r=>r.status==='维修中').length,'填写工时与结果','repair','repairs','维修中')}${stat('待门店验收',myRepairs.filter(r=>r.status==='待验收').length,'等待实物验收','repair','repairs','待验收')}</div>`;
  const task=(name,value,target,f='全部')=>`<button class="task-row" data-go="${target}" data-go-filter="${f}"><span>${name}</span><strong>${value}</strong>${icon('arrow',16)}</button>`;
  const dates=Array.from({length:7},(_,i)=>P.addDays(today,i-6));
  const contracts=scoped('contracts',state.contracts), values=dates.map(d=>contracts.reduce((sum,c)=>sum+c.payments.filter(p=>P.day(p.at)===d).reduce((n,p)=>n+p.amount,0),0)), max=Math.max(1,...values);
  const chart=values.some(Boolean)?`<svg class="chart" viewBox="0 0 600 160" role="img" aria-label="最近七天已登记收款，单位元"><path d="M15 135h570M15 75h570M15 15h570" stroke="#e6ece7"/>${values.map((v,i)=>`<rect x="${35+i*80}" y="${135-v/max*105}" width="30" height="${v/max*105}" rx="4" fill="${i===6?'#227b62':'#b6d8c5'}"/><text x="${50+i*80}" y="${125-v/max*105}" text-anchor="middle" font-size="12" fill="#52675e">${v?Math.round(v/100):''}</text>`).join('')}</svg><div class="chart-labels">${dates.map(d=>`<span>${d.slice(5)}</span>`).join('')}</div>`:'<div class="empty compact">最近 7 天暂无收款登记<br>完成开单并核验外部付款后显示</div>';
  const equipment=scoped('equipment',state.equipment);
  const categories=[...new Set(equipment.map(e=>e.category))];
  const bars=categories.map(category=>{const all=equipment.filter(e=>e.category===category),available=all.filter(e=>e.status==='可租').length;return `<div class="occupancy-row"><div class="row"><span>${esc(category)}</span><span>${available} / ${all.length} 可租</span></div><div class="bar"><span style="width:${available/all.length*100}%"></span></div></div>`;}).join('');
  const todayEvents=pickups.concat(returns);
  return `<div class="welcome-strip"><div><div class="eyebrow">TODAY · ${today}</div><h2>${esc(user.name)}，今天也从容开场。</h2><p>${store==='*'?'全部门店':esc(storeName(store))} · 先处理待办，再迎接下一位雪友</p></div><div class="actions">${button('查看取还日历','data-tab="calendar"')}${button('＋ 新开租赁合同','data-action="contractCreate"','primary')}</div></div>
  <div class="stats">${stat('待受理预约',m.bookings,'确认顾客到店安排','calendar','bookings','待确认')}${stat('可租装备',m.available,'已检查，可以交付','equipment','equipment','可租')}${stat('租出中的装备',m.rented,'按库存编号跟踪','contracts','equipment','租出')}${stat('累计登记收款',money(m.revenue),'按开单门店统计 · 非支付到账','history','contracts')}</div>
  <div class="grid-two"><section class="panel"><div class="panel-head"><h2>今日取还安排 <span class="count-badge">${todayEvents.length}</span></h2><button class="text-link" data-tab="calendar">查看日历 →</button></div>${todayEvents.length?todayEvents.map(e=>`<button class="agenda-row" ${e.kind==='pickup'?`data-booking="${esc(e.id)}"`:`data-contract="${esc(e.id)}"`}><span class="event-type ${e.kind}">${e.kind==='pickup'?'取件':'预计归还'}</span><div><strong>${esc(e.name)}</strong><span>${esc(storeName(e.storeId))} · ${e.count} 件装备 · ${esc(e.id)}</span></div>${icon('arrow',16)}</button>`).join(''):'<div class="empty compact">今天暂无取还安排<br>新的预约与租赁合同会显示在这里</div>'}<p class="notice">预计归还按起租日计入第 1 天推算，具体交还安排请与顾客确认。</p></section>
  <section class="panel"><div class="panel-head"><h2>需要关注</h2><span class="muted">及时处理，顺畅流转</span></div>${task('等待受理的预约',m.bookings,'bookings','待确认')}${task('归还后待检查的装备',inspecting.length,'equipment','待检查')}${task('未关闭维修工单',m.repairs,'repairs')}${task('超过预计归还日期的合同',late.length,'calendar')}<p class="notice">日期提醒不产生逾期费用；归还支持跨门店接收。</p></section></div>
  <div class="grid-two"><section class="panel"><div class="panel-head"><h2>近 7 天登记收款</h2><span class="muted">单位：元 · 当前门店范围</span></div>${chart}</section><section class="panel"><div class="panel-head"><h2>装备可用情况</h2><span class="muted">当前门店范围</span></div>${bars||'<div class="empty compact">暂无装备</div>'}</section></div>
  <div class="panel-head"><h2>最近预约</h2><button class="text-link" data-tab="bookings">查看全部 →</button></div>${table(['顾客 / 预约号','门店 / 日期','装备 / 参考金额','状态','操作'],bookingRows(scoped('bookings',state.reservations||[]).slice(-4).reverse()),'还没有预约',false)}`;
}
function calendarPage() {
  const days=Array.from({length:calendarMode==='week'?7:1},(_,i)=>P.addDays(calendarDate,i)), events=P.events(state,store);
  const overdue=events.filter(e=>e.kind==='return'&&e.date<P.day());
  const card=e=>`<button class="calendar-event ${e.kind}" ${e.kind==='pickup'?`data-booking="${esc(e.id)}"`:`data-contract="${esc(e.id)}"`}><span>${e.kind==='pickup'?'预约取件':'预计归还'} · ${e.count} 件</span><strong>${esc(e.name)}</strong><small>${esc(storeName(e.storeId))} · ${esc(e.status)}</small></button>`;
  return `<div class="calendar-toolbar"><div class="actions">${button('上一段','data-calendar-shift="-1"')}${button('今天','data-calendar-today')}${button('下一段','data-calendar-shift="1"')}</div><label class="date-control">起始日期 <input type="date" id="calendar-date" value="${calendarDate}"></label><div class="pill-group">${['day','week'].map(m=>`<button class="pill ${calendarMode===m?'active':''}" data-calendar-mode="${m}">${m==='day'?'单日':'七日'}</button>`).join('')}</div></div>
  <div class="calendar-legend"><span class="legend-dot pickup"></span>预约取件 <span class="legend-dot return"></span>预计归还 <span class="muted">门店按预约或开单门店归类，归还可在任意门店办理</span></div>
  <div class="calendar-scroll"><div class="rental-calendar ${calendarMode}">${days.map(d=>`<section class="calendar-day ${d===P.day()?'today':''}"><header><strong>${d.slice(5)}</strong><span>${['周日','周一','周二','周三','周四','周五','周六'][new Date(d+'T00:00:00Z').getUTCDay()]}</span></header><div>${events.filter(e=>e.date===d).map(card).join('')||'<p class="calendar-empty">暂无安排</p>'}</div></section>`).join('')}</div></div>
  <p class="notice">按天展示；预计归还 = 起租日期 + 租期 − 1 天。这是联系提醒，不作为逾期计费依据。</p>
  ${overdue.length?`<section class="panel overdue-panel"><div class="panel-head"><h2>超过预计归还日期 · 待联系确认</h2><span>${overdue.length} 份合同</span></div><div class="overdue-list">${overdue.map(e=>`<div><span class="muted">预计 ${e.date}</span>${card(e)}</div>`).join('')}</div></section>`:''}`;
}
function customersPage() {
  const customers=customerDirectory();
  const rows=scoped('customers',customers,true).map(c=>{const contracts=state.contracts.filter(x=>x.customerId===c.id), reservations=(state.reservations||[]).filter(x=>x.email===c.email);return `<tr><td><strong>${esc(c.name)}</strong><span class="mono">${esc(c.id)}</span></td><td>${esc(c.phone)}<br><span class="muted">${esc(c.email)}</span></td><td>${reservations.length} 次预约 / ${contracts.length} 份合同</td><td>${contracts.filter(x=>x.status==='生效').length} 份生效合同</td><td>${button('查看档案',`data-customer="${esc(c.id)}"`,'small')}</td></tr>`;});
  return toolbar([])+table(['客户','联系资料','业务记录','当前租赁','操作'],rows,'暂无符合条件的客户');
}
function customerDirectory() {
  const rows=state.customers.slice();
  for(const r of state.reservations||[])if(!rows.some(c=>c.email===r.email))rows.push({id:'booking:'+r.id,name:r.name,email:r.email,phone:r.phone});
  return rows;
}
function customerDetail(id) {
  const c=customerDirectory().find(x=>x.id===id);if(!c)return;
  const reservations=(state.reservations||[]).filter(x=>x.email===c.email);
  const contracts=state.contracts.filter(x=>x.customerId===id||reservations.some(r=>r.id===x.reservationId));
  const events=[];
  for(const r of reservations){
    events.push({at:r.createdAt||r.startDate,title:'提交预约 · '+r.id,detail:storeName(r.storeId)+' · 计划 '+r.startDate+' 取件',kind:'booking',id:r.id,state:r.status});
  }
  for(const contract of contracts){
    events.push({at:contract.createdAt||contract.startDate,title:'开立合同 · '+contract.id,detail:storeName(contract.storeId)+' · '+contract.items.length+' 件装备',kind:'contract',id:contract.id,state:contract.status});
    for(const item of contract.items){
      if(item.returnAt)events.push({at:item.returnAt,title:'归还装备 · #'+item.equipmentId,detail:item.name+' · 接收门店：'+storeName(item.returnStore),kind:'contract',id:contract.id,state:'待检查'});
    }
    for(const change of contract.changes||[])events.push({at:change.at,title:'换装申请 · '+change.id,detail:change.reason+' · 新件 #'+change.equipmentId,kind:'contract',id:contract.id,state:change.status});
  }
  events.sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  drawer('客户档案 · '+c.name,`<div class="profile-head"><div class="profile-avatar">${esc(c.name.slice(0,1))}</div><div><h2>${esc(c.name)}</h2><p>${esc(c.phone)} · ${esc(c.email)}</p></div></div><div class="detail-card"><div class="detail-grid"><div>客户编号<strong>${esc(c.id.startsWith('booking:')?'预约客户 · 到店后建档':c.id)}</strong></div><div>预约 / 合同<strong>${reservations.length} 次 / ${contracts.length} 份</strong></div><div>地址<strong>${esc(c.address||'尚未登记')}</strong></div><div>合同登记收款<strong>${money(contracts.reduce((n,x)=>n+x.payments.reduce((a,p)=>a+p.amount,0),0))}</strong></div></div></div><h3>业务时间线</h3><div class="timeline">${events.map(e=>`<button class="timeline-event" ${e.kind==='booking'?`data-booking="${esc(e.id)}"`:`data-contract="${esc(e.id)}"`}><span class="timeline-dot"></span><span class="timeline-content"><small>${esc(when(e.at))}</small><strong>${esc(e.title)}</strong><span>${esc(e.detail)}</span></span>${status(e.state)}</button>`).join('')||'<p class="muted">暂无预约或合同记录</p>'}</div><p class="notice">预约按联系邮箱展示；合同依据客户编号或关联预约展示。姓名和邮箱相同不代表同一微信身份。</p>`);
  bindDetails($('#overlay'));
}
function equipmentDetail(id) {
  const e=state.equipment.find(x=>x.id===id);if(!e)return;
  const rentals=state.contracts.flatMap(c=>c.items.filter(i=>i.equipmentId===id).map(i=>({c,i}))).reverse(), repairs=state.repairs.filter(r=>r.equipmentId===id).slice().reverse();
  drawer('装备档案 · #'+id,`<div class="detail-card"><div class="row"><h3>${esc(e.name)}</h3>${status(e.status)}</div><div class="detail-grid"><div>规格 / 等级<strong>${esc(e.spec)} · ${esc(e.level||'配件')}</strong></div><div>日租金<strong>${money(e.daily)}</strong></div><div>归属门店<strong>${esc(storeName(e.home))}</strong></div><div>实际位置<strong>${esc(storeName(e.location))}</strong></div></div></div><h3>租赁与归还记录</h3>${rentals.map(({c,i})=>`<button class="record-link" data-contract="${esc(c.id)}"><div><strong>${esc(c.customerName)} · ${esc(c.id)}</strong><small>借出 ${when(i.outAt)} · ${esc(storeName(i.outStore))}<br>${i.returnAt?'归还 '+when(i.returnAt)+' · '+esc(storeName(i.returnStore)):'顾客租用中'}</small></div>${icon('arrow',16)}</button>`).join('')||'<p class="muted">暂无租赁记录</p>'}<h3>维修记录</h3>${repairs.map(r=>`<div class="detail-card"><div class="row"><strong>${esc(r.id)}</strong>${status(r.status)}</div>${esc(r.description)}<div class="muted">${when(r.createdAt)} · ${r.minutes} 分钟</div></div>`).join('')||'<p class="muted">暂无维修记录</p>'}<p class="notice">此处展示已记录的租赁与维修历史。归属门店与实际位置分别记录。</p>`);
  bindDetails($('#overlay'));
}
function bindDetails(root=document) {
  root.querySelectorAll('[data-booking]').forEach(b=>b.onclick=()=>bookingDetail(b.dataset.booking));
  root.querySelectorAll('button[data-contract]:not([data-action])').forEach(b=>b.onclick=()=>contractDetail(b.dataset.contract));
  root.querySelectorAll('[data-customer]').forEach(b=>b.onclick=()=>customerDetail(b.dataset.customer));
  root.querySelectorAll('[data-equipment]').forEach(b=>b.onclick=()=>equipmentDetail(b.dataset.equipment));
}
function bookingWorkflow() {
  const all=scoped('bookings',state.reservations||[]);
  const steps=[['待确认','核对预约与到店日期'],['已确认','到店后核对库存并开单'],['已开单','在合同中办理借还'],['已取消','保留记录供追溯']];
  return `<div class="workflow" aria-label="预约处理流程">${steps.map(([name,hint],i)=>`<button class="workflow-step ${filter===name?'active':''}" data-booking-filter="${name}"><span class="step-number">${i+1}</span><span><strong>${name}</strong><small>${hint}</small></span><b>${all.filter(r=>r.status===name).length}</b></button>`).join('')}</div><p class="notice workflow-note">预约是租赁意向，不占用库存；确认后仍需到店核对装备、适配和付款凭据才能开立合同。</p>`;
}
function inRange(date) { return Boolean(date)&&(!fromDate||date>=fromDate)&&(!toDate||date<=toDate); }
function reportData() {
  const stores=state.stores.filter(s=>store==='*'||s.id===store);
  return stores.map(s=>{
    const bookings=(state.reservations||[]).filter(r=>r.storeId===s.id&&inRange(r.startDate));
    const contracts=state.contracts.filter(c=>c.storeId===s.id&&inRange(String(c.createdAt||'').slice(0,10)));
    const equipment=P.filterRows(state,'equipment',state.equipment,{store:s.id});
    const repairs=state.repairs.filter(r=>r.storeId===s.id&&inRange(String(r.createdAt||'').slice(0,10)));
    return {store:s.name,bookings:bookings.length,confirmed:bookings.filter(r=>r.status==='已确认').length,contracts:contracts.length,registered:contracts.reduce((n,c)=>n+c.payments.reduce((sum,p)=>sum+Number(p.amount||0),0),0),available:equipment.filter(e=>e.status==='可租').length,rented:equipment.filter(e=>e.status==='租出').length,inspecting:equipment.filter(e=>e.status==='待检查').length,repairs:repairs.length};
  });
}
function reportsPage() {
  const rows=reportData(), sum=key=>rows.reduce((n,r)=>n+r[key],0);
  const stat=(name,value,foot,symbol,target,f='全部')=>`<button class="stat" data-go="${target}" data-go-filter="${f}"><span class="stat-icon">${icon(symbol,20)}</span><div class="stat-title">${name}</div><div class="stat-value">${value}</div><div class="stat-foot">${foot} →</div></button>`;
  return `<div class="report-intro"><strong>门店经营概览</strong><span>预约按取件日期、合同按开单日期、维修按报修日期筛选；装备按当前状态统计。</span></div>${toolbar([])}<div class="stats report-stats">${stat('预约',sum('bookings'),'所选日期范围','calendar','bookings')}${stat('新开合同',sum('contracts'),'所选日期范围','contracts','contracts')}${stat('登记收款',money(sum('registered')),'凭据登记，非实际到账','history','contracts')}${stat('待检查装备',sum('inspecting'),'当前装备状态','equipment','equipment','待检查')}</div><section class="panel"><div class="panel-head"><h2>门店对照</h2>${button('导出当前报表 CSV','data-export-report','small')}</div>${table(['门店','预约 / 已确认','新开合同','登记收款','可租 / 租出 / 待检','新报修'],rows.map(r=>`<tr><td><strong>${esc(r.store)}</strong></td><td>${r.bookings} / ${r.confirmed}</td><td>${r.contracts}</td><td>${money(r.registered)}</td><td>${r.available} / ${r.rented} / ${r.inspecting}</td><td>${r.repairs}</td></tr>`),'当前范围无门店',false)}<p class="notice">本报表仅汇总系统内已登记记录，不代表银行到账、库存预测或正式财务报表。</p></section>`;
}
function exportReport() {
  const safe=value=>{const s=String(value??'');return '"'+(/^[=+\-@\t\r]/.test(s)?"'"+s:s).replace(/"/g,'""')+'"';};
  const rows=[['门店','预约','已确认','新开合同','登记收款(元)','可租','租出','待检查','新报修'],...reportData().map(r=>[r.store,r.bookings,r.confirmed,r.contracts,(r.registered/100).toFixed(2),r.available,r.rented,r.inspecting,r.repairs])];
  const blob=new Blob(['\ufeff'+rows.map(row=>row.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='BSR门店报表_'+P.day()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('报表已导出');
}
function listPage() {
  if(tab==='calendar')return calendarPage();
  if(tab==='customers')return customersPage();
  if(tab==='reports')return reportsPage();
  if (tab === 'bookings') {
    const rows = scoped('bookings',(state.reservations||[]).slice().reverse(),true);
    return bookingWorkflow()+toolbar(['全部','待确认','已确认','已开单','已取消']) + table(['顾客 / 预约号','门店 / 日期','装备 / 参考金额','状态','操作'],bookingRows(rows),'小程序提交预约后会显示在这里');
  }
  if (tab === 'equipment') {
    const rows = scoped('equipment',state.equipment,true).map(e=>`<tr><td><strong>${esc(e.name)}</strong><button class="text-link mono" data-equipment="${esc(e.id)}">#${esc(e.id)} · 查看档案</button></td><td>${esc(e.category)}<br><span class="muted">${esc(e.spec)} ${esc(e.level)}</span></td><td>${esc(storeName(e.home))}<br><span class="muted">当前位置：${esc(storeName(e.location))}</span></td><td>${money(e.daily)}<span class="muted"> / 天</span></td><td>${status(e.status)}</td><td><div class="actions">${e.status==='待检查'?button('整备放行',`data-action="equipmentInspect" data-id="${esc(e.id)}"`,'small'):''}${['可租','待检查','故障待报修'].includes(e.status)?button('报修',`data-action="repairCreate" data-id="${esc(e.id)}"`,'small'):''}${user.role==='manager'&&['可租','待检查'].includes(e.status)?button('调拨接收',`data-action="equipmentMove" data-id="${esc(e.id)}"`,'small'):''}</div></td></tr>`);
    return toolbar(['全部','可租','租出','待检查','待维修','维修中','换装预留','故障待报修'])+table(['装备档案','类别 / 规格','归属 / 实际位置','日租金','状态','操作'],rows);
  }
  if (tab === 'contracts') {
    const rows=scoped('contracts',state.contracts.slice().reverse(),true).map(c=>`<tr><td><strong>${esc(c.customerName)}</strong><span class="mono">${esc(c.id)}</span></td><td>${esc(storeName(c.storeId))}<br><span class="muted">${when(c.createdAt)}</span></td><td>${c.items.filter(x=>!x.returnAt).length} / ${c.items.length} 使用中</td><td>${money(c.total)}</td><td>${status(c.status)}</td><td>${button('查看 / 办理',`data-contract="${esc(c.id)}"`,'small')}</td></tr>`);
    return toolbar(['全部','生效','已关闭'])+table(['顾客 / 合同编号','开单门店 / 时间','逐件借还','合同金额','状态','操作'],rows);
  }
  if (tab === 'repairs') {
    const rows=scoped('repairs',state.repairs.slice().reverse(),true).map(r=>`<tr><td><strong>#${esc(r.equipmentId)} · ${esc(state.equipment.find(e=>e.id===r.equipmentId)?.name||'')}</strong><span class="mono">${esc(r.id)}</span></td><td>${esc(r.description)}<br><span class="muted">${esc(state.contractors.find(x=>x.id===r.contractorId)?.name||r.contractorId)}</span></td><td>${r.minutes} 分钟<br><span class="muted">${money(r.cost)} · 冻结 ${money(r.hourly)}/小时</span></td><td>${status(r.status)}</td><td><div class="actions">${user.role==='contractor'&&r.status==='待处理'?button('登记开工',`data-action="repairStart" data-id="${esc(r.id)}"`,'small'):''}${user.role==='contractor'&&r.status==='维修中'?button('提交完成',`data-action="repairComplete" data-id="${esc(r.id)}"`,'small'):''}${user.role!=='contractor'&&r.status==='待验收'?button('验收通过',`data-action="repairAccept" data-id="${esc(r.id)}"`,'small')+button('返工',`data-action="repairReject" data-id="${esc(r.id)}"`,'small'):''}</div></td></tr>`);
    return toolbar(['全部','待处理','维修中','待验收','已关闭'])+table(['工单 / 装备','问题 / 承包商','工时 / 费用','状态','操作'],rows)+`<p class="notice">完成维修不等于恢复可租。承包商只能更新自己的工单，门店员工完成实物验收后才恢复可租。</p>`;
  }
  if (tab === 'people') {
    const shiftRows=scoped('people',state.shifts.slice().sort((a,b)=>b.date.localeCompare(a.date)),true).map(s=>`<tr><td><strong>${esc(state.employees.find(x=>x.id===s.employeeId)?.name||s.employeeId)}</strong>${esc(s.employeeId)}</td><td>${esc(storeName(s.storeId))}</td><td>${esc(s.date)}</td><td>${esc(s.start)} — ${esc(s.end)}</td></tr>`);
    return `<div class="toolbar"><div class="muted">人员资料与微信/网页账号授权分别管理。</div><div class="actions">${user.role==='manager'?button('新增员工','data-action="employeeAdd"')+button('新增承包商','data-action="contractorAdd"')+button('新增费率','data-action="rateAdd"'):''}</div></div><div class="people-grid"><div class="panel"><div class="panel-head"><h2>门店员工</h2></div>${state.employees.map(e=>`<div class="detail-card"><h3>${esc(e.name)} <span class="mono">${esc(e.id)}</span></h3><div class="muted">${esc(e.email)}<br>${esc(e.notes)}</div></div>`).join('')}</div><div class="panel"><div class="panel-head"><h2>维修承包商与费率</h2></div>${state.contractors.map(v=>`<div class="detail-card"><h3>${esc(v.name)} <span class="mono">${esc(v.id)}</span></h3><div class="muted">${esc(v.email)}<br>${v.rates.map(r=>`${esc(r.from)} 起 · ${money(r.hourly)}/小时`).join('<br>')}</div></div>`).join('')}</div></div><div class="panel-head" style="margin-top:28px"><h2>员工班次</h2></div>${toolbar([])}${table(['员工','门店','日期','时间'],shiftRows,'尚未安排班次')}`;
  }
  if (tab === 'history') return toolbar([])+table(['时间','操作人','操作','目标记录'],scoped('history',state.audit.slice().reverse(),true).slice(0,100).map(a=>`<tr><td>${when(a.at)}</td><td>${esc(a.actor)}</td><td>${esc(actionNames[a.action]||a.action)}</td><td class="mono">${esc(a.target)}</td></tr>`));
  return '';
}
function toolbar(filters) {
  const dateLabel=({bookings:'取件日期',contracts:'开单日期',equipment:'购入日期',repairs:'报修日期',people:'班次日期',reports:'日期范围',history:'操作日期'})[tab];
  return `<div class="toolbar"><label class="search-box">${icon('search',18)}<input id="search" value="${esc(query)}" placeholder="搜索编号、姓名或规格" aria-label="搜索记录"></label>${dateLabel?`<div class="date-range"><span>${dateLabel}</span><input type="date" id="from-date" value="${fromDate}" aria-label="开始日期"><span>至</span><input type="date" id="to-date" value="${toDate}" aria-label="结束日期"></div>`:''}${button('清空筛选','data-clear-filters','small')}<div class="pill-group full-row">${filters.map(f=>`<button class="pill ${filter===f?'active':''}" data-filter="${f}">${f}</button>`).join('')}</div></div>${fromDate&&toDate&&fromDate>toDate?'<div class="error-banner">开始日期不能晚于结束日期，请调整日期范围。</div>':''}`;
}
const actionNames={contractCreate:'开立租赁合同',returnItem:'登记单件归还',exchangePrepare:'接收旧件并准备换装',exchangeConfirm:'确认换装结算并借出',exchangeCancel:'取消换装',equipmentInspect:'整备检查放行',equipmentAdd:'装备入库',equipmentMove:'登记调拨实物接收',repairCreate:'申请维修',repairStart:'登记开工',repairComplete:'提交维修完成',repairAccept:'员工验收通过',repairReject:'验收不合格，返工',employeeAdd:'新增员工资料',contractorAdd:'新增承包商',rateAdd:'新增历史费率',shiftAdd:'安排员工班次',reservationStatus:'处理预约',passwordChange:'修改登录密码'};
function render() {
  if (!state || !user) return login();
  const m=metrics(); const nav=tabs.filter(x=>user.role!=='contractor'||['home','repairs'].includes(x[0]));
  const primary=({bookings:null,equipment:'equipmentAdd',contracts:'contractCreate',repairs:'repairCreate',people:'shiftAdd'})[tab];
  const allowed=primary&&user.role!=='contractor'&&(['equipmentAdd','shiftAdd'].includes(primary)?user.role==='manager':true);
  $('#app').innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><div class="brand-mark">╱╱</div><div><strong>板上有雪</strong><small>BSR · SKI RENTALS</small></div></div><div class="nav-caption">门店工作空间</div><nav>${nav.map(([id,label,symbol])=>`${({home:'日常工作',customers:'客户与资产',repairs:'运营管理'})[id]?`<div class="nav-group-label">${({home:'日常工作',customers:'客户与资产',repairs:'运营管理'})[id]}</div>`:''}<button class="nav-button ${tab===id?'active':''}" data-tab="${id}" title="${label}">${icon(symbol)}<span>${label}</span>${id==='bookings'&&m.bookings?`<span class="nav-count">${m.bookings}</span>`:''}</button>`).join('')}</nav><div class="sidebar-foot"><div><i class="connection-dot"></i>${demo?'本机演示数据':'腾讯云 · 已登录'}</div><div>小程序前端 / 网页管理后台</div><div>课程项目 · 使用虚构资料</div></div></aside><main class="main"><header class="topbar"><div class="breadcrumbs">门店管理 <span>/ ${titles[tab]}</span></div><div class="top-actions"><select class="store-select" id="store" aria-label="当前门店"><option value="*" ${store==='*'?'selected':''}>全部门店</option>${state.stores.map(s=>`<option value="${s.id}" ${s.id===store?'selected':''}>⌖ ${esc(s.name)}</option>`).join('')}</select><button class="icon-button" data-refresh title="刷新记录" aria-label="刷新记录">${icon('refresh',17)}</button><div class="user-chip"><div class="avatar">${esc(user.name.slice(0,1))}</div><div>${esc(user.name)}<small>${roleNames[user.role]}</small></div></div><button class="icon-button" data-password title="修改密码" aria-label="修改密码">${icon('people',17)}</button><button class="icon-button" data-logout title="退出登录" aria-label="退出登录">${icon('logout',17)}</button></div></header><div class="content">${demo?`<div class="demo-banner">本机演示模式：当前所有操作仅保存在此浏览器，不会写入腾讯云。 ${button('重置演示数据','data-reset-demo','small')} ${button('体验承包商','data-demo-contractor','small')}</div>`:''}<div class="page-head"><div><h1>${titles[tab]}</h1><div class="muted">${({calendar:'按天查看预约取件和预计归还，点选安排进入办理。',customers:'一份档案串起预约、合同与归还记录。',home:'把顾客的下一趟雪道，变成门店有序的一天。',bookings:'来自微信小程序的租赁意向，在门店确认后开立正式合同。',equipment:'在店装备按实际位置筛选，租出装备按借出门店筛选；归属单独记录。',contracts:'逐件借还与变更历史清晰可查，签约与资金凭据分别留存。',repairs:'从故障发现，到承包商处理，再到门店验收。',people:'按岗位协作，按规则排班，按历史费率核算。',reports:'按门店和日期核对预约、开单、登记收款与装备状态，可导出 CSV。',history:'最近100条操作；门店筛选按目标记录当前归类，不代表历史发生地点。'})[tab]}</div></div>${allowed?button('＋ '+actionNames[primary],`data-action="${primary}"`,'primary'):''}</div>${tab==='home'?home():listPage()}<div class="notice">板上有雪 · 让每一趟雪道，从容出发。</div></div></main></div>`;
  bind();
}
function bind() {
  bindDetails();
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{pageNumber=Number(b.dataset.page);render();});
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{tab=b.dataset.go;filter=b.dataset.goFilter||'全部';query='';fromDate='';toDate='';pageNumber=1;render();});
  for(const [id,key] of [['from-date','fromDate'],['to-date','toDate']])if($('#'+id))$('#'+id).onchange=e=>{if(key==='fromDate')fromDate=e.target.value;else toDate=e.target.value;pageNumber=1;render();};
  if($('[data-clear-filters]'))$('[data-clear-filters]').onclick=()=>{query='';filter='全部';fromDate='';toDate='';pageNumber=1;render();};
  document.querySelectorAll('[data-calendar-shift]').forEach(b=>b.onclick=()=>{calendarDate=P.addDays(calendarDate,Number(b.dataset.calendarShift)*(calendarMode==='week'?7:1));render();});
  document.querySelectorAll('[data-calendar-mode]').forEach(b=>b.onclick=()=>{calendarMode=b.dataset.calendarMode;render();});
  if($('[data-calendar-today]'))$('[data-calendar-today]').onclick=()=>{calendarDate=P.day();render();};
  if($('#calendar-date'))$('#calendar-date').onchange=e=>{if(e.target.value){calendarDate=e.target.value;render();}};

  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;filter='全部';query='';fromDate='';toDate='';pageNumber=1;render();});
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;pageNumber=1;render();});
  document.querySelectorAll('[data-booking-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.bookingFilter;pageNumber=1;render();});
  if($('[data-export-report]'))$('[data-export-report]').onclick=exportReport;
  document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>openAction(b.dataset.action,b.dataset));
  document.querySelectorAll('[data-booking]').forEach(b=>b.onclick=()=>bookingDetail(b.dataset.booking));
  document.querySelectorAll('[data-contract]').forEach(b=>b.onclick=()=>contractDetail(b.dataset.contract));
  if($('#search')) $('#search').oninput=e=>{query=e.target.value;pageNumber=1;const position=e.target.selectionStart;render();const next=$('#search');next.focus();next.setSelectionRange(position,position);};
  $('#store').onchange=e=>{store=e.target.value;pageNumber=1;render();};
  $('[data-refresh]').onclick=async()=>{try{await load();toast('记录已刷新');}catch(e){toast(e.message);}};
  $('[data-logout]').onclick=async()=>{try{await api('logout');}catch(_){}demo=false;token='';sessionStorage.removeItem('bsr-web-token');login();};
  $('[data-password]').onclick=()=>{if(demo)return toast('演示模式无需修改密码');openAction('passwordChange');};
  if($('[data-reset-demo]')) $('[data-reset-demo]').onclick=()=>{if(confirm('清空此浏览器中的演示记录并恢复初始数据？')){localStorage.removeItem('bsr-admin-demo-v2');startDemo();}};
  if($('[data-demo-contractor]')) $('[data-demo-contractor]').onclick=()=>{user={username:'demo-vendor',role:'contractor',contractorId:'V01',name:'演示承包商'};state=D.view(demoState,user);tab='repairs';render();};
}
function drawer(title,body,footer='') {
  $('#overlay').innerHTML=`<div class="overlay"><section class="drawer" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="drawer-head"><h2>${esc(title)}</h2><button class="icon-button" data-close aria-label="关闭">${icon('close')}</button></header><div class="drawer-body">${body}</div>${footer?`<footer class="drawer-footer">${footer}</footer>`:''}</section></div>`;
  $('[data-close]').onclick=close;
}
function close(){if(busy)return;modal=null;$('#overlay').innerHTML='';}
function bookingDetail(id) {
  const r=(state.reservations||[]).find(x=>x.id===id);if(!r)return;
  const active=['待确认','已确认'].includes(r.status);
  drawer('预约受理 · '+r.id,`<div class="detail-card"><div class="row"><h3>${esc(r.name)}</h3>${status(r.status)}</div><div class="detail-grid"><div>联系邮箱<strong>${esc(r.email)}</strong></div><div>联系电话<strong>${esc(r.phone)}</strong></div><div>门店与日期<strong>${esc(storeName(r.storeId))} · ${esc(r.startDate)}</strong></div><div>租期 / 技能<strong>${r.days}天 · ${esc(r.level)}</strong></div></div><p class="muted">${esc(r.note||'未填写备注')}</p></div><div class="panel-head"><h2>意向装备</h2><span class="form-price">${money(r.estimate)}</span></div>${r.items.map(e=>`<div class="detail-card row"><span>${esc(e.name)} #${esc(e.equipmentId)}</span><span>${money(e.daily)}/天</span></div>`).join('')}<div class="form-info">预约不锁定库存、不表示已付款。开单时需要重新核对装备可用性、专业适配、签字及外部付款凭据。开单成功后，顾客可在小程序看到本合同。</div><div class="actions">${active?button('确认预约',`data-status="已确认"`)+button('取消预约',`data-status="已取消"`,'danger')+button('由此预约开单','data-booking-contract','primary'):''}${r.contractId?button('查看合同',`data-linked-contract="${esc(r.contractId)}"`):''}</div>`);
  document.querySelectorAll('[data-status]').forEach(b=>b.onclick=async()=>{try{const result=await api('reservationStatus',{id:r.id,status:b.dataset.status},newRequest());state=result.state;close();render();toast('预约已更新');}catch(e){toast(e.message);}});
  if($('[data-booking-contract]')) $('[data-booking-contract]').onclick=()=>openAction('contractCreate',{reservationId:id});
  if($('[data-linked-contract]')) $('[data-linked-contract]').onclick=()=>contractDetail(r.contractId);
}
function contractDetail(id) {
  const c=state.contracts.find(x=>x.id===id);if(!c)return;
  const body=`<div class="detail-tabs" role="tablist" aria-label="合同详情分类"><button class="pill active" data-detail-tab="items" role="tab" aria-selected="true">装备与归还</button><button class="pill" data-detail-tab="changes" role="tab" aria-selected="false">换装记录</button><button class="pill" data-detail-tab="payments" role="tab" aria-selected="false">收款凭据</button></div><div class="detail-card"><div class="row"><h3>${esc(c.customerName)}</h3>${status(c.status)}</div><div class="detail-grid"><div>合同金额<strong>${money(c.total)}</strong></div><div>原签约员工<strong>${esc(c.employeeId)}</strong></div><div>租期 / 预计归还<strong>${c.days}天 · ${P.dueDate(c)}</strong></div><div>预约关联<strong>${esc(c.reservationId||'线下受理')}</strong></div></div><button class="text-link" data-customer="${esc(c.customerId)}">查看客户档案 →</button></div><section data-detail-section="items"><div class="panel-head"><h2>逐件借还记录</h2></div>${c.items.map(l=>`<div class="detail-card"><div class="row"><strong>${esc(l.name)} #${esc(l.equipmentId)}</strong><span>${money(l.daily)}/天</span></div><div class="muted">借出：${when(l.outAt)} · ${esc(storeName(l.outStore))}<br>归还：${l.returnAt?when(l.returnAt)+' · '+esc(storeName(l.returnStore)):'使用中'}</div>${!l.returnAt?`<div class="actions">${button('登记归还',`data-action="returnItem" data-contract="${esc(c.id)}" data-segment="${esc(l.id)}"`,'small')}${button('更换装备',`data-action="exchangePrepare" data-contract="${esc(c.id)}" data-segment="${esc(l.id)}"`,'small')}</div>`:''}</div>`).join('')}</section><section data-detail-section="changes" hidden><div class="panel-head"><h2>换装记录</h2></div>${c.changes.length?c.changes.map(x=>`<div class="detail-card"><div class="row"><strong>${esc(x.reason)} · ${money(x.delta)}</strong>${status(x.status)}</div><div class="muted">新件 #${esc(x.equipmentId)} · ${when(x.at)}</div>${x.status==='待结算'?`<div class="actions">${button('确认结算借出',`data-action="exchangeConfirm" data-contract="${esc(c.id)}" data-change="${esc(x.id)}"`,'small')}${button('取消换装',`data-action="exchangeCancel" data-contract="${esc(c.id)}" data-change="${esc(x.id)}"`,'small')}</div>`:''}</div>`).join(''):'<div class="muted">暂无换装</div>'}</section><section data-detail-section="payments" hidden><div class="panel-head" style="margin-top:25px"><h2>外部付款登记</h2></div>${c.payments.map(p=>`<div class="detail-card"><div class="row"><span>${esc(p.reference)}</span><strong>${money(p.amount)}</strong></div><div class="muted">${when(p.at)} · ${esc(p.actor)}</div></div>`).join('')}</section>`;
  drawer('租赁合同 · '+c.id,body);bindDetails($('#overlay'));
  document.querySelectorAll('[data-detail-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-detail-section]').forEach(el=>el.hidden=el.dataset.detailSection!==b.dataset.detailTab);document.querySelectorAll('[data-detail-tab]').forEach(el=>{el.classList.toggle('active',el===b);el.setAttribute('aria-selected',String(el===b));});});
  document.querySelectorAll('#overlay [data-action]').forEach(b=>b.onclick=()=>openAction(b.dataset.action,b.dataset));
}
const newRequest=()=> 'web_'+Date.now()+'_'+Math.random().toString(36).slice(2,12);
function openAction(action, data={}) {
  const t=(key,label,value='',type='text',required=true)=>({key,label,value,type,required});
  const pick=(key,label,rows,value='')=>({key,label,type:'select',options:rows.map(x=>typeof x==='string'?{value:x,label:x}:{value:x.id,label:x.name}),value,required:true});
  const flag=(key,label)=>({key,label,type:'checkbox',value:false});
  const stores=()=>pick('storeId','操作 / 实物接收门店',state.stores,store==='*'?state.stores[0].id:store);
  let fields=[],fixed={},info='请核对填写内容后保存。';
  if(action==='contractCreate') {
    const r=(state.reservations||[]).find(x=>x.id===data.reservationId);
    if(r)fixed.reservationId=r.id;
    fields=[stores(),t('customerId','已有客户ID（新客留空）','','text',false),t('name','客户姓名',r?.name||''),t('email','邮箱',r?.email||'','email'),t('phone','联系电话',r?.phone||''),t('address','家庭地址'),t('birthYear','出生年份','','number'),t('height','身高(cm)','','number'),t('weight','体重(kg)','','number'),t('shoeSize','鞋码','','number'),pick('level','本次技能',D.LEVELS,r?.level||'中级'),t('days','租赁天数',r?.days||3,'number'),t('bootSole','雪靴底长(mm，租双板必填)','','number',false),t('fitting','专业适配与交付检查记录'),t('reference','已核验外部付款流水号'),{key:'equipmentIds',label:'选择本店可租装备',type:'equipment',value:r?r.items.map(x=>x.equipmentId):[]},flag('consent','已告知资料用途并取得客户同意'),flag('signed','客户已核对并签署合同'),flag('checked','专业人员已完成适配、调校与交付检查')];
    if(r) {
      fields[0].value=r.storeId;
      const same=state.customers.filter(x=>x.email===r.email);
      if(same.length===1){fields.find(f=>f.key==='customerId').value=same[0].id;fields.find(f=>f.key==='address').value=same[0].address||'';}
    }
    info='提交后正式借出；不是预约，也不会发起微信支付。请先完成实际签字、外部收款核验和专业交付检查。';
  } else if(action==='returnItem'){fixed={contractId:data.contract,segmentId:data.segment};fields=[stores()];info='记录已接收的实物，进入待检查。跨店归还只改变实际位置，不自动改变归属门店。';}
  else if(action==='exchangePrepare'){fixed={contractId:data.contract,segmentId:data.segment};fields=[stores(),t('equipmentId','新件库存编号'),pick('reason','换装原因',['同档更换','付费升级','故障换装'],'付费升级'),t('bootSole','雪靴底长(mm，双板必填)','','number',false),t('fitting','新件专业适配检查记录'),flag('checked','已完成新件专业适配检查')];info='提交后先保存旧件真实归还，再预留新件。含当天的剩余计费日补差价，之后需在合同详情确认结算借出或取消。';}
  else if(action==='exchangeConfirm'){fixed={contractId:data.contract,changeId:data.change};fields=[t('reference','已核验补收款凭据（差额0可留空）','','text',false)];}
  else if(action==='exchangeCancel'){fixed={contractId:data.contract,changeId:data.change};info='释放尚未借出的新件预留，保留旧件真实归还。请先核对线下是否已收款；本功能不会自动退款。';}
  else if(action==='equipmentInspect'){fixed.equipmentId=data.id;fields=[t('note','实物检查与整备记录')];}
  else if(action==='equipmentAdd'){fields=[t('id','唯一库存编号'),t('name','名称'),pick('category','类别',['滑雪板','雪杖','雪靴','单板','头盔','护目镜'],'单板'),t('spec','规格 / 尺寸'),pick('level','技能等级（配件不保留）',D.LEVELS,'中级'),t('daily','日租金(元)','','number'),t('cost','购入成本(元)','','number'),t('retail','零售价(元)','','number'),t('purchased','购入日期',D.dayAt(new Date()),'date'),stores()];}
  else if(action==='equipmentMove'){fixed.equipmentId=data.id;fields=[stores(),flag('permanent','同时永久改变归属门店'),t('note','实物已到店的接收说明')];info='仅登记已经完成的实物调拨接收，之后仍需检查放行。运输中的装备不要登记为已接收。';}
  else if(action==='repairCreate'){fields=[t('equipmentId','故障装备库存编号',data.id||''),pick('contractorId','分配承包商',state.contractors),t('description','故障描述')];}
  else if(action.startsWith('repair')){fixed.repairId=data.id;fields=action==='repairComplete'?[t('minutes','本次工时(分钟，15的倍数)',15,'number'),t('note','本次维修说明')]:action==='repairAccept'?[stores(),t('note','实物回店与验收记录')]:[t('note','处理说明')];}
  else if(action==='employeeAdd'||action==='contractorAdd'){fields=[t('id',action==='employeeAdd'?'员工ID':'承包商ID'),t('name','姓名 / 名称'),t('phone','电话'),t('email','邮箱','','email'),t('address','地址')];fields.push(...(action==='employeeAdd'?[t('notes','备注','','text',false)]:[t('from','费率生效日',D.dayAt(new Date()),'date'),t('hourly','小时费率(元)','','number')]));}
  else if(action==='rateAdd'){fields=[pick('contractorId','承包商',state.contractors),t('from','生效日期',D.dayAt(new Date()),'date'),t('hourly','小时费率(元)','','number')];}
  else if(action==='shiftAdd'){fields=[pick('employeeId','员工',state.employees),stores(),t('date','日期',D.dayAt(new Date()),'date'),t('start','开始时间','08:00','time'),t('end','结束时间','17:00','time')];info='同一员工每日最多一个班次。班次起止限定08:00至22:00。';}
  else if(action==='passwordChange'){fields=[t('oldPassword','原密码','','password'),t('newPassword','新密码（至少8位）','','password')];info='修改后当前登录和其他旧会话都会失效，需要重新登录。';}
  else return toast('暂不支持此操作');
  modal={action,fields,fixed,requestId:newRequest()};
  let step=0; const checkout=action==='contractCreate';
  const groups=[['customerId','name','email','phone','address','birthYear','height','weight','shoeSize','level'],['storeId','days','bootSole','equipmentIds'],['fitting','reference','consent','signed','checked']];
  const fieldHTML=f=>{
    if(f.type==='checkbox')return `<label class="check field full"><input name="${f.key}" type="checkbox"><span>${esc(f.label)}</span></label>`;
    if(f.type==='equipment')return `<div class="field full"><span>${esc(f.label)}</span><div id="equipment-pick" class="equipment-picker"></div><div id="form-total" class="muted"></div></div>`;
    const control=f.type==='select'?`<select class="input" name="${f.key}" ${f.required?'required':''}><option value="">请选择</option>${f.options.map(o=>`<option value="${esc(o.value)}" ${String(f.value)===String(o.value)?'selected':''}>${esc(o.label)}</option>`).join('')}</select>`:`<input class="input" name="${f.key}" type="${f.type}" value="${esc(f.value)}" ${f.required?'required':''} ${f.type==='number'?({days:'step="1" min="1" max="30"',birthYear:'step="1" min="1900" max="'+P.day().slice(0,4)+'"',height:'step="any" min="50" max="250"',weight:'step="any" min="10" max="250"',shoeSize:'step="any" min="15" max="55"',bootSole:'step="any" min="150" max="400"',minutes:'step="15" min="15"'}[f.key]||'step="any" min="0"'):''} maxlength="160" ${f.type==='password'?'autocomplete="off"':''}>`;
    return `<label class="field"><span>${esc(f.label)}</span>${control}</label>`;
  };
  drawer(actionNames[action],`<div class="form-info">${esc(info)}</div><div id="form-error" hidden class="form-error"></div><form id="action-form" novalidate><div class="form-grid">${checkout?groups.map((keys,i)=>`<section class="checkout-step full" data-step="${i}" ${i?'hidden':''}><h3>${['1 · 客户资料与技能','2 · 装备与租期','3 · 核对与交付确认'][i]}</h3><div class="form-grid">${fields.filter(f=>keys.includes(f.key)).map(fieldHTML).join('')}</div></section>`).join(''):fields.map(fieldHTML).join('')}</div></form>`,`<span class="muted" id="checkout-progress">${checkout?'第 1 步 / 共 3 步':demo?'保存在本机演示数据中':'核对后保存'}</span>${checkout?'<button class="button" type="button" data-step-back hidden>上一步</button>':''}<button class="button primary" type="submit" form="action-form">确认提交 ${icon('arrow',16)}</button>`);
  const form=$('#action-form');
  function showStep(){
    form.querySelectorAll('[data-step]').forEach(el=>el.hidden=Number(el.dataset.step)!==step);
    if(!checkout)return;
    $('[data-step-back]').hidden=step===0;
    $('#checkout-progress').textContent='第 '+(step+1)+' 步 / 共 3 步';
    $('[form=action-form]').textContent=step<2?'下一步 →':'确认签约并借出';
    $('#form-error').hidden=true;
    if(step===2){
      let summary=$('#checkout-summary');if(!summary){summary=document.createElement('div');summary.id='checkout-summary';summary.className='checkout-summary';form.querySelector('[data-step="2"]').prepend(summary);}
      const ids=new FormData(form).getAll('equipmentIds'),days=Number(form.elements.days.value),total=state.equipment.filter(e=>ids.includes(e.id)).reduce((n,e)=>n+e.daily*days,0);
      summary.innerHTML=`<strong>${esc(form.elements.name.value)} · ${esc(storeName(form.elements.storeId.value))}</strong><p>${ids.length} 件装备 · ${days} 天 · 预计归还 ${P.addDays(P.day(),days-1)}</p><div class="form-price">${money(total)}</div><span class="muted">从今天起租，签约后正式借出；请核验外部付款凭据。</span>`;
    }
    $('.drawer-body').scrollTop=0;
  }
  function validateStep(index){
    const holder=checkout?form.querySelector('[data-step="'+index+'"]'):form;
    const invalid=Array.from(holder.querySelectorAll('input,select')).find(el=>!el.checkValidity());
    if(invalid){invalid.reportValidity();return false;}
    if(checkout&&index===1&&!new FormData(form).getAll('equipmentIds').length){toast('请选择至少一件装备');return false;}
    return true;
  }
  if(checkout){$('[data-step-back]').onclick=()=>{if(step>0){step--;showStep();}};showStep();}

  if(action==='contractCreate')form.elements.email.onchange=()=>{
    const email=form.elements.email.value.trim().toLowerCase();const found=state.customers.filter(x=>x.email===email);
    if(found.length===1){form.elements.customerId.value=found[0].id;for(const k of ['name','phone','address'])if(!form.elements[k].value)form.elements[k].value=found[0][k]||'';}
    else form.elements.customerId.value='';
  };
  function picker(){
    const holder=$('#equipment-pick');if(!holder)return;
    const sid=form.elements.storeId.value;
    const chosen=fields.find(f=>f.type==='equipment').value;
    const available=state.equipment.filter(e=>e.status==='可租'&&e.location===sid);
    holder.innerHTML=available.map(e=>`<label class="equipment-option"><input type="checkbox" name="equipmentIds" value="${esc(e.id)}" ${chosen.includes(e.id)?'checked':''}><div><strong>${esc(e.name)} #${esc(e.id)}</strong><br>${esc(e.spec)} · ${esc(e.level||'配件')}</div><span>${money(e.daily)}/天</span></label>`).join('')||'<span class="muted">此门店暂无可租装备</span>';
    function price(){const ids=new FormData(form).getAll('equipmentIds');const days=Number(form.elements.days.value)||0;const total=state.equipment.filter(e=>ids.includes(e.id)).reduce((n,e)=>n+e.daily*days,0);$('#form-total').textContent='所选合计 '+money(total)+' / '+days+'天';}
    holder.onchange=price;form.elements.days.oninput=price;price();
  }
  if(form.elements.storeId&&$('#equipment-pick')){form.elements.storeId.onchange=picker;picker();}
  form.onsubmit=async event=>{
    event.preventDefault();if(busy)return;
    if(!validateStep(step))return;
    if(checkout&&step<2){step++;showStep();return;}
    if(checkout){for(let i=0;i<3;i++)if(!validateStep(i)){step=i;showStep();return;}}
    const data=new FormData(form),p=Object.assign({},fixed);
    fields.forEach(f=>{p[f.key]=f.type==='checkbox'?data.has(f.key):f.type==='equipment'?data.getAll(f.key):data.get(f.key);});
    busy=true;const b=$('[form=action-form]');b.disabled=true;b.textContent='正在保存…';$('#form-error').hidden=true;
    try {
      const result=await api(action,p,modal.requestId);
      busy=false;
      if(action==='passwordChange'){token='';sessionStorage.removeItem('bsr-web-token');close();login('密码已更新，请使用新密码登录');return;}
      state=result.state;close();render();toast('记录已保存');
    } catch(e) {$('#form-error').textContent=e.message;$('#form-error').hidden=false;$('#form-error').scrollIntoView({block:'nearest'});}
    finally {busy=false;if(document.contains(b)){b.disabled=false;b.textContent=checkout?'确认签约并借出':'确认提交';}}
  };
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
if(new URLSearchParams(location.search).get('demo')==='1')startDemo();
else if(token)load().catch(e=>{token='';sessionStorage.removeItem('bsr-web-token');login(e.message);});
else login();
})();
