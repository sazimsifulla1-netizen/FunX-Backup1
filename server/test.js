'use strict';
const assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dbDir=fs.mkdtempSync(path.join(os.tmpdir(),'funx-e2e-'));
const port=19000+Math.floor(Math.random()*1000),secret='funx-admin-integration-test-secret-32';
const child=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,FUNX_ADMIN_SECRET:secret,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dbDir},stdio:['ignore','pipe','pipe']});
let completed=0;
async function api(route,{method='GET',data,token,adminKey}={}){let r=await fetch('http://127.0.0.1:'+port+route,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...(adminKey?{'x-admin-key':adminKey}:{})},body:data?JSON.stringify(data):undefined});return {status:r.status,body:await r.json()};}
function ok(cond,msg){assert.ok(cond,msg);completed++;}
(async()=>{try{
  for(let i=0;i<50;i++){try{await api('/health');break}catch(e){await new Promise(r=>setTimeout(r,100))}}
  let h=await api('/health');ok(h.status===200&&h.body.service==='FunX','health');
  const reg={name:'Alice',phone:'+8801700000001',password:'AlicePassword123'};
  let a=await api('/api/register',{method:'POST',data:reg});ok(a.status===201&&/^[A-Z2-9]{5}$/.test(a.body.user.code),'registration & ID');
  const alice=a.body.user,at=a.body.token;
  let duplicate=await api('/api/register',{method:'POST',data:reg});ok(duplicate.status===409,'duplicate prevention');
  let b=await api('/api/register',{method:'POST',data:{name:'Bob',phone:'+8801700000002',password:'BobPassword123'}});ok(b.status===201&&b.body.user.code!==alice.code,'unique ID');
  const bob=b.body.user,bt=b.body.token;
  let check=await api('/api/me',{token:at});ok(check.status===200&&check.body.user.name==='Alice','session');
  let sr=await api('/api/search?q='+bob.code,{token:at});ok(sr.status===200&&sr.body.users[0].id===bob.id,'search ID');
  let sp=await api('/api/search?q='+encodeURIComponent(bob.phone),{token:at});ok(sp.status===200&&sp.body.users[0].id===bob.id,'search phone');
  let bad=await api('/api/message',{method:'POST',token:at,data:{to:'nobody',text:'Hi'}});ok(bad.status===404,'invalid recipient rejected');
  let msg=await api('/api/message',{method:'POST',token:at,data:{to:bob.id,text:'Hello Bob'}});ok(msg.status===201&&!msg.body.message.read,'send message');
  let incoming=await api('/api/messages?peer='+alice.id,{token:bt});ok(incoming.status===200&&incoming.body.messages[0].text==='Hello Bob','receive message');
  await api('/api/typing',{method:'POST',token:bt,data:{peer:alice.id,typing:true}});
  let tt=await api('/api/messages?peer='+bob.id,{token:at});ok(tt.body.typing===true,'typing indicator');
  let read=await api('/api/read',{method:'POST',token:bt,data:{peer:alice.id}});ok(read.body.count===1,'read messages');
  let read2=await api('/api/messages?peer='+bob.id,{token:at});ok(read2.body.messages[0].read===true,'read receipt');
  let unshared=await api('/api/location',{method:'POST',token:at,data:{latitude:23.7,longitude:90.4,accuracy:5}});ok(unshared.status===403,'location rejected without consent');
  let consent=await api('/api/location-consent',{method:'POST',token:at,data:{enabled:true}});ok(consent.status===200&&consent.body.sharing,'consent enable');
  let shared=await api('/api/location',{method:'POST',token:at,data:{latitude:23.7,longitude:90.4,accuracy:5}});ok(shared.status===200,'location accepted after consent');
  let confbad=await api('/api/admin/config',{adminKey:'wrong'});ok(confbad.status===403,'admin protected');
  let conf=await api('/api/admin/config',{adminKey:secret});ok(conf.status===200&&conf.body.sharing===1,'admin location count');
  let stop=await api('/api/stop',{method:'POST',token:at,data:{}});ok(stop.status===200,'share stopped');
  let conf2=await api('/api/admin/config',{adminKey:secret});ok(conf2.body.sharing===0,'stopped location removed');
  let saveBot=await api('/api/admin/bot',{method:'POST',adminKey:secret,data:{action:'save',token:'1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcde12345',chatId:'123456789'}});
  ok(saveBot.status===200&&saveBot.body.configured,'save bot token');
  let botCheck=await api('/api/admin/config',{adminKey:secret});ok(botCheck.body.configured&&botCheck.body.chatId==='123456789','check saved bot');
  let reset=await api('/api/admin/bot',{method:'POST',adminKey:secret,data:{action:'delete'}});ok(reset.status===200&&!reset.body.configured,'bot config deletion');
  let status=await api('/api/statuses',{method:'POST',token:at,data:{text:'Test status'}});ok(status.status===201,'post status');
  let listing=await api('/api/statuses',{token:bt});ok(listing.body.statuses.some(x=>x.text==='Test status'),'read statuses');
  let login=await api('/api/login',{method:'POST',data:{phone:reg.phone,password:reg.password}});ok(login.status===200&&login.body.token!==at,'login');
  await api('/api/logout',{method:'POST',token:at,data:{}});let loggedOut=await api('/api/me',{token:at});ok(loggedOut.status===401,'logout token invalidated');
  ok(fs.existsSync(path.join(dbDir,'funx.json')),'persistent database');
  console.log(`PASS: ${completed} backend integration assertions`);
}catch(e){console.error('FAILED',e.stack);process.exitCode=1;}finally{child.kill('SIGTERM');fs.rmSync(dbDir,{recursive:true,force:true});}})();
