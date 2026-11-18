const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const profile = process.env.USERPROFILE || 'C:/Users/shuan';
const candidates = [
  path.join(profile, 'Desktop', '微信web开发者工具'),
  'C:/Program Files (x86)/Tencent/微信web开发者工具',
  'C:/Program Files/Tencent/微信web开发者工具'
];
const installation = candidates.find(dir => fs.existsSync(path.join(dir, 'cli.js')) && fs.existsSync(path.join(dir, 'node.exe')));
if (!installation) {
  console.error('找不到微信开发者工具。请在工具中手动导入目录：' + root);
  process.exit(1);
}
// 仅修正此子进程的PATH，不修改系统环境变量或系统代理。
const env = Object.assign({}, process.env);
const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH';
const windows = process.env.SystemRoot || 'C:/Windows';
env[pathKey] = path.join(windows, 'System32') + ';' + windows + ';' + (env[pathKey] || '');
const result = spawnSync(path.join(installation, 'node.exe'), [path.join(installation, 'cli.js'), 'open', '--project', root], { env, cwd: root, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status === null ? 1 : result.status);
