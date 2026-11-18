const test = require('node:test');
const assert = require('node:assert/strict');
const { seed, apply, view } = require('../miniprogram/utils/domain');
const manager = { role: 'manager', employeeId: 'E01' };
const staff = { role: 'staff', employeeId: 'E02' };
const vendor = { role: 'contractor', contractorId: 'V01' };
const NOW = '2026-10-22T02:00:00.000Z';
const NEXT = '2026-10-23T02:00:00.000Z';
const create = (extra = {}) => Object.assign({ storeId: 'east', name: '测试顾客', email: 'test@example.com', phone: '虚构电话', address: '示例地址', birthYear: '2000', height: '170', weight: '60', shoeSize: '40', level: '中级', days: '3', fitting: '专业人员已检查', signed: true, checked: true, consent: true, equipmentIds: ['3828'], reference: 'PAY-001' }, extra);
const rent = () => apply(seed(), 'contractCreate', create(), staff, NOW);
function prepare(s = rent()) {
  return apply(s, 'exchangePrepare', { contractId: s.contracts[0].id, segmentId: s.contracts[0].items[0].id, storeId: 'west', equipmentId: '4637', reason: '付费升级', fitting: '检查完成', checked: true }, staff, NEXT);
}
test('开单快照价格、技能与原签约员工，逐件占用', () => {
  const s = rent(); const c = s.contracts[0];
  assert.equal(c.total, 60000); assert.equal(c.employeeId, 'E02'); assert.equal(c.level, '中级');
  assert.equal(s.equipment[0].status, '租出'); assert.equal(c.items[0].daily, 20000);
});
test('不可重复借出，失败不改变原数据', () => {
  const s = rent(); const before = JSON.stringify(s);
  assert.throws(() => apply(s, 'contractCreate', create({ email: 'other@example.com', reference: 'PAY-002' }), staff, NOW), /不可租/);
  assert.equal(JSON.stringify(s), before);
});
test('部分归还不关闭合同，跨店归还不改变归属', () => {
  let s = apply(seed(), 'contractCreate', create({ equipmentIds: ['3828', 'H100'] }), staff, NOW);
  const c = s.contracts[0];
  s = apply(s, 'returnItem', { contractId: c.id, segmentId: c.items[0].id, storeId: 'west' }, staff, NEXT);
  assert.equal(s.equipment[0].home, 'east'); assert.equal(s.equipment[0].location, 'west');
  assert.equal(s.equipment[0].status, '待检查'); assert.equal(s.contracts[0].status, '生效');
});
test('归还幂等且全部归还关闭合同', () => {
  let s = rent(); const c = s.contracts[0]; const p = { contractId: c.id, segmentId: c.items[0].id, storeId: 'west' };
  s = apply(s, 'returnItem', p, staff, NEXT); const saved = JSON.stringify(s);
  s = apply(s, 'returnItem', p, staff, NEXT); assert.equal(JSON.stringify(s), saved);
  assert.equal(s.contracts[0].status, '已关闭');
});
test('待结算换装保留旧件归还，新件不得借出，报价符合报告120元例子', () => {
  const s = prepare(); const c = s.contracts[0];
  assert.ok(c.items[0].returnAt); assert.equal(c.changes[0].delta, 12000);
  assert.equal(s.equipment.find(x => x.id === '4637').status, '换装预留');
  assert.equal(c.items.length, 1); assert.equal(c.status, '生效');
});
test('换装结算只追加新段，分配金额合计等于新总额', () => {
  let s = prepare(); const c = s.contracts[0];
  s = apply(s, 'exchangeConfirm', { contractId: c.id, changeId: c.changes[0].id, reference: 'UPGRADE-001' }, staff, NEXT);
  assert.equal(s.contracts[0].total, 72000);
  assert.equal(s.contracts[0].items.reduce((n, l) => n + l.charge, 0), 72000);
  assert.equal(s.contracts[0].items[0].charge, 20000); assert.equal(s.contracts[0].items[1].charge, 52000);
  assert.equal(s.equipment[1].status, '租出');
});
test('换装取消释放新件，旧件归还仍保留', () => {
  let s = prepare(); const c = s.contracts[0];
  s = apply(s, 'exchangeCancel', { contractId: c.id, changeId: c.changes[0].id }, staff, NEXT);
  assert.ok(s.contracts[0].items[0].returnAt); assert.equal(s.equipment[1].status, '可租');
});
test('升级结算凭据缺失时不改变换装预留和旧件归还', () => {
  const s = prepare(); const c = s.contracts[0];
  assert.throws(() => apply(s, 'exchangeConfirm', { contractId: c.id, changeId: c.changes[0].id }, staff, NEXT), /凭据/);
  assert.equal(s.equipment[1].status, '换装预留'); assert.ok(s.contracts[0].items[0].returnAt);
});
test('同日多次升级仅补档位价差', () => {
  let s = prepare(); let c = s.contracts[0];
  s = apply(s, 'exchangeConfirm', { contractId: c.id, changeId: c.changes[0].id, reference: 'UP1' }, staff, NEXT);
  s.equipment.push(Object.assign({}, s.equipment[1], { id: 'VIP', daily: 30000, status: '可租', location: 'west' }));
  c = s.contracts[0];
  s = apply(s, 'exchangePrepare', { contractId: c.id, segmentId: c.items[1].id, equipmentId: 'VIP', storeId: 'west', reason: '付费升级', checked: true, fitting: '专业检查' }, staff, NEXT);
  assert.equal(s.contracts[0].changes[1].delta, 8000);
});
test('维修冻结历史费率，后续费率不倒改', () => {
  let s = apply(seed(), 'repairCreate', { equipmentId: '3828', contractorId: 'V01', description: '检查底板损伤' }, staff, NOW);
  s = apply(s, 'rateAdd', { contractorId: 'V01', from: '2026-10-22', hourly: '260' }, manager, NOW);
  assert.equal(s.repairs[0].hourly, 18000);
});
test('维修完整流程、15分钟粒度、员工验收才能恢复可租', () => {
  let s = apply(seed(), 'repairCreate', { equipmentId: '3828', contractorId: 'V01', description: '底板损伤' }, staff, NOW);
  const repairId = s.repairs[0].id;
  s = apply(s, 'repairStart', { repairId, note: '开始维修' }, vendor, NOW);
  assert.throws(() => apply(s, 'repairComplete', { repairId, minutes: '16', note: '维修完成' }, vendor, NOW), /15分钟/);
  s = apply(s, 'repairComplete', { repairId, minutes: '45', note: '完成底板维修' }, vendor, NOW);
  assert.equal(s.repairs[0].cost, 13500); assert.equal(s.equipment[0].status, '待检查');
  assert.throws(() => apply(s, 'equipmentInspect', { equipmentId: '3828', note: '尝试放行' }, staff, NOW), /未关闭维修单/);
  s = apply(s, 'repairAccept', { repairId, storeId: 'west', note: '实物回店并验收合格' }, staff, NOW);
  assert.equal(s.repairs[0].status, '已关闭'); assert.equal(s.equipment[0].status, '可租'); assert.equal(s.equipment[0].home, 'east');
});
test('承包商不能创建/验收维修单，不能更新他人工单', () => {
  const p = { equipmentId: '3828', contractorId: 'V01', description: '故障' };
  assert.throws(() => apply(seed(), 'repairCreate', p, vendor, NOW), /无权/);
  const s = apply(seed(), 'repairCreate', p, staff, NOW);
  assert.throws(() => apply(s, 'repairStart', { repairId: s.repairs[0].id, note: '开工' }, { role: 'contractor', contractorId: 'V02' }, NOW), /自己/);
  assert.throws(() => apply(s, 'repairAccept', { repairId: s.repairs[0].id, note: '验收', storeId: 'east' }, vendor, NOW), /无权/);
});
test('承包商视图没有客户、合同及其他承包商资料', () => {
  const s = rent(); s.requests = ['secret-openid'];
  const v = view(s, vendor);
  assert.deepEqual(v.customers, []); assert.deepEqual(v.contracts, []); assert.deepEqual(v.employees, []);
  assert.equal(view(s, manager).requests, undefined);
});
test('排班同人同日只能一班，校验窗口和时间格式', () => {
  const p = { employeeId: 'E02', storeId: 'east', date: '2026-10-22', start: '08:00', end: '17:00' };
  let s = apply(seed(), 'shiftAdd', p, manager, NOW);
  assert.throws(() => apply(s, 'shiftAdd', Object.assign({}, p, { storeId: 'west' }), manager, NOW), /已有班次/);
  assert.throws(() => apply(seed(), 'shiftAdd', Object.assign({}, p, { start: '07:59' }), manager, NOW), /08:00/);
  assert.throws(() => apply(seed(), 'shiftAdd', Object.assign({}, p, { end: '18:99' }), manager, NOW), /无效/);
  assert.throws(() => apply(seed(), 'shiftAdd', Object.assign({}, p, { date: '2026-02-30' }), manager, NOW), /日期无效/);
});
test('非负责人不能入库或排班；配件不保留技能等级', () => {
  const p = { id: 'H200', name: '头盔', category: '头盔', spec: 'M', level: '高级', daily: '40', cost: '300', retail: '500', purchased: '2026-10-20', storeId: 'east' };
  assert.throws(() => apply(seed(), 'equipmentAdd', p, staff, NOW), /无权/);
  const s = apply(seed(), 'equipmentAdd', p, manager, NOW);
  assert.equal(s.equipment.at(-1).level, ''); assert.equal(s.equipment.at(-1).status, '待检查');
});
test('客户复用须明确ID与邮箱；重复付款凭据被拒绝', () => {
  let s = rent();
  assert.throws(() => apply(s, 'contractCreate', create({ equipmentIds: ['H100'], reference: 'P2' }), staff, NOW), /此邮箱已有客户/);
  assert.throws(() => apply(s, 'contractCreate', create({ customerId: s.customers[0].id, equipmentIds: ['H100'], reference: 'PAY-001' }), staff, NOW), /凭据已使用/);
  s = apply(s, 'contractCreate', create({ customerId: s.customers[0].id, equipmentIds: ['H100'], reference: 'P2' }), staff, NOW);
  assert.equal(s.customers.length, 1); assert.equal(s.contracts.length, 2);
});
test('签字、知情及适配检查不可省略', () => {
  for (const key of ['signed', 'checked', 'consent']) assert.throws(() => apply(seed(), 'contractCreate', create({ [key]: false }), staff, NOW), /确认/);
});
test('归还后检查放行，调拨接收不自动可租', () => {
  let s = rent(); const c = s.contracts[0];
  s = apply(s, 'returnItem', { contractId: c.id, segmentId: c.items[0].id, storeId: 'west' }, staff, NEXT);
  s = apply(s, 'equipmentInspect', { equipmentId: '3828', note: '清洁干燥及检查完成' }, staff, NEXT);
  s = apply(s, 'equipmentMove', { equipmentId: '3828', storeId: 'east', permanent: true, note: '已收到实物' }, manager, NEXT);
  assert.equal(s.equipment[0].status, '待检查'); assert.equal(s.equipment[0].location, 'east');
});
