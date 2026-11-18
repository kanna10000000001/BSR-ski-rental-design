const crypto = require('crypto');
function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function passwordHash(password, salt) { return crypto.scryptSync(password, salt, 32).toString('hex'); }
function verifyPassword(password, record) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128 || !record || !/^[a-f0-9]{64}$/.test(record.passwordHash || '') || typeof record.salt !== 'string') return false;
  return crypto.timingSafeEqual(Buffer.from(passwordHash(password, record.salt), 'hex'), Buffer.from(record.passwordHash, 'hex'));
}
function newAccount(username, password, user) {
  const salt = crypto.randomBytes(16).toString('hex');
  return Object.assign({ _id: username, enabled: true, salt, passwordHash: passwordHash(password, salt), failed: 0, lockedUntil: 0, credentialVersion: 1 }, user);
}
module.exports = { digest, passwordHash, verifyPassword, newAccount };
