/* 纯业务规则，云端与本地演示共用。金额统一以分存储。 */
const LEVELS = ['初级', '中级', '高级', '专家+'];
const SKILL_CATEGORIES = ['滑雪板', '雪杖', '雪靴', '单板'];
function fail(message) { throw new Error(message); }
function check(value, message) { if (!value) fail(message); }
function str(value, label, max = 160) {
  check(typeof value === 'string' && value.trim() && value.length <= max, label + '不能为空或过长');
  return value.trim();
}
function num(value, min, max, label, integer = false) {
  check(value !== '' && value !== null && value !== undefined, '请填写' + label);
  const n = Number(value);
  check(Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isInteger(n)), label + '超出允许范围');
  return n;
}
function cents(value, label) { return Math.round(num(value, 0, 1000000, label) * 100); }
function find(rows, id, label) { const row = rows.find(x => x.id === id); check(row, label + '不存在'); return row; }
function date(value) {
  check(/^\d{4}-\d{2}-\d{2}$/.test(value || ''), '日期格式应为YYYY-MM-DD');
  const d = new Date(value + 'T00:00:00Z');
  check(Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value, '日期无效');
  return value;
}
function dayAt(time) { return new Date(new Date(time).getTime() + 8 * 3600000).toISOString().slice(0, 10); }
function dayDiff(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000); }
function id(state, prefix) { state.seq += 1; return prefix + String(state.seq).padStart(5, '0'); }
function allow(user, roles) { check(user && roles.includes(user.role), '当前身份无权执行此操作'); }
function store(state, value) { return find(state.stores, value, '门店'); }
function employee(state, user) { return find(state.employees, user.employeeId, '员工'); }
function audit(state, user, action, target, now) {
  state.audit.push({ id: id(state, 'A'), actor: user.employeeId || user.contractorId, action, target, at: now });
}
function seed() {
  return {
    version: 1, seq: 100, stores: [{ id: 'east', name: '东门店' }, { id: 'west', name: '西门店' }],
    employees: [{ id: 'E01', name: '门店负责人', address: '东门店', phone: '演示号码', email: 'manager@example.com', notes: '跨店业务与排班' }, { id: 'E02', name: 'Ingeborg Voss', address: '西门店', phone: '演示号码', email: 'voss@example.com', notes: '租赁接待' }],
    contractors: [{ id: 'V01', name: '雪山维修工作室', address: '示例工坊', phone: '演示号码', email: 'repair@example.com', rates: [{ from: '2026-01-01', hourly: 18000 }] }],
    equipment: [
      { id: '3828', name: 'Head 粉雪板', category: '单板', spec: '165cm', level: '中级', daily: 20000, cost: 350000, retail: 480000, purchased: '2026-01-01', home: 'east', location: 'east', status: '可租' },
      { id: '4637', name: 'Burton 进阶单板', category: '单板', spec: '158cm', level: '高级', daily: 26000, cost: 420000, retail: 580000, purchased: '2026-01-01', home: 'west', location: 'west', status: '可租' },
      { id: 'S100', name: 'Salomon 双板', category: '滑雪板', spec: '170cm', level: '中级', daily: 22000, cost: 360000, retail: 520000, purchased: '2026-01-01', home: 'east', location: 'east', status: '可租' },
      { id: 'H100', name: '安全头盔', category: '头盔', spec: 'M', level: '', daily: 4000, cost: 32000, retail: 50000, purchased: '2026-01-01', home: 'east', location: 'east', status: '可租' },
      { id: 'B100', name: '滑雪靴', category: '雪靴', spec: '42码 / 底长310mm', level: '中级', daily: 8000, cost: 110000, retail: 180000, purchased: '2026-01-01', home: 'west', location: 'west', status: '可租' }
    ], customers: [], contracts: [], repairs: [], shifts: [], audit: []
  };
}
function view(state, user) {
  if (user.role !== 'contractor') {
    const clean = Object.assign({}, state);
    delete clean.requests; delete clean._id;
    return clean;
  }
  // 承包商不接收客户资料、合同、员工联系方式和其他承包商工单。
  const repairs = state.repairs.filter(x => x.contractorId === user.contractorId);
  return { version: state.version, stores: state.stores, employees: [], contractors: state.contractors.filter(x => x.id === user.contractorId), equipment: state.equipment.filter(x => repairs.some(r => r.equipmentId === x.id)), customers: [], contracts: [], repairs, shifts: [], audit: [] };
}
function apply(input, action, p, user, now = new Date().toISOString()) {
  const s = JSON.parse(JSON.stringify(input));
  p = p || {};
  if (action === 'repairStart' || action === 'repairComplete') {
    allow(user, ['contractor']);
  } else if (['equipmentAdd', 'equipmentMove', 'employeeAdd', 'contractorAdd', 'rateAdd', 'shiftAdd'].includes(action)) {
    allow(user, ['manager']); employee(s, user);
  } else { allow(user, ['manager', 'staff']); employee(s, user); }
  let target = '';
  if (action === 'contractCreate') {
    store(s, p.storeId);
    check(p.signed === true && p.checked === true && p.consent === true, '请确认客户知情、签字及专业适配交付检查');
    const email = str(p.email, '邮箱', 100).toLowerCase();
    check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), '邮箱格式不正确');
    let customer;
    if (p.customerId) {
      customer = find(s.customers, p.customerId, '客户');
      check(customer.email === email, '客户ID与邮箱不匹配，请核对');
    } else {
      check(!s.customers.some(x => x.email === email), '此邮箱已有客户，请在客户列表核对并填写客户ID');
      customer = { id: id(s, 'C'), email, name: str(p.name, '姓名', 60), phone: str(p.phone, '电话', 40), address: str(p.address, '地址') };
      s.customers.push(customer);
    }
    const days = num(p.days, 1, 30, '租赁天数', true);
    check(LEVELS.includes(p.level), '请选择本次技能等级');
    const body = { birthYear: num(p.birthYear, 1900, Number(dayAt(now).slice(0, 4)), '出生年份', true), height: num(p.height, 50, 250, '身高'), weight: num(p.weight, 10, 250, '体重'), shoeSize: num(p.shoeSize, 15, 55, '鞋码'), bootSole: p.bootSole || '', fitting: str(p.fitting, '适配检查记录') };
    check(Array.isArray(p.equipmentIds) && p.equipmentIds.length > 0 && p.equipmentIds.length <= 12, '请选择1至12件装备');
    check(new Set(p.equipmentIds).size === p.equipmentIds.length, '同一库存编号不能重复');
    const items = p.equipmentIds.map(eid => {
      const e = find(s.equipment, eid, '装备');
      check(e.status === '可租' && e.location === p.storeId, e.id + '不在当前门店或不可租');
      if (e.category === '滑雪板') num(p.bootSole, 150, 400, '雪靴底长(mm)');
      e.status = '租出'; e.location = '';
      return { id: id(s, 'L'), equipmentId: eid, name: e.name, daily: e.daily, charge: e.daily * days, outAt: now, outStore: p.storeId, returnAt: '', returnStore: '' };
    });
    const total = items.reduce((n, x) => n + x.charge, 0);
    const reference = str(p.reference, '已核验的外部付款凭据');
    check(!s.contracts.some(c => c.payments.some(x => x.reference === reference)), '该付款凭据已使用');
    const c = { id: id(s, 'R'), customerId: customer.id, customerName: customer.name, employeeId: user.employeeId, storeId: p.storeId, createdAt: now, startDate: dayAt(now), days, level: p.level, body, items, total, status: '生效', changes: [], payments: [{ amount: total, reference, at: now, actor: user.employeeId, kind: '外部凭据登记' }], policy: '教学版P1-升级含当天-提前归还不自动退费', consentAt: now, signedAt: now };
    s.contracts.push(c); target = c.id;
  } else if (action === 'returnItem') {
    const c = find(s.contracts, p.contractId, '合同');
    const l = find(c.items, p.segmentId, '租赁段');
    if (l.returnAt) return s; // 重复提交返回既有结果
    store(s, p.storeId);
    const e = find(s.equipment, l.equipmentId, '装备');
    l.returnAt = now; l.returnStore = p.storeId; e.location = p.storeId; e.status = '待检查';
    target = c.id;
    if (c.items.every(x => x.returnAt) && c.changes.every(x => x.status !== '待结算')) c.status = '已关闭';
  } else if (action === 'exchangePrepare') {
    const c = find(s.contracts, p.contractId, '合同');
    check(c.status === '生效', '合同未生效');
    const old = find(c.items, p.segmentId, '旧租赁段');
    check(!old.returnAt, '旧件已归还，请勿重复换装');
    store(s, p.storeId);
    const e = find(s.equipment, p.equipmentId, '新装备');
    check(e.id !== old.equipmentId && e.status === '可租' && e.location === p.storeId, '新件须在接收门店且可租');
    check(['同档更换', '付费升级', '故障换装'].includes(p.reason), '请选择换装原因');
    check(p.checked === true, '请确认新件适配交付检查');
    const oldEquipment = find(s.equipment, old.equipmentId, '旧装备');
    check(e.category === oldEquipment.category, '教学版只支持相同类别换装');
    if (e.category === '滑雪板') num(p.bootSole, 150, 400, '雪靴底长(mm)');
    const fitting = str(p.fitting, '换装适配检查记录');
    const used = dayDiff(c.startDate, dayAt(now));
    check(used >= 0 && used < c.days, '已超出租期，需负责人处理续租后再换装');
    const remaining = c.days - used;
    check(p.reason !== '付费升级' || e.daily > old.daily, '升级的新件日价须高于旧件');
    check(p.reason !== '同档更换' || e.daily === old.daily, '同档更换需日价一致');
    const delta = p.reason === '付费升级' ? (e.daily - old.daily) * remaining : 0;
    // 真实归还先落库；付款失败不撤销旧件归还。
    old.returnAt = now; old.returnStore = p.storeId;
    oldEquipment.location = p.storeId; oldEquipment.status = p.reason === '故障换装' ? '故障待报修' : '待检查';
    e.status = '换装预留';
    const change = { id: id(s, 'X'), oldSegmentId: old.id, equipmentId: e.id, storeId: p.storeId, reason: p.reason, delta, daily: p.reason === '付费升级' ? e.daily : old.daily, remaining, status: '待结算', at: now, employeeId: user.employeeId, fitting, bootSole: p.bootSole || '' };
    c.changes.push(change); target = change.id;
  } else if (action === 'exchangeConfirm' || action === 'exchangeCancel') {
    const c = find(s.contracts, p.contractId, '合同');
    const change = find(c.changes, p.changeId, '换装记录');
    if (change.status === (action === 'exchangeConfirm' ? '已完成' : '已取消')) return s;
    check(change.status === '待结算', '换装不在待结算状态');
    const e = find(s.equipment, change.equipmentId, '装备');
    check(e.status === '换装预留', '预留状态异常');
    if (action === 'exchangeConfirm') {
      check(dayAt(now) === dayAt(change.at), '预留已跨日，请取消该次换装后联系负责人重新核价');
      const reference = change.delta ? str(p.reference, '补收款核验凭据') : '无需资金交易';
      check(!change.delta || !s.contracts.some(x => x.payments.some(y => y.reference === reference)), '付款凭据已使用');
      const old = find(c.items, change.oldSegmentId, '旧租赁段');
      // 旧段扣除未使用分配额，新段追加；避免多次升级重复计价。
      const allocation = old.daily * change.remaining;
      old.charge -= allocation;
      c.items.push({ id: id(s, 'L'), equipmentId: e.id, name: e.name, daily: change.daily, charge: allocation + change.delta, outAt: now, outStore: change.storeId, returnAt: '', returnStore: '' });
      c.total += change.delta; c.payments.push({ amount: change.delta, reference, at: now, actor: user.employeeId, kind: '换装外部凭据登记' });
      e.status = '租出'; e.location = ''; change.status = '已完成'; change.confirmedAt = now;
    } else { e.status = '可租'; change.status = '已取消'; change.cancelledAt = now; }
    if (c.items.every(x => x.returnAt) && c.changes.every(x => x.status !== '待结算')) c.status = '已关闭';
    target = change.id;
  } else if (action === 'equipmentInspect') {
    const e = find(s.equipment, p.equipmentId, '装备');
    check(e.status === '待检查' && e.location, '只有已回店的待检查装备可整备放行');
    check(!s.repairs.some(x => x.equipmentId === e.id && x.status !== '已关闭'), '有未关闭维修单，请通过维修验收');
    e.inspection = { note: str(p.note, '检查记录'), at: now, employeeId: user.employeeId }; e.status = '可租'; target = e.id;
  } else if (action === 'repairCreate') {
    const e = find(s.equipment, p.equipmentId, '装备');
    check(['可租', '待检查', '故障待报修'].includes(e.status) && e.location, '请先回收装备，再申请维修');
    check(!s.repairs.some(x => x.equipmentId === e.id && x.status !== '已关闭'), '已有未关闭维修单');
    const vendor = find(s.contractors, p.contractorId, '承包商');
    const rates = vendor.rates.filter(x => x.from <= dayAt(now)).sort((a, b) => b.from.localeCompare(a.from));
    check(rates.length, '承包商无有效费率');
    const r = { id: id(s, 'M'), equipmentId: e.id, contractorId: vendor.id, employeeId: user.employeeId, storeId: e.location, description: str(p.description, '故障描述'), createdAt: now, status: '待处理', hourly: rates[0].hourly, rateFrom: rates[0].from, minutes: 0, cost: 0, history: [] };
    s.repairs.push(r); e.status = '待维修'; target = r.id;
  } else if (action === 'repairStart' || action === 'repairComplete' || action === 'repairAccept' || action === 'repairReject') {
    const r = find(s.repairs, p.repairId, '维修单');
    const e = find(s.equipment, r.equipmentId, '装备');
    if (user.role === 'contractor') check(r.contractorId === user.contractorId, '只能处理分配给自己的维修单');
    if (action === 'repairStart') {
      check(r.status === '待处理', '维修单不在待处理状态'); r.status = '维修中'; e.status = '维修中';
    } else if (action === 'repairComplete') {
      check(r.status === '维修中', '请先登记开工');
      const minutes = num(p.minutes, 15, 6000, '本次工时(分钟)', true);
      check(minutes % 15 === 0, '维修工时必须是15分钟的倍数');
      r.minutes += minutes; r.cost = Math.round(r.minutes / 60 * r.hourly); r.completedAt = now; r.status = '待验收'; e.status = '待检查';
    } else {
      check(r.status === '待验收', '维修单不在待验收状态');
      if (action === 'repairAccept') { store(s, p.storeId); e.location = p.storeId; e.status = '可租'; r.status = '已关闭'; r.acceptedAt = now; }
      else { r.status = '维修中'; e.status = '维修中'; }
    }
    r.history.push({ action, note: str(p.note, '处理说明'), at: now, actor: user.contractorId || user.employeeId }); target = r.id;
  } else if (action === 'equipmentAdd') {
    const eid = str(p.id, '库存编号', 40); check(!s.equipment.some(x => x.id === eid), '库存编号已存在');
    store(s, p.storeId); const category = str(p.category, '类别');
    check(['滑雪板', '雪杖', '雪靴', '单板', '头盔', '护目镜'].includes(category), '类别不支持');
    if (SKILL_CATEGORIES.includes(category)) check(LEVELS.includes(p.level), '此类装备必须选择技能等级');
    s.equipment.push({ id: eid, name: str(p.name, '装备名称'), spec: str(p.spec, '规格'), category, level: SKILL_CATEGORIES.includes(category) ? p.level : '', daily: cents(p.daily, '日租金'), cost: cents(p.cost, '购入成本'), retail: cents(p.retail, '零售价'), purchased: date(p.purchased), home: p.storeId, location: p.storeId, status: '待检查' }); target = eid;
  } else if (action === 'equipmentMove') {
    const e = find(s.equipment, p.equipmentId, '装备'); store(s, p.storeId);
    check(['可租', '待检查'].includes(e.status), '仅可调拨闲置且无维修单装备');
    check(!s.repairs.some(x => x.equipmentId === e.id && x.status !== '已关闭'), '请先完成维修验收');
    e.location = p.storeId; if (p.permanent === true) e.home = p.storeId;
    e.status = '待检查'; target = e.id; str(p.note, '实物接收说明');
  } else if (action === 'employeeAdd') {
    const eid = str(p.id, '员工ID', 40); check(!s.employees.some(x => x.id === eid), '员工ID重复');
    s.employees.push({ id: eid, name: str(p.name, '姓名'), phone: str(p.phone, '电话'), address: str(p.address, '地址'), email: str(p.email, '邮箱'), notes: p.notes || '' }); target = eid;
  } else if (action === 'contractorAdd') {
    const vid = str(p.id, '承包商ID', 40); check(!s.contractors.some(x => x.id === vid), '承包商ID重复');
    s.contractors.push({ id: vid, name: str(p.name, '名称'), phone: str(p.phone, '电话'), address: str(p.address, '地址'), email: str(p.email, '邮箱'), rates: [{ from: date(p.from), hourly: cents(p.hourly, '小时费率') }] }); target = vid;
  } else if (action === 'rateAdd') {
    const v = find(s.contractors, p.contractorId, '承包商'); const from = date(p.from);
    check(!v.rates.some(x => x.from === from), '同日费率已存在'); v.rates.push({ from, hourly: cents(p.hourly, '小时费率') }); target = v.id;
  } else if (action === 'shiftAdd') {
    find(s.employees, p.employeeId, '员工'); store(s, p.storeId); date(p.date);
    check(/^\d{2}:\d{2}$/.test(p.start || '') && /^\d{2}:\d{2}$/.test(p.end || ''), '时间格式应为HH:mm');
    check([p.start, p.end].every(x => Number(x.slice(0, 2)) <= 23 && Number(x.slice(3)) <= 59), '时间无效');
    check(p.start >= '08:00' && p.end <= '22:00' && p.start < p.end, '班次必须在08:00至22:00，且开始早于结束');
    check(!s.shifts.some(x => x.employeeId === p.employeeId && x.date === p.date), '该员工当天已有班次');
    target = id(s, 'S'); s.shifts.push({ id: target, employeeId: p.employeeId, storeId: p.storeId, date: p.date, start: p.start, end: p.end });
  } else fail('未知操作');
  audit(s, user, action, target, now);
  return s;
}
const BSR_DOMAIN = { seed, apply, view, LEVELS, dayAt };
if (typeof module !== 'undefined' && module.exports) module.exports = BSR_DOMAIN;
else globalThis.BsrDomain = BSR_DOMAIN;
