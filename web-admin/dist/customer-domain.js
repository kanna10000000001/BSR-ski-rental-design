/* 顾客端只看公开装备和本人记录；网页端继续使用原租赁领域规则。 */
(function () {
function check(ok, message) { if (!ok) throw new Error(message); }
function text(value, label, max) { check(typeof value === 'string' && value.trim() && value.length <= max, '请正确填写' + label); return value.trim(); }
function isoDay(now) { return new Date(new Date(now).getTime() + 8 * 3600000).toISOString().slice(0, 10); }
function catalog(state) {
  return { stores: state.stores, equipment: state.equipment.filter(e => e.status === '可租' && e.location).map(e => ({ id: e.id, name: e.name, category: e.category, spec: e.spec, level: e.level, daily: e.daily, storeId: e.location })) };
}
function myRecords(state, openid) {
  return {
    reservations: (state.reservations || []).filter(x => x.openid === openid).map(x => { const r = Object.assign({}, x); delete r.openid; delete r.requestId; return r; }),
    contracts: state.contracts.filter(x => x.customerOpenid === openid).map(x => ({ id: x.id, status: x.status, total: x.total, days: x.days, startDate: x.startDate, storeId: x.storeId, createdAt: x.createdAt, items: x.items.map(l => ({ id: l.id, name: l.name, equipmentId: l.equipmentId, outAt: l.outAt, returnAt: l.returnAt, daily: l.daily })) }))
  };
}
function applyCustomer(input, action, p, openid, now) {
  check(typeof openid === 'string' && openid, '需要微信身份');
  now = now || new Date().toISOString(); p = p || {};
  const s = JSON.parse(JSON.stringify(input)); s.reservations = s.reservations || [];
  if (action === 'reservationCreate') {
    check(typeof p.requestId === 'string' && /^[A-Za-z0-9_-]{10,100}$/.test(p.requestId), '请求编号无效');
    if (s.reservations.some(x => x.openid === openid && x.requestId === p.requestId)) return s;
    check(s.reservations.filter(x => x.openid === openid && ['待确认', '已确认'].includes(x.status)).length < 3, '最多保留3份待处理预约，请先联系门店或取消旧预约');
    check(s.stores.some(x => x.id === p.storeId), '门店不存在');
    const startDate = text(p.startDate, '日期', 10);
    check(/^\d{4}-\d{2}-\d{2}$/.test(startDate), '日期格式错误');
    const stamp = new Date(startDate + 'T00:00:00Z');
    check(Number.isFinite(stamp.getTime()) && stamp.toISOString().slice(0, 10) === startDate, '日期无效');
    const ahead = (stamp - new Date(isoDay(now) + 'T00:00:00Z')) / 86400000;
    check(ahead >= 0 && ahead <= 90, '预约日期应在今天起90天内');
    const days = Number(p.days); check(Number.isInteger(days) && days >= 1 && days <= 30, '租期应为1至30天');
    check(p.consent === true, '请同意门店使用本次预约联系信息');
    const name = text(p.name, '姓名', 40), phone = text(p.phone, '联系电话', 40), email = text(p.email, '邮箱', 100).toLowerCase();
    check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), '邮箱格式不正确');
    check(['初级', '中级', '高级', '专家+'].includes(p.level), '请选择技能等级');
    check(Array.isArray(p.equipmentIds) && p.equipmentIds.length >= 1 && p.equipmentIds.length <= 8 && new Set(p.equipmentIds).size === p.equipmentIds.length, '请选择1至8件不同装备');
    const items = p.equipmentIds.map(id => {
      const e = s.equipment.find(x => x.id === id);
      check(e && e.status === '可租' && e.location === p.storeId, '所选装备已不可租，请刷新列表');
      return { equipmentId: e.id, name: e.name, daily: e.daily };
    });
    s.seq += 1;
    s.reservations.push({ id: 'B' + String(s.seq).padStart(5, '0'), openid, requestId: p.requestId, name, phone, email, level: p.level, storeId: p.storeId, startDate, days, items, estimate: items.reduce((n, e) => n + e.daily * days, 0), status: '待确认', createdAt: now, note: typeof p.note === 'string' ? p.note.slice(0, 200) : '' });
  } else if (action === 'reservationCancel') {
    const r = s.reservations.find(x => x.id === p.id && x.openid === openid);
    check(r, '找不到本人的预约');
    if (r.status === '已取消') return s;
    check(r.status === '待确认', '门店已处理，请联系门店变更');
    r.status = '已取消'; r.cancelledAt = now;
  } else throw new Error('不支持的顾客操作');
  return s;
}
function adminApply(state, action, p, user, base, now) {
  now = now || new Date().toISOString(); p = p || {};
  if (action === 'reservationStatus') {
    check(['manager', 'staff'].includes(user.role), '当前身份无权处理预约');
    check(state.employees.some(x => x.id === user.employeeId), '员工不存在');
    const s = JSON.parse(JSON.stringify(state));
    const r = (s.reservations || []).find(x => x.id === p.id);
    check(r && ['待确认', '已确认'].includes(r.status), '预约已结束或不存在');
    check(['已确认', '已取消'].includes(p.status), '处理状态无效');
    r.status = p.status; r.handledBy = user.employeeId; r.handledAt = now;
    s.seq += 1; s.audit.push({ id: 'A' + s.seq, actor: user.employeeId, action, target: r.id, at: now });
    return s;
  }
  if (action === 'contractCreate' && p.reservationId) {
    const r = (state.reservations || []).find(x => x.id === p.reservationId);
    check(r && ['待确认', '已确认'].includes(r.status), '预约不存在或已处理');
    check(r.email === String(p.email || '').trim().toLowerCase() && r.storeId === p.storeId, '开单邮箱和门店需与预约一致');
    check(r.startDate <= isoDay(now), '尚未到预约取件日期，请到店后再开单');
    const s = base.apply(state, action, p, user, now);
    const c = s.contracts[s.contracts.length - 1];
    c.reservationId = r.id; c.customerOpenid = r.openid;
    const stored = s.reservations.find(x => x.id === r.id);
    stored.status = '已开单'; stored.contractId = c.id; stored.handledBy = user.employeeId;
    return s;
  }
  return base.apply(state, action, p, user, now);
}
const api = { catalog, myRecords, applyCustomer, adminApply };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.BsrCustomer = api;
})();
