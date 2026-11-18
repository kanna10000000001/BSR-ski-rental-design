const test = require('node:test');
const assert = require('node:assert/strict');
const storage = require('../cloudfunctions/bsrApi/storage');
const domain = require('../miniprogram/utils/domain');
function fixture() {
  const seed = domain.seed();
  const records = new Map([['main', { schemaVersion: 2, version: seed.version, seq: seed.seq, requests: [] }]]);
  for (const name of storage.GROUPS) records.set('data_' + name, { items: seed[name] || [] });
  const writes = [];
  const copy = x => JSON.parse(JSON.stringify(x));
  const collection = () => ({ doc: id => ({
    async get() { if (!records.has(id)) throw Error('missing'); return { data: copy(records.get(id)) }; },
    async set({ data }) { writes.push(id); records.set(id, copy(data)); }
  }) });
  return { db: { collection, runTransaction: fn => fn({ collection }) }, records, writes };
}
test('分组数据可还原业务状态，只写变化的对象和主记录', async () => {
  const f = fixture();
  const before = await storage.read(f.db);
  assert.equal(before.equipment.length, 5);
  await storage.change(f.db, original => {
    const updated = structuredClone(original);
    updated.shifts.push({ id: 'S101', employeeId: 'E02' });
    updated.seq++;
    return { state: updated, value: updated.shifts.length };
  });
  assert.deepEqual(f.writes, ['data_shifts', 'main']);
  assert.equal((await storage.read(f.db)).shifts.length, 1);
  assert.equal(f.records.get('main').equipment, undefined);
});
test('分组文档缺失时拒绝返回不完整状态', async () => {
  const f = fixture(); f.records.delete('data_contracts');
  await assert.rejects(storage.read(f.db), /missing/);
});
