const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const auth=require('../cloudfunctions/bsrWebApi/auth');
const D=require('../miniprogram/utils/domain');
const C=require('../miniprogram/utils/customer-domain');
const storage=require('../cloudfunctions/bsrWebApi/storage');
function fixture(){
 let records=new Map();
 records.set('bsr_state/main',Object.assign({_id:'main'},D.seed()));
 records.set('bsr_web_users/manager',auth.newAccount('manager','Strong-test-pass-001!',{role:'manager',employeeId:'E01',name:'测试负责人'}));
 records.set('bsr_web_users/vendor',auth.newAccount('vendor','Strong-test-pass-001!',{role:'contractor',contractorId:'V01',name:'测试承包商'}));
 const copy=x=>JSON.parse(JSON.stringify(x));
 function collection(name){return{
  where(q){return{limit(){return{async get(){return{data:[...records].filter(([k,v])=>k.startsWith(name+'/')&&Object.entries(q).every(([field,value])=>v[field]===value)).map(([,v])=>copy(v))};}};}};},
  doc(id){const key=name+'/'+id;return{async get(){if(!records.has(key))throw Error('missing');return{data:copy(records.get(key))};},async set({data}){records.set(key,Object.assign({_id:id},copy(data)));},async update({data}){records.set(key,Object.assign({},records.get(key),copy(data)));},async remove(){records.delete(key);}};}
 };}
 const db={collection,async runTransaction(fn){const old=copy([...records]);try{return await fn({collection});}catch(e){records=new Map(old);throw e;}}};
 const sandbox={exports:{},require:name=>name==='wx-server-sdk'?{init(){},database:()=>db}:name==='crypto'?require('node:crypto'):name==='./auth'?auth:name==='./domain'?D:name==='./storage'?storage:C,process:{env:{}},Buffer,console:{error(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../cloudfunctions/bsrWebApi/index.js'),'utf8'),sandbox);
 async function call(action,payload={},token='',origin=''){const response=await sandbox.exports.main({httpMethod:'POST',headers:{authorization:token?'Bearer '+token:'',...(origin?{origin}:{})},body:JSON.stringify({action,payload,requestId:'web_test_request_0001'})});return{response,data:JSON.parse(response.body)};}
 return{call,records:()=>records};
}
test('密码采用随机盐和scrypt，校验不接受错误或缺失密码',()=>{const a=auth.newAccount('manager','Strong-test-pass-001!',{}),b=auth.newAccount('manager','Strong-test-pass-001!',{});assert.notEqual(a.passwordHash,b.passwordHash);assert.equal(auth.verifyPassword('Strong-test-pass-001!',a),true);assert.equal(auth.verifyPassword('wrong-pass',a),false);assert.equal(a.password,undefined);});
test('网页未登录不能读业务数据，伪造角色不会授权',async()=>{const f=fixture();const r=await f.call('load',{role:'manager'});assert.equal(r.data.ok,false);assert.match(r.data.message,/先登录/);});
test('网页登录→读取→退出，数据库中只保存会话令牌摘要',async()=>{const f=fixture();const login=await f.call('login',{username:'manager',password:'Strong-test-pass-001!'});assert.equal(login.data.ok,true);assert.equal(login.data.user.passwordHash,undefined);const token=login.data.token;assert.equal([...f.records().keys()].some(k=>k.includes(token)),false);const loaded=await f.call('load',{},token);assert.equal(loaded.data.state.equipment.length,5);await f.call('logout',{},token);assert.equal((await f.call('load',{},token)).data.ok,false);});
test('连续失败会锁定账号；正确密码也需等待锁定期',async()=>{const f=fixture();for(let i=0;i<5;i++)assert.equal((await f.call('login',{username:'manager',password:'wrong-pass-001'})).data.ok,false);assert.ok(f.records().get('bsr_web_users/manager').lockedUntil>Date.now());assert.equal((await f.call('login',{username:'manager',password:'Strong-test-pass-001!'})).data.ok,false);});
test('承包商登录后不获得客户或合同，不能通过前端role入库',async()=>{const f=fixture();const login=await f.call('login',{username:'vendor',password:'Strong-test-pass-001!'});const token=login.data.token;const loaded=await f.call('load',{},token);assert.deepEqual(loaded.data.state.contracts,[]);const create=await f.call('equipmentAdd',{role:'manager'},token);assert.equal(create.data.ok,false);assert.match(create.data.message,/无权/);});
test('修改密码后旧会话失效，未授权Origin被拒绝',async()=>{const f=fixture();const login=await f.call('login',{username:'manager',password:'Strong-test-pass-001!'});const token=login.data.token;assert.equal((await f.call('load',{},token,'https://other.example.com')).data.ok,false);assert.equal((await f.call('passwordChange',{oldPassword:'Strong-test-pass-001!',newPassword:'Changed-pass-001234!'},token)).data.ok,true);assert.equal((await f.call('load',{},token)).data.ok,false);assert.equal((await f.call('login',{username:'manager',password:'Changed-pass-001234!'})).data.ok,true);});

test('课堂简易密码至少8位，仍须验证原密码并撤销旧会话',async()=>{
 const f=fixture(),login=await f.call('login',{username:'manager',password:'Strong-test-pass-001!'}),token=login.data.token;
 assert.equal((await f.call('passwordChange',{oldPassword:'wrong',newPassword:'lesson12'},token)).data.ok,false);
 assert.equal((await f.call('passwordChange',{oldPassword:'Strong-test-pass-001!',newPassword:'1234567'},token)).data.ok,false);
 assert.equal((await f.call('passwordChange',{oldPassword:'Strong-test-pass-001!',newPassword:'lesson12'},token)).data.ok,true);
 assert.equal((await f.call('load',{},token)).data.ok,false);
 assert.equal((await f.call('login',{username:'manager',password:'lesson12'})).data.ok,true);
});
