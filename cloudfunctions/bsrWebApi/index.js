const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const auth = require('./auth');
const domain = require('./domain');
const customer = require('./customer-domain');
const storage = require('./storage');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const SESSION_MS = 4 * 3600000;
function assert(ok, message) { if (!ok) throw new Error(message); }
async function one(collection, id) {
  const result = await db.collection(collection).where({ _id: id }).limit(1).get();
  return result.data[0];
}
function publicUser(u) { return { name: u.name || u._id, username: u._id, role: u.role, employeeId: u.employeeId || '', contractorId: u.contractorId || '' }; }
exports.main = async event => {
  const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const origin = headers.origin || '';
  const allowed = (process.env.BSR_WEB_ORIGINS || 'https://smiling-eel-d0ga3uw9x0e95603a-1512334442.tcloudbaseapp.com').split(',').map(x => x.trim());
  const cors = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin' };
  if (allowed.includes(origin)) cors['Access-Control-Allow-Origin'] = origin;
  const respond = (code, body) => ({ statusCode: code, headers: cors, isBase64Encoded: false, body: JSON.stringify(body) });
  try {
    assert(!origin || allowed.includes(origin), '该网页来源未获授权');
    if (event.httpMethod === 'OPTIONS') {
      cors['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
      cors['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
      return respond(204, {});
    }
    assert(event.httpMethod === 'POST', '请通过网页后台发送POST请求');
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
    assert(typeof raw === 'string' && Buffer.byteLength(raw) <= 32000, '请求内容无效或过大');
    const request = JSON.parse(raw); const p = request.payload || {}; const action = request.action;
    if (action === 'login') {
      const username = String(p.username || '').trim().toLowerCase();
      assert(/^[a-z0-9_-]{3,32}$/.test(username), '账号或密码不正确');
      const token = crypto.randomBytes(32).toString('hex'); const tokenId = auth.digest(token);
      const user = await db.runTransaction(async tx => {
        const found = await tx.collection('bsr_web_users').doc(username).get().catch(() => ({ data: null }));
        const u = found.data;
        if (!u || !u.enabled) { auth.passwordHash('padding-password', 'padding-salt'); return null; }
        if (Number(u.lockedUntil || 0) > Date.now()) return null;
        if (!auth.verifyPassword(p.password, u)) {
          const failed = Number(u.failed || 0) + 1;
          await tx.collection('bsr_web_users').doc(username).update({ data: { failed, lockedUntil: failed >= 5 ? Date.now() + 15 * 60000 : 0 } });
          return null;
        }
        assert(['manager', 'staff', 'contractor'].includes(u.role), '账号角色无效');
        await tx.collection('bsr_web_users').doc(username).update({ data: { failed: 0, lockedUntil: 0 } });
        await tx.collection('bsr_web_sessions').doc(tokenId).set({ data: { username, expiresAt: Date.now() + SESSION_MS, credentialVersion: u.credentialVersion || 1 } });
        return publicUser(u);
      });
      assert(user, '账号或密码不正确；连续失败后需等待15分钟');
      return respond(200, { ok: true, token, user });
    }
    const token = (headers.authorization || '').replace(/^Bearer /i, '');
    assert(/^[a-f0-9]{64}$/.test(token), '请先登录网页后台');
    const session = await one('bsr_web_sessions', auth.digest(token));
    assert(session && session.expiresAt > Date.now(), '登录已过期，请重新登录');
    const account = await one('bsr_web_users', session.username);
    assert(account && account.enabled && (account.credentialVersion || 1) === session.credentialVersion, '账号已停用或登录失效');
    const user = publicUser(account);
    if (action === 'logout') { await db.collection('bsr_web_sessions').doc(auth.digest(token)).remove(); return respond(200, { ok: true }); }
    if (action === 'passwordChange') {
      assert(auth.verifyPassword(p.oldPassword, account), '原密码不正确');
      assert(typeof p.newPassword === 'string' && p.newPassword.length >= 8 && p.newPassword.length <= 128, '新密码至少8位');
      const salt = crypto.randomBytes(16).toString('hex');
      await db.collection('bsr_web_users').doc(account._id).update({ data: { salt, passwordHash: auth.passwordHash(p.newPassword, salt), credentialVersion: (account.credentialVersion || 1) + 1 } });
      return respond(200, { ok: true, message: '密码已更新，请重新登录' });
    }
    if (action === 'load') {
      return respond(200, { ok: true, user, state: domain.view(await storage.read(db), user) });
    }
    assert(typeof request.requestId === 'string' && /^[A-Za-z0-9_-]{10,100}$/.test(request.requestId), '请求编号无效');
    const state = await storage.change(db, previous => {
      const requests = previous.requests || [];
      const key = 'web:' + user.username + ':' + request.requestId;
      if (requests.includes(key)) return { unchanged: true, value: domain.view(previous, user) };
      const updated = customer.adminApply(previous, action, p, user, domain);
      delete updated._id; updated.requests = requests.concat(key).slice(-200);
      return { state: updated, value: domain.view(updated, user) };
    });
    return respond(200, { ok: true, state, user });
  } catch (err) {
    // 不记录请求体、密码或Bearer令牌。
    console.error('BSR web request failed:', err.message);
    return respond(400, { ok: false, message: err.message || '处理失败' });
  }
};
