// 业务数据按对象分开保存；main 只保存版本、编号和请求去重信息。
// 旧版 main 仍可读取，方便云函数更新与数据迁移分步进行。
const GROUPS = ['stores', 'employees', 'contractors', 'equipment', 'customers', 'reservations', 'contracts', 'repairs', 'shifts', 'audit'];
const LIMIT = 700000;
function checkSize(value) {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > LIMIT) throw new Error('该类记录已接近容量上限，请先导出备份');
}
async function read(source) {
  const main = (await source.collection('bsr_state').doc('main').get()).data;
  if (main.schemaVersion !== 2) return main;
  const parts = await Promise.all(GROUPS.map(async name => {
    const doc = (await source.collection('bsr_state').doc('data_' + name).get()).data;
    if (!doc || !Array.isArray(doc.items)) throw new Error(name + ' 数据缺失，请检查数据库');
    return doc.items;
  }));
  const state = { schemaVersion: 2, version: main.version, seq: main.seq, requests: main.requests || [] };
  GROUPS.forEach((name, i) => { state[name] = parts[i]; });
  return state;
}
async function write(source, previous, updated) {
  delete updated._id;
  if (previous.schemaVersion !== 2) {
    checkSize(updated);
    await source.collection('bsr_state').doc('main').set({ data: updated });
    return;
  }
  for (const name of GROUPS) {
    const items = updated[name] || [];
    checkSize(items);
    if (JSON.stringify(items) !== JSON.stringify(previous[name] || [])) {
      await source.collection('bsr_state').doc('data_' + name).set({ data: { items } });
    }
  }
  await source.collection('bsr_state').doc('main').set({ data: {
    schemaVersion: 2, version: updated.version, seq: updated.seq, requests: updated.requests || []
  } });
}
async function change(db, apply) {
  return db.runTransaction(async tx => {
    const previous = await read(tx);
    const result = apply(previous);
    if (result && result.unchanged) return result.value;
    await write(tx, previous, result.state);
    return result.value;
  });
}
module.exports = { GROUPS, read, change };
