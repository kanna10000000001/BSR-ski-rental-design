const cloud = require('wx-server-sdk');
const domain = require('./domain');
const customer = require('./customer-domain');
const storage = require('./storage');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
exports.main = async (event) => {
  try {
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) throw new Error('请从微信小程序调用');
    if (event.action === 'identity') return { ok: true, openid: OPENID };
    if (['catalog', 'myRecords', 'reservationCreate', 'reservationCancel'].includes(event.action)) {
      if (event.action === 'catalog' || event.action === 'myRecords') {
        const state = await storage.read(db);
        return { ok: true, data: event.action === 'catalog' ? customer.catalog(state) : customer.myRecords(state, OPENID) };
      }
      const data = await storage.change(db, original => {
        const updated = customer.applyCustomer(original, event.action, event.payload, OPENID);
        return { state: updated, value: customer.myRecords(updated, OPENID) };
      });
      return { ok: true, data };
    }
    const result = await db.collection('bsr_users').where({ _id: OPENID, enabled: true }).limit(1).get();
    const user = result.data[0];
    if (!user || !['manager', 'staff', 'contractor'].includes(user.role)) throw new Error('尚未授权，请将“我的身份ID”交给管理员配置');
    if (event.action === 'initialize') {
      if (user.role !== 'manager') throw new Error('仅负责人可初始化');
      // 指定唯一ID，已有文档时 add 失败，不覆盖历史业务数据。
      await db.collection('bsr_state').add({ data: Object.assign({ _id: 'main', requests: [] }, domain.seed()) });
      return { ok: true, state: domain.seed(), user };
    }
    if (event.action === 'load') {
      return { ok: true, state: domain.view(await storage.read(db), user), user };
    }
    if (typeof event.requestId !== 'string' || !/^[A-Za-z0-9_-]{10,100}$/.test(event.requestId)) throw new Error('缺少有效请求编号');
    const state = await storage.change(db, original => {
      const requests = original.requests || [];
      const key = OPENID + ':' + event.requestId;
      if (requests.includes(key)) return { unchanged: true, value: domain.view(original, user) };
      const updated = domain.apply(original, event.action, event.payload, user);
      delete updated._id;
      updated.requests = requests.concat(key).slice(-200);
      return { state: updated, value: domain.view(updated, user) };
    });
    return { ok: true, state, user };
  } catch (err) {
    console.error('BSR action failed:', event.action, err.message);
    return { ok: false, message: err.message || '云端处理失败' };
  }
};
