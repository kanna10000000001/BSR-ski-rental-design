const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const filename of ['domain.js', 'customer-domain.js', 'presentation.js']) {
  for (const destination of ['cloudfunctions/bsrApi', 'cloudfunctions/bsrWebApi', 'web-admin/dist']) {
    fs.copyFileSync(path.join(root, 'miniprogram/utils', filename), path.join(root, destination, filename));
  }
}
console.log('已同步小程序、网页和两支云函数的共用业务规则');
