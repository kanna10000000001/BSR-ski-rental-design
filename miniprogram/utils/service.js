const config = require('../config');
const domain = require('./domain');
const KEY = 'bsr-demo-v1';
const identities = {
  manager: { role: 'manager', employeeId: 'E01', name: '门店负责人' },
  staff: { role: 'staff', employeeId: 'E02', name: '门店员工' },
  contractor: { role: 'contractor', contractorId: 'V01', name: '维修承包商' }
};
function demoUser() { return identities[wx.getStorageSync('bsr-demo-role') || 'manager'] || identities.manager; }
async function call(action, payload, requestId) {
  if (config.demo) {
    if (action === 'identity') return { openid: '演示模式没有微信身份，请切换云端后获取' };
    let state = wx.getStorageSync(KEY) || domain.seed();
    if (action === 'initialize') state = domain.seed();
    else if (action !== 'load') state = domain.apply(state, action, payload, demoUser());
    wx.setStorageSync(KEY, state);
    return { state: domain.view(state, demoUser()), user: demoUser() };
  }
  if (!config.envId) throw new Error('请先在config.js填写云环境ID');
  const res = await wx.cloud.callFunction({ name: 'bsrApi', data: { action, payload, requestId } });
  if (!res.result || !res.result.ok) throw new Error(res.result && res.result.message || '云函数返回异常');
  return res.result;
}
module.exports = { call, config };
