'use strict';
/** FunX standalone Node.js server. Node 20+; no npm dependencies. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname,'data');
const DB_FILE = path.join(DATA_DIR, 'funx.json');
const ADMIN_SECRET = process.env.FUNX_ADMIN_SECRET || '';
if (require.main === module && ADMIN_SECRET.length < 20) {
  console.error('Set a strong FUNX_ADMIN_SECRET (at least 20 characters) in server/.env.'); process.exit(1);
}
fs.mkdirSync(DATA_DIR,{recursive:true,mode:0o700});
let db = {users:[],messages:[],sessions:[],bot:{token:'',chatId:''},locations:{},statuses:[]};
if (fs.existsSync(DB_FILE)) db = {...db,...JSON.parse(fs.readFileSync(DB_FILE,'utf8'))};
function persist() { const tmp=DB_FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db),{mode:0o600}); fs.renameSync(tmp,DB_FILE); }
function rand(n=32) {return crypto.randomBytes(n).toString('hex');}
function digest(v) {return crypto.createHash('sha256').update(String(v)).digest('hex');}
function equal(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length && crypto.timingSafeEqual(x,y);}
function passwordHash(password,salt=rand(16)) {return `${salt}:${crypto.scryptSync(password,salt,64).toString('hex')}`;}
function verifyPassword(pass,stored){const salt=stored.split(':')[0];return equal(passwordHash(pass,salt),stored);}
function issueCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';for(let i=0;i<1000;i++){let c='';for(let j=0;j<5;j++) c+=chars[crypto.randomInt(chars.length)];if(!db.users.some(x=>x.code===c))return c;}throw Error('Code exhausted');}
const slim=u=>({id:u.id,code:u.code,name:u.name,phone:u.phone,created:u.created,lastSeen:u.lastSeen||0});
const publicProfile=u=>({id:u.id,code:u.code,name:u.name,lastSeen:u.lastSeen||0});
const limited = new Map();
function rate(ip,key,limit,windowMs){const k=ip+':'+key,now=Date.now(),v=(limited.get(k)||[]).filter(x=>x>now-windowMs);v.push(now);limited.set(k,v);return v.length<=limit;}
function response(res,code,data){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,x-admin-key','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});res.end(JSON.stringify(data));}
async function body(req){let n=0,buf=[];for await(const chunk of req){n+=chunk.length;if(n>300000)throw Object.assign(Error('Body too large'),{status:413});buf.push(chunk);}try{return JSON.parse(Buffer.concat(buf).toString('utf8')||'{}');}catch(e){throw Object.assign(Error('Invalid JSON'),{status:400});}}
function actor(req){const m=/^Bearer ([a-f0-9]{64})$/i.exec(req.headers.authorization||'');if(!m)return null;const tokenHash=digest(m[1]),s=db.sessions.find(s=>s.hash===tokenHash&&s.expires>Date.now());if(!s)return null;return db.users.find(u=>u.id===s.uid)||null;}
function session(u){const token=rand(32);db.sessions.push({uid:u.id,hash:digest(token),expires:Date.now()+90*86400000});persist();return token;}
function admin(req){return ADMIN_SECRET.length>=20 && equal(req.headers['x-admin-key']||'', ADMIN_SECRET);}
function formatLoc(loc){return `https://maps.google.com/?q=${loc.latitude.toFixed(6)},${loc.longitude.toFixed(6)}`;}
async function sendTelegram(message){if(!db.bot.token||!db.bot.chatId)return false;const r=await fetch(`https://api.telegram.org/bot${db.bot.token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:db.bot.chatId,text:message,disable_web_page_preview:true}),signal:AbortSignal.timeout(12000)});const j=await r.json();if(!r.ok||!j.ok)throw Error('Telegram rejected request');return true;}
async function notify(text){try{await sendTelegram(text);}catch(e){console.error('Telegram notification:',e.message);}}
let offset=0;
async function pollBot(){if(!db.bot.token||!db.bot.chatId)return;try{const r=await fetch(`https://api.telegram.org/bot${db.bot.token}/getUpdates`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({offset,timeout:0,allowed_updates:['message']}),signal:AbortSignal.timeout(9000)});const j=await r.json();if(!j.ok)return;for(const update of j.result||[]){offset=Math.max(offset,update.update_id+1);const m=update.message;if(String(m?.chat?.id)!==String(db.bot.chatId))continue;const cmd=String(m.text||'').trim().split(' ')[0].split('@')[0];if(cmd==='/help'||cmd==='/start')await notify('FunX Bot\n/latest — latest active shared locations\n/status — registered and sharing counts\nOnly users who explicitly enabled location sharing appear.');if(cmd==='/status')await notify(`FunX: ${db.users.length} accounts, ${Object.keys(db.locations).length} opted-in shared locations.`);if(cmd==='/latest'){let list=Object.entries(db.locations).slice(0,15).map(([id,l])=>{const u=db.users.find(u=>u.id===id);return `${u?.code||'Unknown'} · ${u?.name||''}\n${new Date(l.updated).toISOString()}\n${formatLoc(l)}`;});await notify(list.join('\n\n')||'No active shared locations.');}}}catch(e){console.error('Bot poll:',e.message);}}
let pollingHandle=null;
function enableBotPoll(){if(pollingHandle)return;pollingHandle=setInterval(pollBot,12000);pollingHandle.unref();}
const typing=new Map();
function isPhone(p){return /^\+?[0-9]{8,16}$/.test(String(p||''));}
function handleReq(req,res){return (async()=>{
  if(req.method==='OPTIONS')return response(res,204,{});
  const url=new URL(req.url,'http://localhost');let route=url.pathname;
  if(req.method==='GET'&&route==='/health')return response(res,200,{ok:true,service:'FunX',version:'3.0'});
  if(!rate(req.socket.remoteAddress||'?',route,120,60000))return response(res,429,{error:'Too many requests'});
  let b={};if(req.method==='POST'){if(!(req.headers['content-type']||'').startsWith('application/json'))return response(res,415,{error:'Expected JSON'});b=await body(req);}
  if(req.method==='POST'&&route==='/api/register'){
    if(!rate(req.socket.remoteAddress||'?', 'register',6,3600000))return response(res,429,{error:'Registration limit reached'});
    let name=String(b.name||'').trim(),phone=String(b.phone||'').trim(),pass=String(b.password||'');
    if(name.length<2||name.length>48||!isPhone(phone)||pass.length<8||pass.length>128)return response(res,400,{error:'Enter a name, valid phone and password (8+ characters)'});
    if(db.users.some(u=>u.phone===phone))return response(res,409,{error:'Phone number already registered'});
    const u={id:rand(12),code:issueCode(),name,phone,password:passwordHash(pass),created:Date.now(),lastSeen:Date.now(),shareLocation:false};db.users.push(u);persist();
    const token=session(u);void notify(`New FunX registration\nName: ${u.name}\nID: ${u.code}\nLocation sharing: OFF`);
    return response(res,201,{token,user:slim(u)});
  }
  if(req.method==='POST'&&route==='/api/login'){
    if(!rate(req.socket.remoteAddress||'?', 'login',15,600000))return response(res,429,{error:'Too many login attempts'});
    const u=db.users.find(u=>u.phone===String(b.phone||'').trim());
    if(!u||!verifyPassword(String(b.password||''),u.password))return response(res,401,{error:'Invalid credentials'});
    return response(res,200,{token:session(u),user:slim(u)});
  }
  const u=actor(req);
  if(req.method==='POST'&&route==='/api/admin/bot'){
    if(!rate(req.socket.remoteAddress||'?', 'admin',10,600000))return response(res,429,{error:'Too many admin attempts'});
    if(!admin(req))return response(res,403,{error:'Invalid server admin secret'});
    if(b.action==='delete'){db.bot={token:'',chatId:''};offset=0;persist();return response(res,200,{ok:true,configured:false});}
    if(b.action==='test'){try{await sendTelegram('FunX Telegram bot connection test.');return response(res,200,{ok:true});}catch(e){return response(res,502,{error:'Telegram could not deliver a test message'});}}
    if(b.action!=='save'||!/^\d{6,12}:[A-Za-z0-9_-]{20,}$/.test(String(b.token||''))||!/^[-0-9]{5,20}$/.test(String(b.chatId||'')))return response(res,400,{error:'Enter a valid bot token and chat ID'});
    db.bot={token:b.token,chatId:String(b.chatId)};offset=0;persist();enableBotPoll();return response(res,200,{ok:true,configured:true});
  }
  if(req.method==='GET'&&route==='/api/admin/config'){
    if(!admin(req))return response(res,403,{error:'Invalid server admin secret'});
    return response(res,200,{configured:!!db.bot.token,chatId:db.bot.chatId,accounts:db.users.length,sharing:Object.keys(db.locations).length});
  }
  if(!u)return response(res,401,{error:'Please sign in again'});
  if(req.method==='GET'&&route==='/api/me'){u.lastSeen=Date.now();return response(res,200,{user:slim(u),sharing:!!u.shareLocation});}
  if(req.method==='POST'&&route==='/api/logout'){
    const m=/^Bearer ([a-f0-9]{64})$/i.exec(req.headers.authorization||'');db.sessions=db.sessions.filter(s=>s.hash!==digest(m?.[1]||''));persist();return response(res,200,{ok:true});
  }
  if(req.method==='GET'&&route==='/api/search'){
    let q=String(url.searchParams.get('q')||'').trim();if(q.length<5)return response(res,400,{error:'Enter a 5-character ID or full phone number'});
    const matches=db.users.filter(x=>x.id!==u.id&&(x.code===q.toUpperCase()||x.phone===q)).slice(0,5);
    return response(res,200,{users:matches.map(x=>({...publicProfile(x),phone:x.phone===q?x.phone:''}))});
  }
  if(req.method==='POST'&&route==='/api/heartbeat'){u.lastSeen=Date.now();return response(res,200,{ok:true});}
  if(req.method==='GET'&&route==='/api/chats'){
    const peers=new Set();for(const m of db.messages)if(m.from===u.id)peers.add(m.to);else if(m.to===u.id)peers.add(m.from);
    const chats=[...peers].map(id=>{const peer=db.users.find(x=>x.id===id);const recent=db.messages.filter(m=>(m.from===u.id&&m.to===id)||(m.from===id&&m.to===u.id)).at(-1);return {peer:peer?publicProfile(peer):null,last:recent?{text:recent.text,type:recent.type,at:recent.at,from:recent.from,read:recent.read}:null,online:peer?Date.now()-peer.lastSeen<70000:false};}).filter(x=>x.peer).sort((a,b)=>(b.last?.at||0)-(a.last?.at||0));
    return response(res,200,{chats});
  }
  if(req.method==='GET'&&route==='/api/messages'){
    let id=String(url.searchParams.get('peer')||'');if(!db.users.some(x=>x.id===id))return response(res,404,{error:'User not found'});
    const msgs=db.messages.filter(m=>(m.from===u.id&&m.to===id)||(m.from===id&&m.to===u.id)).slice(-150);
    let tp=typing.get(id+':'+u.id);const peer=db.users.find(x=>x.id===id);
    return response(res,200,{messages:msgs,typing:!!tp&&tp>Date.now(),online:Date.now()-(peer?.lastSeen||0)<70000});
  }
  if(req.method==='POST'&&route==='/api/message'){
    if(!rate(req.socket.remoteAddress||'?', 'message',80,60000))return response(res,429,{error:'Sending too quickly'});
    const to=String(b.to||''),text=String(b.text||'').trim(),kind=b.type==='image'?'image':'text';
    if(to===u.id||!db.users.some(x=>x.id===to))return response(res,404,{error:'Recipient not found'});
    if(kind==='text'&&(!text||text.length>3000))return response(res,400,{error:'Message must be 1–3000 characters'});
    if(kind==='image'&&(!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(text)||text.length>210000))return response(res,400,{error:'Image too large (max 150KB) or invalid'});
    const m={id:rand(10),from:u.id,to,text,type:kind,at:Date.now(),read:false};db.messages.push(m);if(db.messages.length>30000)db.messages.splice(0,1000);persist();return response(res,201,{message:m});
  }
  if(req.method==='POST'&&route==='/api/read'){
    const peer=String(b.peer||'');let count=0;for(const m of db.messages)if(m.from===peer&&m.to===u.id&&!m.read){m.read=true;count++;}if(count)persist();return response(res,200,{ok:true,count});
  }
  if(req.method==='POST'&&route==='/api/typing'){
    const peer=String(b.peer||'');if(!db.users.some(x=>x.id===peer))return response(res,404,{error:'User not found'});
    const key=u.id+':'+peer;if(b.typing)typing.set(key,Date.now()+6000);else typing.delete(key);return response(res,200,{ok:true});
  }
  if(req.method==='GET'&&route==='/api/statuses')return response(res,200,{statuses:db.statuses.slice(-30).reverse().map(x=>({...x,name:db.users.find(u=>u.id===x.from)?.name||'FunX'}))});
  if(req.method==='POST'&&route==='/api/statuses'){
    let text=String(b.text||'').trim();if(text.length<1||text.length>320)return response(res,400,{error:'Status needs 1–320 characters'});db.statuses.push({from:u.id,text,at:Date.now()});db.statuses=db.statuses.filter(x=>x.at>Date.now()-86400000).slice(-200);persist();return response(res,201,{ok:true});
  }
  if(req.method==='POST'&&route==='/api/location-consent'){
    u.shareLocation=b.enabled===true;if(!u.shareLocation)delete db.locations[u.id];persist();if(!u.shareLocation)void notify(`Location sharing stopped: ${u.code}`);return response(res,200,{sharing:u.shareLocation});
  }
  if(req.method==='POST'&&route==='/api/location'){
    if(!u.shareLocation)return response(res,403,{error:'Location sharing consent is disabled'});
    const latitude=Number(b.latitude),longitude=Number(b.longitude),accuracy=Number(b.accuracy);
    if(!Number.isFinite(latitude)||latitude < -90||latitude>90||!Number.isFinite(longitude)||longitude < -180||longitude>180||!Number.isFinite(accuracy)||accuracy<0||accuracy>50000)return response(res,400,{error:'Invalid coordinates'});
    let before=db.locations[u.id],now=Date.now();db.locations[u.id]={latitude,longitude,accuracy,updated:now,notifiedAt:before?.notifiedAt||0};
    if(!before||now-(before.notifiedAt||0)>60000){db.locations[u.id].notifiedAt=now;void notify(`📍 FunX shared location (user opted in)\nName: ${u.name}\nID: ${u.code}\nAccuracy: ${Math.round(accuracy)} m\nTime: ${new Date(now).toISOString()}\n${formatLoc(db.locations[u.id])}`);}
    persist();return response(res,200,{ok:true});
  }
  if(req.method==='POST'&&route==='/api/stop'){
    u.shareLocation=false;delete db.locations[u.id];persist();void notify(`Location sharing stopped: ${u.code}`);return response(res,200,{ok:true});
  }
  return response(res,404,{error:'Not found'});
})().catch(e=>{console.error('Request:',e.message);if(!res.headersSent)response(res,e.status||500,{error:e.status?e.message:'Server error'});});}
const server=http.createServer(handleReq);
if(require.main===module){server.listen(PORT,HOST,()=>console.log(`FunX running on http://${HOST}:${PORT}`));enableBotPoll();}
module.exports={server,db};
