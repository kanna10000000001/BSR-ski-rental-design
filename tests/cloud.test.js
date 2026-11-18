const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const domain = require('../miniprogram/utils/domain');
const storage = require('../cloudfunctions/bsrApi/storage');
// SDK测试替身：检验入口身份、事务调用和请求去重，不代替腾讯云实测。
function fixture() {
  let openid = 'owner'; let saved;
  const users = [{ _id: 'owner', enabled: true, role: 'manager', employeeId: 'E01' }, { _id: 'vendor', enabled: true, role: 'contractor', contractorId: 'V01' }];
  function collection(name) {
    return {
      where(criteria) { return { limit() { return { async get() { return { data: users.filter(x => Object.keys(criteria).every(k => x[k] === criteria[k])) }; } }; } }; },
      doc(key) { return { async get() { if (!saved) throw Error('document missing'); return { data: Object.assign({ _id: key }, JSON.parse(JSON.stringify(saved))) }; }, async set({ data }) { saved = data; } }; },
      async add({ data }) { if (saved) throw Error('duplicate document'); assert.equal(name, 'bsr_state'); saved = data; }
    };
  }
  let txCount = 0;
  const db = { collection, async runTransaction(fn) { txCount++; const before = JSON.stringify(saved); try { return await fn({ collection }); } catch (e) { saved = JSON.parse(before); throw e; } } };
  const cloud = { init() {}, database: () => db, getWXContext: () => ({ OPENID: openid }) };
  const sandbox = { require: name => name === 'wx-server-sdk' ? cloud : name === './storage' ? storage : domain, exports: {}, Buffer, console: { error() {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../cloudfunctions/bsrApi/index.js'), 'utf8'), sandbox);
  return { call: sandbox.exports.main, setUser: x => { openid = x; }, state: () => saved, txCount: () => txCount };
}
test('云函数拒绝未授权身份和前端伪造的负责人角色', async () => {
  const f = fixture(); f.setUser('stranger');
  const identity = await f.call({ action: 'identity' }); assert.equal(identity.openid, 'stranger');
  const r = await f.call({ action: 'initialize', role: 'manager', employeeId: 'E01' });
  assert.equal(r.ok, false); assert.match(r.message, /未授权/); assert.equal(f.state(), undefined);
});
test('首次初始化不覆盖；写入经过事务且同一请求不重复排班', async () => {
  const f = fixture(); assert.equal((await f.call({ action: 'initialize' })).ok, true);
  assert.equal((await f.call({ action: 'initialize' })).ok, false);
  const event = { action: 'shiftAdd', requestId: 'req_test_0000001', payload: { employeeId: 'E02', date: '2026-10-22', storeId: 'east', start: '08:00', end: '17:00' } };
  assert.equal((await f.call(event)).ok, true); assert.equal((await f.call(event)).ok, true);
  assert.equal(f.state().shifts.length, 1); assert.equal(f.txCount(), 2);
  const load = await f.call({ action: 'load' }); assert.equal(load.state.requests, undefined);
});
test('云端承包商不能通过传入role获得经理权限', async () => {
  const f = fixture(); await f.call({ action: 'initialize' }); f.setUser('vendor');
  const r = await f.call({ action: 'shiftAdd', role: 'manager', requestId: 'req_test_0000002', payload: { employeeId: 'E02', date: '2026-10-22', storeId: 'east', start: '08:00', end: '17:00' } });
  assert.equal(r.ok, false); assert.match(r.message, /无权/); assert.equal(f.state().shifts.length, 0);
});
