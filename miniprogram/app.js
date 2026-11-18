const config = require('./config');
App({
  onLaunch() {
    if (!config.demo && wx.cloud && config.envId) {
      wx.cloud.init({ env: config.envId, traceUser: true });
    }
  }
});
