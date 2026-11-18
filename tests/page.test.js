const test = require('node:test');
const assert = require('node:assert/strict');
// 页面测试固定使用内存中的演示配置，不受用户实际云环境配置影响。
const config = require('../miniprogram/config');
config.demo = true;
config.envId = '';
const storage = new Map();
let definition;
global.wx = {
  getStorageSync: k => storage.get(k),
  setStorageSync: (k, v) => storage.set(k, JSON.parse(JSON.stringify(v))),
  showToast() {}, showModal() {}, showActionSheet() {}, setClipboardData() {}
};
global.Page = value => { definition = value; };
require('../miniprogram/pages/index/index');
function page() {
  const p = Object.assign({}, definition, { data: JSON.parse(JSON.stringify(definition.data)) });
  p.setData = patch => {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.'); let obj = p.data;
      for (const part of parts.slice(0, -1)) obj = obj[part];
      obj[parts.at(-1)] = value;
    }
  };
  return p;
}
const click = dataset => ({ currentTarget: { dataset } });
test('前端演示模式：加载、表单开单、列表刷新、跨店归还', async () => {
  storage.clear(); const p = page(); let alert = '';
  p.alert = message => { alert = message; };
  await p.load();
  assert.equal(p.data.stats.available, 3);
  p.open(click({ type: 'contractCreate' }));
  const values = { name: '虚构顾客', email: 'page@example.com', phone: '示例电话', address: '示例地址', birthYear: '2000', height: '170', weight: '65', shoeSize: '40', fitting: '测试交付检查', reference: 'PAGE-PAY' };
  for (const [key, value] of Object.entries(values)) p.input({ currentTarget: { dataset: { key } }, detail: { value } });
  p.choose({ currentTarget: { dataset: { key: 'level' } }, detail: { value: 1 } });
  for (const key of ['signed', 'checked', 'consent']) p.toggle({ currentTarget: { dataset: { key } }, detail: { value: true } });
  p.selectEquipment(click({ id: '3828' }));
  assert.equal(p.data.selectedTotal, '200.00');
  await p.submit(); assert.equal(alert, ''); assert.equal(p.data.modal, null);
  assert.equal(p.data.contracts[0].amount, '600.00'); assert.equal(p.data.stats.available, 2);
  const c = p.data.state.contracts[0];
  p.open(click({ type: 'returnItem', contract: c.id, segment: c.items[0].id }));
  p.choose({ currentTarget: { dataset: { key: 'storeId' } }, detail: { value: 1 } });
  await p.submit();
  assert.equal(p.data.state.equipment[0].home, 'east'); assert.equal(p.data.state.equipment[0].location, 'west');
  assert.equal(p.data.contracts[0].status, '已关闭');
});
test('前端维修角色视图和工单操作衔接', async () => {
  storage.clear(); const p = page(); await p.load();
  p.open(click({ type: 'repairCreate', id: '3828' }));
  p.choose({ currentTarget: { dataset: { key: 'contractorId' } }, detail: { value: 0 } });
  p.input({ currentTarget: { dataset: { key: 'description' } }, detail: { value: '示例损伤' } });
  await p.submit(); assert.equal(p.data.repairs.length, 1);
  storage.set('bsr-demo-role', 'contractor'); await p.load();
  assert.equal(p.data.user.role, 'contractor'); assert.equal(p.data.state.contracts.length, 0);
  const repair = p.data.repairs[0];
  p.open(click({ type: 'repairStart', id: repair.id }));
  p.input({ currentTarget: { dataset: { key: 'note' } }, detail: { value: '开工' } });
  await p.submit(); assert.equal(p.data.repairs[0].status, '维修中');
  p.open(click({ type: 'repairComplete', id: repair.id }));
  p.input({ currentTarget: { dataset: { key: 'note' } }, detail: { value: '完成' } });
  await p.submit(); assert.equal(p.data.repairs[0].status, '待验收');
  storage.set('bsr-demo-role', 'staff'); await p.load();
  p.open(click({ type: 'repairAccept', id: repair.id }));
  p.choose({ currentTarget: { dataset: { key: 'storeId' } }, detail: { value: 0 } });
  p.input({ currentTarget: { dataset: { key: 'note' } }, detail: { value: '确认回店，验收合格' } });
  await p.submit(); assert.equal(p.data.repairs[0].status, '已关闭');
});
