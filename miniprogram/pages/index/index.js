const api = require('../../utils/service');
const domain = require('../../utils/domain');
const money = n => (n / 100).toFixed(2);
const timeText = value => value ? new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ') : '';
const roleLabels = { manager: '负责人', staff: '门店员工', contractor: '承包商' };
const tabs = [{ id: 'home', label: '工作台', icon: '◈' }, { id: 'equipment', label: '装备', icon: '◇' }, { id: 'contracts', label: '租赁', icon: '▤' }, { id: 'repairs', label: '维修', icon: '⌁' }, { id: 'manage', label: '管理', icon: '☷' }];
Page({
  data: { demo: api.config.demo, tab: 'home', tabs, loading: false, saving: false, error: '', state: null, storeId: 'east', storeIndex: 0, search: '', modal: null, form: {}, fields: [], selected: [], selectedTotal: '0.00', user: null },
  onLoad() { this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    try { const res = await api.call('load'); this.setData({ state: res.state, user: res.user, roleLabel: roleLabels[res.user.role] }); this.refresh(); }
    catch (e) { this.setData({ error: e.message }); }
    finally { this.setData({ loading: false }); }
  },
  refresh() {
    const s = this.data.state; if (!s) return;
    const storeName = value => (s.stores.find(x => x.id === value) || {}).name || '顾客持有';
    const keyword = this.data.search.trim().toLowerCase();
    const matches = x => !keyword || JSON.stringify(x).toLowerCase().includes(keyword);
    const equipment = s.equipment.map(e => Object.assign({}, e, { price: money(e.daily), homeName: storeName(e.home), locationName: storeName(e.location), available: e.status === '可租' && e.location === this.data.storeId })).filter(matches);
    const contracts = s.contracts.slice().reverse().map(c => Object.assign({}, c, { amount: money(c.total), employeeName: (s.employees.find(x => x.id === c.employeeId) || {}).name, items: c.items.map(l => Object.assign({}, l, { returnText: l.returnAt ? timeText(l.returnAt) + ' · ' + storeName(l.returnStore) : '使用中', rate: money(l.daily) })), changes: c.changes.map(x => Object.assign({}, x, { amount: money(x.delta) })) })).filter(matches);
    const repairs = s.repairs.slice().reverse().map(r => Object.assign({}, r, { equipmentName: (s.equipment.find(x => x.id === r.equipmentId) || {}).name, contractorName: (s.contractors.find(x => x.id === r.contractorId) || {}).name, costText: money(r.cost), rateText: money(r.hourly) })).filter(matches);
    const shifts = s.shifts.slice().sort((a, b) => b.date.localeCompare(a.date)).map(x => Object.assign({}, x, { name: (s.employees.find(e => e.id === x.employeeId) || {}).name, storeName: storeName(x.storeId) }));
    const revenue = s.contracts.reduce((sum, c) => sum + c.payments.reduce((n, p) => n + p.amount, 0), 0);
    this.setData({ equipment, contracts, repairs, shifts, stores: s.stores, storeName: storeName(this.data.storeId), customers: s.customers.filter(matches), employees: s.employees, contractors: s.contractors.map(v => Object.assign({}, v, { ratesText: v.rates.map(r => r.from + ' ¥' + money(r.hourly) + '/小时').join('；') })), audits: s.audit.slice(-12).reverse(), stats: { available: s.equipment.filter(x => x.status === '可租' && x.location === this.data.storeId).length, rented: s.equipment.filter(x => x.status === '租出').length, repairing: s.repairs.filter(x => x.status !== '已关闭').length, revenue: money(revenue), active: s.contracts.filter(x => x.status === '生效').length } });
  },
  tab(e) { this.setData({ tab: e.currentTarget.dataset.id, search: '' }); this.refresh(); },
  search(e) { this.setData({ search: e.detail.value }); this.refresh(); },
  store(e) { const i = Number(e.detail.value); this.setData({ storeIndex: i, storeId: this.data.stores[i].id }); this.refresh(); },
  switchRole() {
    if (!api.config.demo) return;
    wx.showActionSheet({ itemList: ['负责人', '门店员工', '维修承包商'], success: r => { wx.setStorageSync('bsr-demo-role', ['manager', 'staff', 'contractor'][r.tapIndex]); this.load(); } });
  },
  async identity() { try { const r = await api.call('identity'); wx.showModal({ title: '我的身份ID', content: r.openid, confirmText: '复制', success: x => { if (x.confirm) wx.setClipboardData({ data: r.openid }); } }); } catch (e) { this.alert(e.message); } },
  alert(content) { wx.showModal({ title: '操作提示', content: String(content), showCancel: false }); },
  input(e) { this.setData({ ['form.' + e.currentTarget.dataset.key]: e.detail.value }); },
  choose(e) {
    const key = e.currentTarget.dataset.key;
    const field = this.data.fields.find(x => x.key === key);
    const i = Number(e.detail.value);
    this.setData({ ['form.' + key]: field.options[i].value, fields: this.data.fields.map(x => x.key === key ? Object.assign({}, x, { chosen: field.options[i].label, index: i }) : x) });
  },
  toggle(e) { this.setData({ ['form.' + e.currentTarget.dataset.key]: e.detail.value }); },
  selectEquipment(e) {
    const eid = e.currentTarget.dataset.id; let ids = this.data.selected.slice();
    ids = ids.includes(eid) ? ids.filter(x => x !== eid) : ids.concat(eid);
    this.setData({ selected: ids, pickEquipment: this.data.pickEquipment.map(x => Object.assign({}, x, { selected: ids.includes(x.id) })) });
    this.quote();
  },
  quote() { const sum = this.data.state.equipment.filter(x => this.data.selected.includes(x.id)).reduce((n, x) => n + x.daily, 0); this.setData({ selectedTotal: money(sum) }); },
  close() { if (!this.data.saving) this.setData({ modal: null }); },
  noop() {},
  open(e) {
    const d = e.currentTarget.dataset; const type = d.type; const s = this.data.state;
    const text = (key, label, value = '', kind = 'text') => ({ key, label, value, kind });
    const pick = (key, label, rows, keyName = 'id', labelName = 'name') => ({ key, label, kind: 'pick', options: rows.map(x => typeof x === 'string' ? { value: x, label: x } : { value: x[keyName], label: x[labelName] }), chosen: '请选择' });
    const flag = (key, label) => ({ key, label, kind: 'switch', value: false });
    const stores = () => pick('storeId', '实物接收/操作门店', s.stores);
    let fields = [], title = '', form = {}, action = type;
    const note = () => text('note', '处理说明 / 检查记录');
    if (type === 'contractCreate') {
      title = '开立租赁合同';
      fields = [text('customerId', '回头客ID（新客户留空）'), text('name', '客户姓名'), text('email', '邮箱'), text('phone', '联系电话'), text('address', '家庭住址'), text('birthYear', '出生年份', '', 'number'), text('height', '身高(cm)', '', 'digit'), text('weight', '体重(kg)', '', 'digit'), text('shoeSize', '鞋码', '', 'digit'), pick('level', '本次技能等级', domain.LEVELS), text('days', '租赁天数（1至30）', '3', 'number'), text('bootSole', '雪靴底长(mm，租双板时必填)', '', 'number'), text('fitting', '专业适配与交付检查记录'), text('reference', '已核验的外部付款流水号'), flag('consent', '已向客户说明资料用途并取得同意'), flag('signed', '客户已核对并签署合同'), flag('checked', '专业人员已完成适配、调校与交付检查')];
      form.storeId = this.data.storeId;
    } else if (type === 'returnItem') { title = '登记单件归还'; fields = [stores()]; form = { contractId: d.contract, segmentId: d.segment }; }
    else if (type === 'exchangePrepare') {
      title = '接收旧件并准备换装';
      fields = [stores(), text('equipmentId', '新件库存编号（须已在接收门店）'), pick('reason', '换装原因', ['同档更换', '付费升级', '故障换装']), text('bootSole', '雪靴底长(mm，双板必填)', '', 'number'), text('fitting', '新件适配检查说明'), flag('checked', '已检查新件适配与交付条件')]; form = { contractId: d.contract, segmentId: d.segment };
    } else if (type === 'exchangeConfirm') { title = '确认换装结算并借出'; fields = [text('reference', '补收款凭据（差额为0可留空）')]; form = { contractId: d.contract, changeId: d.change }; }
    else if (type === 'exchangeCancel') { title = '取消本次换装'; fields = []; form = { contractId: d.contract, changeId: d.change }; }
    else if (type === 'equipmentInspect') { title = '整备检查放行'; fields = [note()]; form.equipmentId = d.id; }
    else if (type === 'repairCreate') { title = '申请维修'; fields = [text('equipmentId', '故障装备库存编号', d.id || ''), pick('contractorId', '分配承包商', s.contractors), text('description', '故障描述')]; }
    else if (type.startsWith('repair')) {
      title = ({ repairStart: '登记开工', repairComplete: '提交维修完成', repairAccept: '员工验收通过', repairReject: '验收不合格，返工' })[type];
      fields = type === 'repairComplete' ? [text('minutes', '本次工时(分钟，15的倍数)', '15', 'number'), note()] : type === 'repairAccept' ? [stores(), note()] : [note()]; form.repairId = d.id;
    } else if (type === 'equipmentAdd') {
      title = '装备入库'; fields = [text('id', '唯一库存编号'), text('name', '名称'), pick('category', '类别', ['滑雪板', '雪杖', '雪靴', '单板', '头盔', '护目镜']), text('spec', '规格 / 尺寸'), pick('level', '装备技能（配件可不选）', domain.LEVELS), text('daily', '日租金(元)', '', 'digit'), text('cost', '购入成本(元)', '', 'digit'), text('retail', '零售价(元)', '', 'digit'), text('purchased', '购入日期YYYY-MM-DD', domain.dayAt(new Date())), stores()];
    } else if (type === 'equipmentMove') { title = '登记调拨实物接收'; fields = [text('equipmentId', '装备库存编号', d.id || ''), stores(), flag('permanent', '同时永久变更归属门店'), note()]; }
    else if (type === 'employeeAdd' || type === 'contractorAdd') {
      title = type === 'employeeAdd' ? '新增员工资料' : '新增承包商';
      fields = [text('id', '唯一ID'), text('name', '姓名/名称'), text('phone', '电话'), text('email', '邮箱'), text('address', '地址')];
      if (type === 'employeeAdd') fields.push(text('notes', '员工备注'));
      else fields.push(text('from', '费率生效日YYYY-MM-DD', domain.dayAt(new Date())), text('hourly', '小时费率(元)', '', 'digit'));
    } else if (type === 'rateAdd') { title = '新增历史费率版本'; fields = [pick('contractorId', '承包商', s.contractors), text('from', '生效日期YYYY-MM-DD', domain.dayAt(new Date())), text('hourly', '小时费率(元)', '', 'digit')]; }
    else if (type === 'shiftAdd') { title = '安排员工班次'; fields = [pick('employeeId', '员工', s.employees), stores(), text('date', '日期YYYY-MM-DD', domain.dayAt(new Date())), text('start', '开始时间HH:mm', '08:00'), text('end', '结束时间HH:mm', '17:00')]; }
    fields.forEach(x => { if (!(x.key in form)) form[x.key] = x.value === undefined ? '' : x.value; });
    const rid = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 12);
    this.setData({ modal: { title, action, requestId: rid }, fields, form, selected: [], selectedTotal: '0.00', pickEquipment: s.equipment.filter(x => x.status === '可租' && x.location === this.data.storeId).map(x => Object.assign({}, x, { price: money(x.daily), selected: false })) });
  },
  async submit() {
    if (this.data.saving) return;
    const modal = this.data.modal; const payload = Object.assign({}, this.data.form);
    if (modal.action === 'contractCreate') payload.equipmentIds = this.data.selected;
    this.setData({ saving: true });
    try {
      const res = await api.call(modal.action, payload, modal.requestId);
      this.setData({ state: res.state, modal: null }); this.refresh(); wx.showToast({ title: '已保存', icon: 'success' });
    } catch (e) { this.alert(e.message || '请求失败，请保持表单并重试'); }
    finally { this.setData({ saving: false }); }
  },
  async initialize() {
    wx.showModal({ title: this.data.demo ? '重置演示数据' : '首次初始化', content: this.data.demo ? '将清空此设备上的演示合同和维修记录。是否继续？' : '仅创建首次教学数据；云端已有业务数据时会拒绝覆盖。', success: async r => {
      if (!r.confirm) return;
      try { const res = await api.call('initialize'); this.setData({ state: res.state }); this.refresh(); } catch (e) { this.alert(e.message); }
    } });
  }
});
