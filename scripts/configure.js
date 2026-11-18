// 用法：node scripts/configure.js wx开头的AppID 环境ID
const fs = require('node:fs');
const path = require('node:path');
const [appid, envId] = process.argv.slice(2);
if (!/^wx[0-9a-fA-F]{16}$/.test(appid || '') || !/^[A-Za-z0-9_-]{5,100}$/.test(envId || '')) {
  console.error('用法：node scripts/configure.js wx开头的AppID 云环境ID');
  process.exit(1);
}
const root = path.resolve(__dirname, '..');
const projectFile = path.join(root, 'project.config.json');
const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
project.appid = appid;
fs.writeFileSync(projectFile, JSON.stringify(project, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'miniprogram/config.js'), 'module.exports = ' + JSON.stringify({ demo: false, envId }, null, 2) + ';\n');
console.log('AppID和环境ID已配置，已切换云端模式。请在开发者工具重新编译。');
