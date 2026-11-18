// 用法：node scripts/migrate-db-v2.js <私有备份.json> <tcb CLI 路径>
// 先核对备份与云端，再写入分组文档；最后才切换 main。备份文件不放入仓库。
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { GROUPS } = require('../cloudfunctions/bsrApi/storage');
const backupPath = process.argv[2];
const cliPath = process.argv[3];
if (!backupPath || !cliPath) throw new Error('请提供备份文件和 tcb CLI 路径');
const raw = fs.readFileSync(backupPath);
const backup = JSON.parse(raw.toString('utf8'));
if (backup._id !== 'main' || backup.schemaVersion) throw new Error('备份不是旧版 main 文档');
for (const name of GROUPS) {
  if (name !== 'reservations' && !Array.isArray(backup[name])) throw new Error(name + ' 不是数组');
}
function normalize(x) {
  if (Array.isArray(x)) return x.map(normalize);
  if (x && typeof x === 'object') {
    if (Object.keys(x).length === 1 && ('$numberInt' in x || '$numberLong' in x)) return Number(x.$numberInt || x.$numberLong);
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, normalize(v)]));
  }
  return x;
}
function ordered(x) {
  if (Array.isArray(x)) return x.map(ordered);
  if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map(k => [k, ordered(x[k])]));
  return x;
}
function same(a, b, message) {
  if (JSON.stringify(ordered(a)) !== JSON.stringify(ordered(b))) throw new Error(message);
}
function execute(type, body) {
  const command = JSON.stringify([{ TableName: 'bsr_state', CommandType: type, Command: JSON.stringify(body) }]);
  const output = cp.execFileSync(process.execPath, [cliPath, 'db', 'nosql', 'execute', '--command', command, '--json'], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']
  });
  const parsed = JSON.parse(output);
  if (parsed.error) throw new Error(parsed.error.message || '数据库命令失败');
  return parsed.data.results[0];
}
function query(filter, projection) {
  return normalize(execute('QUERY', { find: 'bsr_state', filter, projection, limit: 20 }));
}
const current = query({ _id: 'main' })[0];
assert(current, '云端找不到 main');
same(current, backup, '云端数据已变化，请重新导出备份');
const original = structuredClone(backup);
if (!backup.reservations) backup.reservations = [];
const ids = GROUPS.map(name => 'data_' + name);
const existing = query({ _id: { $in: ids } });
if (existing.length && existing.length !== GROUPS.length) throw new Error('分组文档只写入了一部分，请检查数据库');
const documents = GROUPS.map(name => ({ _id: 'data_' + name, items: backup[name] }));
if (!existing.length) execute('INSERT', { insert: 'bsr_state', documents });
const inserted = query({ _id: { $in: ids } });
assert.equal(inserted.length, GROUPS.length, '分组文档写入不完整，main 未切换');
for (const name of GROUPS) {
  const doc = inserted.find(x => x._id === 'data_' + name);
  same(doc.items, backup[name], name + ' 写入后不一致');
}
same(query({ _id: 'main' })[0], original, '迁移期间 main 发生变化，未切换版本');
const match = { _id: 'main', version: backup.version, seq: backup.seq, requests: backup.requests || [] };
for (const name of GROUPS) if (name in current) match[name] = current[name];
const unset = Object.fromEntries(GROUPS.map(name => [name, '']));
execute('UPDATE', { update: 'bsr_state', updates: [{ q: match, u: { $set: { schemaVersion: 2 }, $unset: unset }, multi: false }] });
const main = query({ _id: 'main' })[0];
assert.equal(main.schemaVersion, 2, 'main 未切换，请检查数据库');
for (const name of GROUPS) assert.equal(name in main, false, name + ' 仍留在 main');
console.log(JSON.stringify({ schemaVersion: 2, groups: GROUPS.length, records: Object.fromEntries(GROUPS.map(name => [name, backup[name].length])), backupSha256: crypto.createHash('sha256').update(raw).digest('hex') }));
