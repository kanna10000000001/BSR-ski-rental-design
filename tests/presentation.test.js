const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../miniprogram/utils/presentation');
const D=require('../miniprogram/utils/domain');
test('预计归还含起租当天，跨月/闰年/上海时区一致，坏日期不制造提醒',()=>{
  assert.equal(P.dueDate({startDate:'2028-02-28',days:3}),'2028-03-01');
  assert.equal(P.dueDate({startDate:'2026-10-26',days:1}),'2026-10-26');
  assert.equal(P.dueDate({createdAt:'2026-10-25T17:00:00Z',days:2}),'2026-10-27');
  assert.equal(P.dueDate({startDate:'2026-02-30',days:3}),'');
  assert.equal(P.dueDate({startDate:'2026-10-26',days:0}),'');
});
test('门店装备范围跟随实物；租出按借出门店，跨店归还后跟随接收门店',()=>{
  const s=D.seed();s.equipment[0].status='租出';s.equipment[0].location='';
  s.contracts.push({id:'R1',storeId:'west',items:[{equipmentId:'3828',outStore:'west',returnAt:''}]});
  assert.equal(P.inStore(s,'equipment',s.equipment[0],'west'),true);
  assert.equal(P.inStore(s,'equipment',s.equipment[0],'east'),false);
  s.contracts[0].items[0].returnAt='2026-10-26';s.equipment[0].location='east';
  assert.equal(P.inStore(s,'equipment',s.equipment[0],'east'),true);
  assert.equal(s.equipment[0].home,'east');
});
test('组合筛选和分页不漏状态/门店/日期，缩小结果后夹紧页码',()=>{
  const s=D.seed(), rows=Array.from({length:25},(_,i)=>({id:String(i),name:'教学预约',status:'待确认',storeId:i%2?'west':'east',startDate:'2026-10-26'}));
  const result=P.filterRows(s,'bookings',rows,{store:'east',status:'待确认',from:'2026-10-26',to:'2026-10-26',query:'教学'});
  assert.equal(result.length,13);assert.equal(P.paginate(result,2).rows.length,3);
  assert.equal(P.paginate(result.slice(0,2),3).page,1);
  assert.equal(P.filterRows(s,'bookings',rows,{from:'2026-10-27'}).length,0);
});
test('日历仅包含活动预约与尚未归还的合同，不误报已取消或全部归还',()=>{
  const s=D.seed();s.reservations=[{id:'B1',storeId:'east',name:'A',startDate:'2026-10-26',status:'已确认',items:[{}]},{id:'B2',storeId:'east',startDate:'2026-10-26',status:'已取消',items:[]}];
  s.contracts=[{id:'R1',storeId:'west',customerName:'B',startDate:'2026-10-25',days:2,items:[{returnAt:''}]},{id:'R2',storeId:'east',startDate:'2026-10-25',days:2,items:[{returnAt:'2026-10-25'}]}];
  assert.deepEqual(P.events(s).map(x=>x.id),['B1','R1']);
  assert.deepEqual(P.events(s,'east').map(x=>x.id),['B1']);
});
