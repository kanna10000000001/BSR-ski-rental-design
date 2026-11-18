const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
function walk(p) { return fs.readdirSync(p, { withFileTypes: true }).flatMap(x => x.isDirectory() ? walk(path.join(p, x.name)) : [path.join(p, x.name)]); }
const files = walk(root).filter(x => !x.includes('node_modules'));
for (const f of files) {
  if (f.endsWith('.json')) JSON.parse(fs.readFileSync(f, 'utf8'));
  if (f.endsWith('.js')) cp.execFileSync(process.execPath, ['--check', f]);
}
if (!fs.readFileSync(path.join(root, 'miniprogram/utils/domain.js')).equals(fs.readFileSync(path.join(root, 'cloudfunctions/bsrApi/domain.js')))) throw Error('请执行 npm run sync 同步云端规则');
if (!fs.readFileSync(path.join(root, 'cloudfunctions/bsrApi/storage.js')).equals(fs.readFileSync(path.join(root, 'cloudfunctions/bsrWebApi/storage.js')))) throw Error('两支云函数的数据存储规则不一致');
console.log('JSON、JavaScript语法与云端规则同步检查通过');
