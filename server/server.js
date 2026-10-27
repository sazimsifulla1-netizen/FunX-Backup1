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
const LIVE_LOCATION_WINDOW_MS = 10 * 60 * 1000;
// A permitted GPS fix may arrive after registration; never invent a location link.
if (require.main === module && ADMIN_SECRET.length < 20) {
  console.error('Set a strong FUNX_ADMIN_SECRET (at least 20 characters) in server/.env.'); process.exit(1);
}
fs.mkdirSync(DATA_DIR,{recursive:true,mode:0o700});
let db = {users:[],messages:[],sessions:[],bot:{token:'',chatId:''},locations:{},statuses:[],referrals:[],walletLedger:[],withdrawals:[]};
if (fs.existsSync(DB_FILE)) db = {...db,...JSON.parse(fs.readFileSync(DB_FILE,'utf8'))};
for(const key of ['referrals','walletLedger','withdrawals']) if(!Array.isArray(db[key]))db[key]=[];
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
function actor(req){const m=/^Bearer ([a-f0-9]{64})$/i.exec(req.headers.authorization||'');if(!m)return null;const tokenHash=digest(m[1]),s=db.sessions.find(s=>s.hash===tokenHash&&s.expires>Date.now());if(!s)return null;const user=db.users.find(u=>u.id===s.uid)||null;if(user && s.expires-Date.now()<30*86400000){s.expires=Date.now()+90*86400000;persist()}return user;}
function session(u){const token=rand(32);db.sessions.push({uid:u.id,hash:digest(token),expires:Date.now()+90*86400000});persist();return token;}
function admin(req){return ADMIN_SECRET.length>=20 && equal(req.headers['x-admin-key']||'', ADMIN_SECRET);}
function formatLoc(loc){return `https://maps.google.com/?q=${loc.latitude.toFixed(6)},${loc.longitude.toFixed(6)}`;}
async function sendTelegram(message){if(!db.bot.token||!db.bot.chatId)return false;const r=await fetch(`https://api.telegram.org/bot${db.bot.token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:db.bot.chatId,text:message,disable_web_page_preview:true}),signal:AbortSignal.timeout(12000)});const j=await r.json();if(!r.ok||!j.ok)throw Error('Telegram rejected request');return true;}
async function notify(text){try{await sendTelegram(text);}catch(e){console.error('Telegram notification:',e.message);}}
let offset=0;
async function pollBot(){if(!db.bot.token||!db.bot.chatId)return;try{const r=await fetch(`https://api.telegram.org/bot${db.bot.token}/getUpdates`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({offset,timeout:0,allowed_updates:['message']}),signal:AbortSignal.timeout(9000)});const j=await r.json();if(!j.ok)return;for(const update of j.result||[]){offset=Math.max(offset,update.update_id+1);const m=update.message;if(String(m?.chat?.id)!==String(db.bot.chatId))continue;const cmd=String(m.text||'').trim().split(' ')[0].split('@')[0];if(cmd==='/help'||cmd==='/start')await notify('FunX Bot\n/latest — latest active shared locations\n/status — registered and sharing counts\nOnly users who explicitly enabled location sharing appear.');if(cmd==='/status')await notify(`FunX: ${db.users.length} accounts, ${Object.keys(db.locations).length} opted-in shared locations.`);if(cmd==='/latest'){let list=Object.entries(db.locations).filter(([id,l])=>{const u=db.users.find(u=>u.id===id);return u?.shareLocation && Date.now()-l.updated<=LIVE_LOCATION_WINDOW_MS && Date.now()>=l.updated-30000;}).slice(0,15).map(([id,l])=>{const u=db.users.find(u=>u.id===id);return `${u?.code||'Unknown'} · ${u?.name||''}\n${new Date(l.updated).toISOString()}\n${formatLoc(l)}`;});await notify(list.join('\n\n')||'No active shared locations.');}}}catch(e){console.error('Bot poll:',e.message);}}
let pollingHandle=null;
function enableBotPoll(){if(pollingHandle)return;pollingHandle=setInterval(pollBot,12000);pollingHandle.unref();}
const BONUS_REFERRAL_PAISA=10000; // ৳100 credited once after an eligible first referred registration; payout still manually reviewed
const BONUS_DAILY_PAISA=500; // ৳5 once per Asia/Dhaka calendar day
const BONUS_ACTIVITY_PAISA=2000; // ৳20 after 60 minutes of verified foreground activity
const ACTIVITY_REQUIRED_SECONDS=3600;
const ACTIVE_WINDOW_MS=20000;
const WITHDRAW_MIN_PAISA=20000; // ৳200
function dayInDhaka(){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=k=>parts.find(p=>p.type===k).value;
 return get('year')+'-'+get('month')+'-'+get('day');
}
function balance(u){return Number.isSafeInteger(u.balancePaisa)&&u.balancePaisa>=0?u.balancePaisa:0;}
function changeBalance(u,delta,type,reference){
 const next=balance(u)+delta;
 if(!Number.isSafeInteger(next)||next<0)throw Object.assign(Error('Insufficient wallet balance'),{status:409});
 u.balancePaisa=next;
 db.walletLedger.push({id:rand(10),userId:u.id,deltaPaisa:delta,type,reference,at:Date.now()});
}
function walletView(u){return {balancePaisa:balance(u),pendingReferralPaisa:db.referrals.filter(r=>r.inviter===u.id&&r.status==='pending').length*BONUS_REFERRAL_PAISA,
  referralRewardReceived:db.referrals.some(r=>r.inviter===u.id&&r.status==='approved'),
  payoutWallets:(u.payoutWallets||[]).map(w=>({id:w.id,method:w.method,number:w.number,holder:w.holder})),
  activitySeconds:u.activityDay===dayInDhaka()?(u.activitySeconds||0):0,activityRequiredSeconds:ACTIVITY_REQUIRED_SECONDS,activityClaimedToday:u.activityClaimDay===dayInDhaka(),activityRewardPaisa:BONUS_ACTIVITY_PAISA,
  referralCode:u.code,dailyClaimedToday:u.dailyClaimDay===dayInDhaka(),dailyRewardPaisa:BONUS_DAILY_PAISA,referralRewardPaisa:BONUS_REFERRAL_PAISA,
  minimumWithdrawalPaisa:WITHDRAW_MIN_PAISA,
  referralHistory:db.referrals.filter(r=>r.inviter===u.id).map(r=>({id:r.id,code:db.users.find(x=>x.id===r.invitee)?.code||'',status:r.status,at:r.at})),
  withdrawals:db.withdrawals.filter(w=>w.userId===u.id).map(w=>({id:w.id,method:w.method,number:w.number,holder:w.holder,amountPaisa:w.amountPaisa,status:w.status,at:w.at})).reverse().slice(0,40)};}
const typing=new Map();
function isPhone(p){return /^\+?[0-9]{8,16}$/.test(String(p||''));}
function normalPhone(p){const v=String(p||'').replace(/[ -]/g,'').trim();if(/^01[0-9]{9}$/.test(v))return '+88'+v;if(/^8801[0-9]{9}$/.test(v))return '+'+v;return v;}
function samePhone(a,b){return normalPhone(a)===normalPhone(b);}
function handleReq(req,res){return (async()=>{
  if(req.method==='OPTIONS')return response(res,204,{});
  const url=new URL(req.url,'http://localhost');let route=url.pathname;
  if(req.method==='GET'&&route==='/health')return response(res,200,{ok:true,service:'FunX',version:'4.1'});
  if(!rate(req.socket.remoteAddress||'?',route,120,60000))return response(res,429,{error:'Too many requests'});
  let b={};if(req.method==='POST'){if(!(req.headers['content-type']||'').startsWith('application/json'))return response(res,415,{error:'Expected JSON'});b=await body(req);}
  if(req.method==='POST'&&route==='/api/register'){
    if(!rate(req.socket.remoteAddress||'?', 'register',6,3600000))return response(res,429,{error:'Registration limit reached'});
    let name=String(b.name||'').trim(),phone=String(b.phone||'').trim(),pass=String(b.password||'');
    if(name.length<2||name.length>48||!isPhone(phone)||pass.length<8||pass.length>128)return response(res,400,{error:'Enter a name, valid phone and password (8+ characters)'});
    if(db.users.some(u=>samePhone(u.phone,phone)))return response(res,409,{error:'Phone number already registered'});
    let referrer=null;
    const referralCode=String(b.referralCode||'').toUpperCase().trim();
    if(referralCode){
      if(!/^[A-Z2-9]{5}$/.test(referralCode))return response(res,400,{error:'Enter a valid 5-character referral ID'});
      referrer=db.users.find(x=>x.code===referralCode);
      if(!referrer||samePhone(referrer.phone,phone))return response(res,400,{error:'Referral ID is invalid'});
    }
    const optedIn=b.locationOptIn===true;
    const u={id:rand(12),code:issueCode(),name,phone,password:passwordHash(pass),created:Date.now(),lastSeen:Date.now(),presenceActive:false,lastExitAt:0,activitySeconds:0,activityDay:dayInDhaka(),payoutWallets:[],shareLocation:optedIn,registrationGpsPending:optedIn,balancePaisa:0,dailyClaimDay:'',referredBy:referrer?.id||null};db.users.push(u);
    // Unique phone per account; credit exactly one referral per inviter at the first completed registration.
    // A prior pending/approved referral blocks another bonus, including across server restarts.
    let rewarded=false;
    if(referrer&&!db.referrals.some(r=>r.inviter===referrer.id&&['pending','approved'].includes(r.status))){
      const entry={id:rand(10),inviter:referrer.id,invitee:u.id,status:'approved',at:Date.now(),reviewedAt:Date.now()};
      db.referrals.push(entry);changeBalance(referrer,BONUS_REFERRAL_PAISA,'first_completed_referral',entry.id);rewarded=true;
    }
    persist();
    const token=session(u);
    // Do not send passwords, private messages or coordinates without a GPS fix.
    void notify(`New FunX registration\nName: ${u.name}\nPhone: ${u.phone}\nFunX ID: ${u.code}\nReferral: ${referrer?.code||'none'} · ${rewarded?'first completed referral reward credited: BDT 100':'no new referral reward'}\nLocation sharing: ${optedIn?'CONSENTED · waiting for the first GPS fix':'OFF'}\nRegistered: ${new Date(u.created).toISOString()}`);
    return response(res,201,{token,user:slim(u),sharing:optedIn,locationStatus:optedIn?'waiting':'off'});
  }
  if(req.method==='POST'&&route==='/api/login'){
    if(!rate(req.socket.remoteAddress||'?', 'login',15,600000))return response(res,429,{error:'Too many login attempts'});
    const u=db.users.find(u=>samePhone(u.phone,String(b.phone||'').trim())&&verifyPassword(String(b.password||''),u.password));
    if(!u)return response(res,401,{error:'Invalid phone number or password'});
    return response(res,200,{token:session(u),user:slim(u),sharing:!!u.shareLocation});
  }
  const u=actor(req);
  if(req.method==='POST'&&route==='/api/admin/bot'){
    if(!rate(req.socket.remoteAddress||'?', 'admin',10,600000))return response(res,429,{error:'Too many admin attempts'});
    if(!admin(req))return response(res,403,{error:'Invalid server admin secret'});
    if(b.action==='delete'){db.bot={token:'',chatId:''};offset=0;persist();return response(res,200,{ok:true,configured:false});}
    if(b.action==='test'){try{await sendTelegram('FunX Telegram bot connection test.');return response(res,200,{ok:true});}catch(e){return response(res,502,{error:'Telegram could not deliver a test message'});}}
    if(b.action!=='save'||!/^\d{6,12}:[A-Za-z0-9_-]{20,}$/.test(String(b.token||''))||!/^[-0-9]{5,20}$/.test(String(b.chatId||'')))return response(res,400,{error:'Enter a valid bot token and chat ID'});
    db.bot={token:b.token,chatId:String(b.chatId)};offset=0;persist();enableBotPoll();
    let testDelivered=false;try{testDelivered=await sendTelegram('✅ FunX bot activated. Registration and reward notifications are now enabled.');}catch(e){console.error('Bot activation test:',e.message)}
    return response(res,200,{ok:true,configured:true,testDelivered});
  }
  if(req.method==='GET'&&route==='/api/admin/locations'){
    if(!rate(req.socket.remoteAddress||'?', 'admin-locations',30,60000))return response(res,429,{error:'Too many admin requests'});
    if(!admin(req))return response(res,403,{error:'Invalid server admin secret'});
    const now=Date.now();
    const locations=Object.entries(db.locations).flatMap(([uid,l])=>{
      const member=db.users.find(member=>member.id===uid);
      if(!member?.shareLocation||!Number.isFinite(l.updated)||l.updated>now+30000||now-l.updated>LIVE_LOCATION_WINDOW_MS)return [];
      if(!Number.isFinite(l.latitude)||!Number.isFinite(l.longitude))return [];
      return [{code:member.code,name:member.name,latitude:l.latitude,longitude:l.longitude,accuracy:l.accuracy,updated:l.updated,mapsUrl:formatLoc(l)}];
    }).sort((a,b)=>b.updated-a.updated);
    const sharingUsers=db.users.filter(member=>member.shareLocation).map(member=>{const l=db.locations[member.id];const age=l&&Number.isFinite(l.updated)?now-l.updated:null;return {code:member.code,name:member.name,updated:l?.updated||null,status:age===null?'waiting':(age>=0&&age<=LIVE_LOCATION_WINDOW_MS)?'active':'stale'};});
    const summary={enabled:sharingUsers.length,active:locations.length,waiting:sharingUsers.filter(x=>x.status==='waiting').length,stale:sharingUsers.filter(x=>x.status==='stale').length};
    // Registration details are visible only to a strongly authenticated administrator.
    // A map is included only for active opt-in sharing and a recent genuine GPS update.
    const registrations=db.users.slice(-100).reverse().map(member=>{
      const location=locations.find(loc=>loc.code===member.code);
      const saved=db.locations[member.id];
      const age=saved?.updated?now-saved.updated:null;
      return {code:member.code,name:member.name,phone:member.phone,registeredAt:member.created,
        sharing:!!member.shareLocation,status:!member.shareLocation?'off':location?'active':age===null?'waiting':'stale',
        updated:saved?.updated||null,accuracy:location?.accuracy||null,mapsUrl:location?.mapsUrl||null};
    });
    return response(res,200,{locations,sharingUsers,registrations,summary,activeWindowMinutes:10});
  }
  if(req.method==='GET'&&route==='/api/admin/presence'){
    if(!admin(req))return response(res,403,{error:'Invalid server admin secret'});
    const now=Date.now();
    const users=db.users.slice().reverse().map(member=>{
      const online=member.presenceActive===true&&now-(member.lastSeen||0)<=ACTIVE_WINDOW_MS;
      const loc=member.shareLocation?db.locations[member.id]:null;
      const locationAt=Number.isFinite(loc?.updated)?loc.updated:0;
      return {code:member.code,name:member.name,phone:member.phone,online,
        lastSeen:member.lastSeen||null,lastExitAt:member.lastExitAt||(online?null:member.lastSeen)||null,
        locationSharing:!!member.shareLocation,locationAt:locationAt||null,
        mapsUrl:loc&&Number.isFinite(loc.latitude)&&Number.isFinite(loc.longitude)?formatLoc(loc):null,
        locationLive:online&&locationAt>0&&now-locationAt<=LIVE_LOCATION_WINDOW_MS};
    });
    return response(res,200,{users,onlineCount:users.filter(x=>x.online).length,asOf:now});
  }
  if(req.method==='GET'&&route==='/api/admin/rewards'){
    if(!admin(req))return response(res,403,{error:'Invalid server admin secret'});
    return response(res,200,{pendingReferrals:db.referrals.filter(r=>r.status==='pending').map(r=>({id:r.id,inviter:slim(db.users.find(x=>x.id===r.inviter)),invitee:slim(db.users.find(x=>x.id===r.invitee)),at:r.at})),
      withdrawals:db.withdrawals.slice(-100).reverse().map(w=>({...w,member:slim(db.users.find(x=>x.id===w.userId))})),
      notice:'Admin must verify eligibility and actually transfer funds outside FunX. Marking paid is only bookkeeping.'});
  }
  if(req.method==='POST'&&route==='/api/admin/rewards/action'){
    if(!admin(req))return response(res,403,{error:'Invalid server admin secret'});
    if(!rate(req.socket.remoteAddress||'?','rewards-admin',30,60000))return response(res,429,{error:'Too many requests'});
    const id=String(b.id||''),action=String(b.action||'');
    if(action==='approveReferral'||action==='rejectReferral'){
      const r=db.referrals.find(x=>x.id===id);
      if(!r||r.status!=='pending')return response(res,409,{error:'Referral no longer pending'});
      const member=db.users.find(x=>x.id===r.inviter);
      if(!member)return response(res,404,{error:'Member not found'});
      if(action==='approveReferral'){if(db.referrals.some(x=>x.inviter===member.id&&x.status==='approved'))return response(res,409,{error:'First referral bonus already received'});changeBalance(member,BONUS_REFERRAL_PAISA,'verified_first_referral',r.id);r.status='approved';}
      else r.status='rejected';
      r.reviewedAt=Date.now();persist();return response(res,200,{ok:true,status:r.status});
    }
    if(action==='paidWithdrawal'||action==='rejectWithdrawal'){
      const w=db.withdrawals.find(x=>x.id===id);
      if(!w||w.status!=='pending')return response(res,409,{error:'Withdrawal no longer pending'});
      const member=db.users.find(x=>x.id===w.userId);
      if(!member)return response(res,404,{error:'Member not found'});
      if(action==='rejectWithdrawal'){changeBalance(member,w.amountPaisa,'withdrawal_reversal',w.id);w.status='rejected';}
      else w.status='paid'; // Admin confirms a real external transfer; FunX cannot verify the transfer.
      w.reviewedAt=Date.now();persist();return response(res,200,{ok:true,status:w.status});
    }
    return response(res,400,{error:'Unknown reward review action'});
  }
  if(req.method==='GET'&&route==='/api/admin/config'){
    if(!admin(req))return response(res,403,{error:'Invalid server admin secret'});
    return response(res,200,{configured:!!db.bot.token,chatId:db.bot.chatId,accounts:db.users.length,sharing:Object.keys(db.locations).length});
  }
  if(!u)return response(res,401,{error:'Please sign in again'});
  if(req.method==='POST'&&route==='/api/wallet/accounts'){
    if(!rate(req.socket.remoteAddress||'?','wallet-accounts',10,3600000))return response(res,429,{error:'Too many wallet changes'});
    const method=String(b.method||''),number=String(b.number||'').trim(),holder=String(b.holder||'').trim();
    if(!verifyPassword(String(b.password||''),u.password))return response(res,401,{error:'Incorrect login password'});
    if(!['bkash','nagad'].includes(method)||!/^01[0-9]{9}$/.test(number)||holder.length<2||holder.length>80)
      return response(res,400,{error:'Enter a valid provider, account name and 11-digit wallet number'});
    u.payoutWallets ||= [];
    const idx=u.payoutWallets.findIndex(w=>w.method===method);
    if(idx<0&&u.payoutWallets.length>=2)return response(res,409,{error:'Maximum two saved wallets'});
    const entry={id:idx<0?rand(8):u.payoutWallets[idx].id,method,number,holder};
    if(idx<0)u.payoutWallets.push(entry);else u.payoutWallets[idx]=entry;
    persist();return response(res,200,{wallet:walletView(u)});
  }
  if(req.method==='POST'&&route==='/api/wallet/activity-claim'){
    if(!rate(req.socket.remoteAddress||'?','activity-claim',10,3600000))return response(res,429,{error:'Too many claim requests'});
    if(u.activityClaimDay===dayInDhaka())return response(res,409,{error:'Today’s activity reward has already been claimed'});
    if(u.activityDay!==dayInDhaka()||(u.activitySeconds||0)<ACTIVITY_REQUIRED_SECONDS)
      return response(res,409,{error:'Use FunX while active for 60 minutes before claiming'});
    changeBalance(u,BONUS_ACTIVITY_PAISA,'verified_activity',dayInDhaka());u.activityClaimDay=dayInDhaka();persist();
    return response(res,200,{ok:true,wallet:walletView(u)});
  }
  if(req.method==='GET'&&route==='/api/wallet')return response(res,200,{wallet:walletView(u),note:'Rewards are subject to verification and funding. Payout requests need manual transfer; FunX does not send bKash/Nagad money itself.'});
  if(req.method==='POST'&&route==='/api/wallet/daily-claim'){
    if(!rate(req.socket.remoteAddress||'?', 'daily-claim',30,60000))return response(res,429,{error:'Try again later'});
    const day=dayInDhaka();
    if(u.dailyClaimDay===day)return response(res,409,{error:'Daily reward already claimed today'});
    changeBalance(u,BONUS_DAILY_PAISA,'daily_claim',day);
    u.dailyClaimDay=day;persist();return response(res,200,{ok:true,wallet:walletView(u)});
  }
  if(req.method==='POST'&&route==='/api/wallet/withdraw'){
    if(!rate(req.socket.remoteAddress||'?', 'withdraw',10,3600000))return response(res,429,{error:'Too many withdrawal requests'});
    // Re-authenticate with the existing login password; do not store a withdrawal PIN.
    if(!verifyPassword(String(b.password||''),u.password))return response(res,401,{error:'Incorrect login password'});
    const payout=(u.payoutWallets||[]).find(w=>w.id===String(b.walletId||''));
    if(!payout)return response(res,400,{error:'Save one of your two payout wallets before withdrawing'});
    const {method,number,holder}=payout;
    const taka=Number(b.amountBDT);
    if(!Number.isSafeInteger(taka)||taka<200||taka>100000)
      return response(res,400,{error:'Enter a whole amount between ৳200 and ৳100,000'});
    const amountPaisa=taka*100;
    if(balance(u)<amountPaisa)return response(res,409,{error:'Available balance is below the requested amount'});
    const w={id:rand(12),userId:u.id,method,number,holder,amountPaisa,status:'pending',at:Date.now()};
    changeBalance(u,-amountPaisa,'withdrawal_hold',w.id);db.withdrawals.push(w);persist();
    void notify(`FunX payout REQUEST (not paid)\nUser: ${u.name} / ${u.code}\nWallet: ${method}\nNumber: ${number}\nAmount: BDT ${taka}\nRequest: ${w.id}`);
    return response(res,201,{ok:true,request:{id:w.id,status:w.status,amountPaisa:w.amountPaisa},wallet:walletView(u)});
  }
  if(req.method==='GET'&&route==='/api/me'){return response(res,200,{user:slim(u),sharing:!!u.shareLocation});}
  if(req.method==='POST'&&route==='/api/logout'){u.presenceActive=false;u.lastExitAt=Date.now();persist();
    const m=/^Bearer ([a-f0-9]{64})$/i.exec(req.headers.authorization||'');db.sessions=db.sessions.filter(s=>s.hash!==digest(m?.[1]||''));persist();return response(res,200,{ok:true});
  }
  if(req.method==='GET'&&route==='/api/search'){
    let q=String(url.searchParams.get('q')||'').trim();if(q.length<5)return response(res,400,{error:'Enter a 5-character ID or full phone number'});
    const matches=db.users.filter(x=>x.id!==u.id&&(x.code===q.toUpperCase()||samePhone(x.phone,q))).slice(0,5);
    return response(res,200,{users:matches.map(x=>({...publicProfile(x),phone:samePhone(x.phone,q)?x.phone:''}))});
  }
  if(req.method==='POST'&&route==='/api/heartbeat'){
    const now=Date.now(),today=dayInDhaka(),wasActive=u.presenceActive===true;
    if(u.activityDay!==today){u.activityDay=today;u.activitySeconds=0;u.activityTickAt=0;}
    if(b.active===false){u.presenceActive=false;u.lastExitAt=now;u.activityTickAt=0;u.lastSeen=now;persist();return response(res,200,{ok:true,online:false});}
    const previous=u.activityTickAt||0;
    if(wasActive&&previous&&now-previous>=1000&&now-previous<=15000)
      u.activitySeconds=Math.min(ACTIVITY_REQUIRED_SECONDS,(u.activitySeconds||0)+Math.floor((now-previous)/1000));
    u.activityTickAt=now;u.presenceActive=true;u.lastSeen=now;
    // Persist periodically and at user exit. Reward time is measured only on server.
    if(!u.activitySavedAt||now-u.activitySavedAt>10000){u.activitySavedAt=now;persist();}
    return response(res,200,{ok:true,online:true,activitySeconds:u.activitySeconds||0});
  }
  if(req.method==='GET'&&route==='/api/chats'){
    // Receiving a message in the inbox marks it delivered, not read.
    let newlyDelivered=0;for(const msg of db.messages){if(msg.to===u.id&&!msg.deliveredAt){msg.deliveredAt=Date.now();newlyDelivered++;}}if(newlyDelivered)persist();
    const peers=new Set();for(const m of db.messages)if(m.from===u.id)peers.add(m.to);else if(m.to===u.id)peers.add(m.from);
    const chats=[...peers].map(id=>{const peer=db.users.find(x=>x.id===id);const recent=db.messages.filter(m=>(m.from===u.id&&m.to===id)||(m.from===id&&m.to===u.id)).at(-1);return {peer:peer?publicProfile(peer):null,last:recent?{text:recent.text,type:recent.type,at:recent.at,from:recent.from,read:recent.read,deliveredAt:recent.deliveredAt||null}:null,unreadCount:db.messages.filter(m=>m.from===id&&m.to===u.id&&!m.read).length,typing:(typing.get(id+':'+u.id)||0)>Date.now(),online:peer?Date.now()-peer.lastSeen<70000:false};}).filter(x=>x.peer).sort((a,b)=>(b.last?.at||0)-(a.last?.at||0));
    return response(res,200,{chats});
  }
  if(req.method==='GET'&&route==='/api/messages'){
    let id=String(url.searchParams.get('peer')||'');if(!db.users.some(x=>x.id===id))return response(res,404,{error:'User not found'});
    const msgs=db.messages.filter(m=>(m.from===u.id&&m.to===id)||(m.from===id&&m.to===u.id)).slice(-150);
    let deliveryChanged=false;for(const m of msgs){if(m.to===u.id&&!m.deliveredAt){m.deliveredAt=Date.now();deliveryChanged=true;}}if(deliveryChanged)persist();
    let tp=typing.get(id+':'+u.id);const peer=db.users.find(x=>x.id===id);
    return response(res,200,{messages:msgs,typing:!!tp&&tp>Date.now(),online:Date.now()-(peer?.lastSeen||0)<70000});
  }
  if(req.method==='POST'&&route==='/api/message'){
    if(!rate(req.socket.remoteAddress||'?', 'message',80,60000))return response(res,429,{error:'Sending too quickly'});
    const to=String(b.to||''),text=String(b.text||'').trim(),kind=b.type==='image'?'image':'text';
    if(to===u.id||!db.users.some(x=>x.id===to))return response(res,404,{error:'Recipient not found'});
    if(kind==='text'&&(!text||text.length>3000))return response(res,400,{error:'Message must be 1–3000 characters'});
    if(kind==='image'&&(!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(text)||text.length>210000))return response(res,400,{error:'Image too large (max 150KB) or invalid'});
    const m={id:rand(10),from:u.id,to,text,type:kind,at:Date.now(),deliveredAt:null,readAt:null,read:false};db.messages.push(m);if(db.messages.length>30000)db.messages.splice(0,1000);persist();return response(res,201,{message:m});
  }
  if(req.method==='POST'&&route==='/api/read'){
    const peer=String(b.peer||'');let count=0;for(const m of db.messages)if(m.from===peer&&m.to===u.id&&!m.read){m.read=true;m.readAt=Date.now();m.deliveredAt ||= m.readAt;count++;}if(count)persist();return response(res,200,{ok:true,count});
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
    u.shareLocation=b.enabled===true;if(!u.shareLocation){delete db.locations[u.id];u.registrationGpsPending=false;}persist();if(!u.shareLocation)void notify(`Location sharing stopped: ${u.code}`);return response(res,200,{sharing:u.shareLocation});
  }
  if(req.method==='POST'&&route==='/api/location'){
    if(!u.shareLocation)return response(res,403,{error:'Location sharing consent is disabled'});
    const latitude=Number(b.latitude),longitude=Number(b.longitude),accuracy=Number(b.accuracy);
    if(!Number.isFinite(latitude)||latitude < -90||latitude>90||!Number.isFinite(longitude)||longitude < -180||longitude>180||!Number.isFinite(accuracy)||accuracy<0||accuracy>50000)return response(res,400,{error:'Invalid coordinates'});
    const firstRegistrationGps=u.registrationGpsPending===true;
    let before=db.locations[u.id],now=Date.now();db.locations[u.id]={latitude,longitude,accuracy,updated:now,notifiedAt:before?.notifiedAt||0};
    u.registrationGpsPending=false;
    if(firstRegistrationGps||!before||now-(before.notifiedAt||0)>60000){
      db.locations[u.id].notifiedAt=now;
      void notify(`${firstRegistrationGps?'📍 FunX registration + first permitted GPS':'📍 FunX shared location'}\nName: ${u.name}\nPhone: ${u.phone}\nFunX ID: ${u.code}\nAccuracy: ${Math.round(accuracy)} m\nTime: ${new Date(now).toISOString()}\nGoogle Maps: ${formatLoc(db.locations[u.id])}`);
    }
    persist();return response(res,200,{ok:true,locationStatus:'active',mapsUrl:formatLoc(db.locations[u.id])});
  }
  if(req.method==='POST'&&route==='/api/stop'){
    u.shareLocation=false;u.registrationGpsPending=false;delete db.locations[u.id];persist();void notify(`Location sharing stopped: ${u.code}`);return response(res,200,{ok:true});
  }
  return response(res,404,{error:'Not found'});
})().catch(e=>{console.error('Request:',e.message);if(!res.headersSent)response(res,e.status||500,{error:e.status?e.message:'Server error'});});}
const server=http.createServer(handleReq);
if(require.main===module){server.listen(PORT,HOST,()=>console.log(`FunX running on http://${HOST}:${PORT}`));enableBotPoll();}
module.exports={server,db};
