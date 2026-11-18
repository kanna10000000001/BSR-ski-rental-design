const test=require('node:test');
const assert=require('node:assert/strict');
require('../miniprogram/config').demo=true;
const saved=new Map();let definition;
global.wx={getStorageSync:k=>saved.get(k),setStorageSync:(k,v)=>saved.set(k,JSON.parse(JSON.stringify(v))),showToast(){},showModal(){}};
global.Page=value=>{definition=value;};
require('../miniprogram/pages/customer/index');
function page(){const p=Object.assign({},definition,{data:JSON.parse(JSON.stringify(definition.data))});p.setData=patch=>{for(const[key,value]of Object.entries(patch)){const parts=key.split('.');let obj=p.data;for(const part of parts.slice(0,-1))obj=obj[part];obj[parts.at(-1)]=value;}};return p;}
test('顾客小程序页面加载→选装备→提交预约→显示本人记录',async()=>{
 saved.clear();const p=page();await p.load();assert.equal(p.data.equipment.length,3);
 p.choose({currentTarget:{dataset:{id:'3828'}}});assert.equal(p.data.total,'600.00');
 for(const[key,value]of Object.entries({name:'虚构顾客',email:'mini@example.com',phone:'虚构电话'}))p.input({currentTarget:{dataset:{key}},detail:{value}});
 p.consent({detail:{value:true}});await p.submit();
 assert.equal(p.data.tab,'records');assert.equal(p.data.records.length,1);assert.equal(p.data.records[0].status,'待确认');
 assert.equal(saved.get('bsr-demo-v1').equipment[0].status,'可租');
});

test('小程序搜索不丢清单，租期更新预计归还，移除装备同步合计',async()=>{
 saved.clear();const p=page();await p.load();
 p.choose({currentTarget:{dataset:{id:'3828'}}});
 p.search({detail:{value:'不存在的型号'}});assert.equal(p.data.equipment.length,0);assert.equal(p.data.basket.length,1);
 p.input({currentTarget:{dataset:{key:'startDate'}},detail:{value:'2028-02-28'}});
 p.days({detail:{value:'3'}});assert.equal(p.data.returnDate,'2028-03-01');
 p.choose({currentTarget:{dataset:{id:'3828'}}});assert.equal(p.data.total,'0.00');assert.equal(p.data.basket.length,0);
});

test('预约状态筛选不影响已关联合同列表，切换门店清空跨店清单',async()=>{
 saved.clear();const p=page();await p.load();
 p.setData({records:[{id:'B1',status:'待确认'},{id:'B2',status:'已取消'}],contracts:[{id:'R1'}]});
 p.recordFilter({currentTarget:{dataset:{name:'待确认'}}});assert.deepEqual(p.data.visibleRecords.map(x=>x.id),['B1']);assert.equal(p.data.contracts.length,1);
 p.choose({currentTarget:{dataset:{id:'3828'}}});p.store({detail:{value:'1'}});
 assert.equal(p.data.selected.length,0);assert.equal(p.data.basket.length,0);assert.equal(p.data.storeName,'西门店');
});

test('切换云端与演示时清空旧资料和清单，不串用两套记录',async()=>{
 saved.clear();const p=page();await p.load();
 p.choose({currentTarget:{dataset:{id:'3828'}}});p.setData({'form.name':'上一模式顾客',records:[{id:'OLD'}],contracts:[{id:'OLD-R'}]});
 // 用公开目录模拟云端响应，不发起外部请求。
 const catalog=p.catalog;p.api=async action=>{assert.equal(action,'catalog');return catalog;};
 await p.switchMode({currentTarget:{dataset:{demo:'false'}}});
 assert.equal(p.data.demo,false);assert.equal(p.data.form.name,'');assert.equal(p.data.selected.length,0);assert.equal(p.data.records.length,0);assert.equal(p.data.contracts.length,0);
 await p.switchMode({currentTarget:{dataset:{demo:'true'}}});assert.equal(p.data.demo,true);assert.equal(p.data.basket.length,0);
});
