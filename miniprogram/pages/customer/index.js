const config = require('../../config');
const customer = require('../../utils/customer-domain');
const base = require('../../utils/domain');
const presentation = require('../../utils/presentation');
const money = n => (n / 100).toFixed(2);
const day = () => base.dayAt(new Date());
function message(error) {
  const raw = error.message || error.errMsg || '连接失败';
  if (/cloud\.callFunction|errCode:|开通云开发/.test(raw)) {
    console.warn('BSR customer cloud connection:', raw);
    return /601034|没有权限|未关联/.test(raw) ? '门店服务尚未连接，请联系门店管理员。' : '暂时无法连接门店，请稍后重试。';
  }
  return raw;
}
Page({
  data: { tab: 'browse', search: '', recordFilter: '全部', recordFilters: ['全部', '待确认', '已确认', '已开单', '已取消'], visibleRecords: [], returnDate: '', recordCount: 0, storeIndex: 0, category: '全部', categories: ['全部', '单板', '滑雪板', '雪靴', '雪杖', '头盔', '护目镜'], selected: [], basket: [], total: '0.00', days: '3', stores: [], equipment: [], form: { startDate: day(), name: '', email: '', phone: '', level: '中级', note: '', consent: false }, levels: base.LEVELS, levelIndex: 1, records: [], contracts: [], error: '', loading: false, saving: false, demo: config.demo, today: day() },
  onLoad() { this.load(); },
  async onPullDownRefresh() { try { if(this.data.tab === 'records') await this.records(); else await this.load(); } finally { wx.stopPullDownRefresh(); } },
  retry() { return this.data.tab === 'records' ? this.records() : this.load(); },
  async switchMode(e) {
    this.catalog = null; this.requestId = null;
    this.setData({demo:e.currentTarget.dataset.demo==='true',tab:'browse',storeIndex:0,category:'全部',search:'',selected:[],basket:[],equipment:[],stores:[],records:[],visibleRecords:[],contracts:[],recordCount:0,error:'',form:{startDate:day(),name:'',email:'',phone:'',level:'中级',note:'',consent:false}});
    await this.load();
  },
  search(e) { this.setData({search:e.detail.value}); this.refresh(); },
  recordFilter(e) { this.setData({recordFilter:e.currentTarget.dataset.name}); this.filterRecords(); },
  filterRecords() { this.setData({visibleRecords:this.data.records.filter(x=>this.data.recordFilter==='全部'||x.status===this.data.recordFilter)}); },
  async api(action, payload) {
    if (this.data.demo) {
      let state = wx.getStorageSync('bsr-demo-v1') || base.seed();
      if (action === 'catalog') return customer.catalog(state);
      if (action === 'myRecords') return customer.myRecords(state, 'demo-customer');
      state = customer.applyCustomer(state, action, payload, 'demo-customer');
      wx.setStorageSync('bsr-demo-v1', state); return customer.myRecords(state, 'demo-customer');
    }
    const res = await wx.cloud.callFunction({ name: 'bsrApi', data: { action, payload } });
    if (!res.result || !res.result.ok) throw new Error(res.result && res.result.message || '连接失败，请确认云环境已关联当前小程序');
    return res.result.data;
  },
  async load() {
    this.setData({ loading: true, error: '' });
    try { const data = await this.api('catalog'); this.catalog = data; this.setData({ stores: data.stores }); this.refresh(); }
    catch (e) { this.setData({ error: message(e) }); }
    finally { this.setData({ loading: false }); }
  },
  refresh() {
    if (!this.catalog) return;
    const store = this.catalog.stores[this.data.storeIndex];
    if (!store) return;
    const selected = this.data.selected;
    const equipment = this.catalog.equipment.filter(x => x.storeId === store.id && (this.data.category === '全部' || x.category === this.data.category) && (!this.data.search || (x.name+' '+x.id+' '+x.spec).toLowerCase().includes(this.data.search.toLowerCase()))).map(x => Object.assign({}, x, { price: money(x.daily), selected: selected.includes(x.id) }));
    const basket = this.catalog.equipment.filter(x => selected.includes(x.id)).map(x => Object.assign({}, x, { price: money(x.daily) }));
    this.setData({ equipment, basket, storeName: store.name, returnDate: Number.isInteger(Number(this.data.days)) && Number(this.data.days)>=1 && Number(this.data.days)<=30 ? presentation.addDays(this.data.form.startDate, Number(this.data.days)-1) : '', total: money(basket.reduce((n, x) => n + x.daily, 0) * (Number(this.data.days) || 0)) });
  },
  store(e) { this.setData({ storeIndex: Number(e.detail.value), selected: [] }); this.requestId = null; this.refresh(); },
  category(e) { this.setData({ category: e.currentTarget.dataset.name }); this.refresh(); },
  choose(e) { const id = e.currentTarget.dataset.id; const ids = this.data.selected.includes(id) ? this.data.selected.filter(x => x !== id) : this.data.selected.concat(id); this.setData({ selected: ids }); this.requestId = null; this.refresh(); },
  input(e) { this.setData({ ['form.' + e.currentTarget.dataset.key]: e.detail.value }); this.requestId = null; if(e.currentTarget.dataset.key==='startDate')this.refresh(); },
  days(e) { this.setData({ days: e.detail.value }); this.requestId = null; this.refresh(); },
  level(e) { const index = Number(e.detail.value); this.setData({ levelIndex: index, 'form.level': base.LEVELS[index] }); this.requestId = null; },
  consent(e) { this.setData({ 'form.consent': e.detail.value }); this.requestId = null; },
  async tab(e) {
    const tab = e.currentTarget.dataset.id; this.setData({ tab });
    if (tab === 'records') await this.records();
  },
  async records() {
    this.setData({ loading: true, error: '' });
    try {
      const data = await this.api('myRecords');
      this.setData({ records: data.reservations.slice().reverse().map(x => Object.assign({}, x, { amount: money(x.estimate), storeName: (this.data.stores.find(s => s.id === x.storeId) || {}).name || x.storeId })), recordCount:data.reservations.filter(x=>['待确认','已确认'].includes(x.status)).length, contracts: data.contracts.map(x => Object.assign({}, x, { amount: money(x.total), dueDate:presentation.dueDate(x), storeName:(this.data.stores.find(s=>s.id===x.storeId)||{}).name||'开单门店', activeCount:x.items.filter(i=>!i.returnAt).length })) });
    this.filterRecords();
    } catch (e) { this.setData({ error: message(e) }); }
    finally { this.setData({ loading: false }); }
  },
  async submit() {
    if (this.data.saving) return;
    if (!this.data.stores.length) return wx.showToast({title:'请先连接门店服务',icon:'none'});
    if (!Number.isInteger(Number(this.data.days)) || Number(this.data.days)<1 || Number(this.data.days)>30) return wx.showToast({title:'租期应为1至30天',icon:'none'});
    if (!this.data.form.name.trim() || !this.data.form.phone.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.data.form.email.trim())) return wx.showToast({title:'请填写姓名、电话及有效邮箱',icon:'none'});
    if (!this.data.selected.length) return wx.showToast({ title: '请先选择装备', icon: 'none' });
    if (!this.data.form.consent) return wx.showToast({ title: '请先确认资料用途', icon: 'none' });
    this.requestId = this.requestId || 'booking_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    this.setData({ saving: true });
    try {
      await this.api('reservationCreate', Object.assign({}, this.data.form, { days: Number(this.data.days), equipmentIds: this.data.selected, storeId: this.data.stores[this.data.storeIndex].id, requestId: this.requestId }));
      this.setData({ selected: [], tab: 'records', recordFilter:'全部' }); this.requestId = null; this.refresh(); await this.records();
      wx.showModal({ title: '预约已提交', content: '请等待门店确认。预约不锁定库存、不扣款，到店选配签约后才正式借出。', showCancel: false });
    } catch (e) { wx.showModal({ title: '提交未完成', content: message(e), showCancel: false }); }
    finally { this.setData({ saving: false }); }
  },
  cancel(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({ title: '取消预约', content: '确定取消这份待确认的预约？', success: async r => {
      if (!r.confirm) return;
      try { await this.api('reservationCancel', { id }); await this.records(); } catch (err) { wx.showModal({ title: '无法取消', content: err.message || err.errMsg, showCancel: false }); }
    } });
  }
});
