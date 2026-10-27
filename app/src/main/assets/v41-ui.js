'use strict';
/* FunX 4.1 — progressive, chat-first view with transparent reward status. */
(() => {
  const oldApi = api, oldRenderTab = renderTab, oldRenderEarn = renderEarnTab;
  const oldShowApp = showApp, oldOpenModal = openModal;
  let walletCache = null, liveSeconds = 0, lastWalletFetch = 0;
  let rewardCycle = Date.now() + 30*60*1000, earnCategory = 'activity';
  let adminKeyForSession = '', contactTyping = false;
  const fmtTime = ms => new Date(ms).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  const progress = secs => Math.max(0,Math.min(100,Math.round(Number(secs||0)/3600*100)));
  const secsText = secs => `${Math.min(60,Math.floor(Number(secs||0)/60))} / 60 min`;
  const cycleText = () => {
    const s=Math.max(0,Math.ceil((rewardCycle-Date.now())/1000));
    return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  };
  window.api = async function(route,options){
    const result=await oldApi(route,options);
    if(route.startsWith('/api/messages?peer=')&&typeof result.typing==='boolean'){
      contactTyping=result.typing;updateTypingIndicator();
    }
    if(route==='/api/heartbeat'&&typeof result.activitySeconds==='number'){
      liveSeconds=result.activitySeconds;
      updateInboxReward();updateEarnMeter();
    }
    if(route==='/api/wallet'&&result.wallet){
      walletCache=result.wallet;liveSeconds=result.wallet.activitySeconds||0;
      lastWalletFetch=Date.now();updateInboxReward();updateEarnMeter();
    }
    return result;
  };
  function updateInboxReward(){
    const node=document.getElementById('inboxReward');if(!node)return;
    const bar=node.querySelector('.reward-progress > div');if(bar)bar.style.width=progress(liveSeconds)+'%';
    const elapsed=node.querySelector('#inboxActivityMinutes');if(elapsed)elapsed.textContent=secsText(liveSeconds);
    const percent=node.querySelector('#inboxPercent');if(percent)percent.textContent=progress(liveSeconds)+'%';
    const balance=node.querySelector('#inboxWalletAmount');if(balance)balance.textContent=walletCache?money(walletCache.balancePaisa):'৳—';
    const status=node.querySelector('#inboxRewardStatus');if(status)status.textContent=walletCache?.activityClaimedToday?'৳20 claimed today':liveSeconds>=3600?'৳20 ready to claim':'৳20 unlocks at 60 minutes';
    const due=node.querySelector('#inboxRewardCycle');if(due)due.textContent='30-minute reward check: '+cycleText();
  }
  function updateEarnMeter(){
    const bar=document.getElementById('activityBarFill');if(bar)bar.style.width=progress(liveSeconds)+'%';
    const minutes=document.getElementById('activityExactMinutes');if(minutes)minutes.textContent=secsText(liveSeconds);
    const pct=document.getElementById('activityPercent');if(pct)pct.textContent=progress(liveSeconds)+'%';
  }
  async function refreshInboxWallet(){if(!me||!token||!appVisible)return;
    try{await api('/api/wallet')}catch(e){}finally{updateInboxReward()}
  }
  function updateTypingIndicator(){
    const subtitle=document.getElementById('peerStatus');
    if(subtitle && contactTyping){
      subtitle.innerHTML='<span class="typing-animated">typing<span class="typing-dots"><i></i><i></i><i></i></span></span>';
    }
  }
  function updateTypingPreview(){
    const container=document.getElementById('messages');if(!container)return;
    let note=document.getElementById('typingLastPreview');
    if(!note){note=document.createElement('div');note.id='typingLastPreview';note.className='typing-last-preview hide';container.parentElement.insertBefore(note,container);}
    if(!contactTyping||!peer){note.classList.add('hide');return;}
    const previous=[...messages].reverse().find(m=>m.from===peer.id);
    const lastText=previous?(previous.type==='image'?'📷 Photo':previous.text):'No previous messages';
    note.textContent='💬 Last message: '+lastText.slice(0,145);
    note.classList.remove('hide');
  }
  function inboxHtml(){return `<div class="inbox-reward" id="inboxReward">
    <div class="inbox-head"><div><h3>🎁 Today’s rewards</h3><span class="inbox-note" id="inboxRewardStatus">Checking activity…</span></div><div class="inbox-balance" id="inboxWalletAmount">৳—</div></div>
    <div class="progress-line" style="margin-top:11px"><strong style="font-size:13px;color:#176454" id="inboxActivityMinutes">0 / 60 min</strong><span class="claim-pill" id="inboxPercent">0%</span></div>
    <div class="reward-progress"><div></div></div>
    <div class="inbox-head"><span class="inbox-note" id="inboxRewardCycle">30-minute reward check: 30:00</span><button onclick="goTab('earn')">Open Earn ›</button></div>
  </div>`}
  window.renderTab=function(){
    if(tab==='chats'){
      document.getElementById('body').innerHTML=`${inboxHtml()}<div class="search"><input id="filterChats" placeholder="🔎 Search chats and people" oninput="renderChats()"><button class="btn" onclick="openModal('find')">Find</button></div><div class="list chat-list" id="chatList"></div><button class="FAB" onclick="openModal('find')" aria-label="New chat">✎</button>`;
      renderChats();updateInboxReward();if(Date.now()-lastWalletFetch>10000)void refreshInboxWallet();return;
    }
    oldRenderTab();
    if(tab==='location'){
      const body=document.getElementById('body');
      body.insertAdjacentHTML('afterbegin','<div class="section" style="padding-bottom:0"><button class="light" onclick="goTab(\'earn\')">‹ Back to Earn</button></div>');
    }
  };
  window.showApp=function(){document.getElementById('app').classList.add('chat-theme');oldShowApp()};
  function ticks(m){if(m.read)return '<span class="ticks seen" title="Seen" aria-label="Seen">✓✓</span>';
    if(m.deliveredAt)return '<span class="ticks delivered" title="Delivered" aria-label="Delivered">✓✓</span>';
    return '<span class="ticks sent" title="Sent" aria-label="Sent">✓</span>';
  }
  window.renderChats=function(){const el=document.getElementById('chatList');if(!el)return;
    const q=(document.getElementById('filterChats')?.value||'').toLowerCase();
    const result=chats.filter(x=>x.peer.name.toLowerCase().includes(q)||x.peer.code.toLowerCase().includes(q));
    el.innerHTML=result.map(x=>{
      const last=x.last||null, unread=Math.max(0,Number(x.unreadCount||0));
      const preview=last?(last.type==='image'?'📷 Photo':last.text):x.peer.code;
      const outbound=last&&last.from===me.id;
      const typingState=x.typing?'<div class="inbox-typing">typing <span class="typing-dots"><i></i><i></i><i></i></span></div>':'';
      return `<div class="item" onclick="openChat('${safe(x.peer.id)}')">
      <div class="avatar">${safe(x.peer.name[0])}</div><div class="content"><div class="name">${safe(x.peer.name)}${x.online?'<span class="online-dot"></span>':''}</div><div class="desc">${outbound?ticks(last)+' ':''}${safe(preview)}</div>${typingState}</div>
      <div class="chat-trailing"><span class="time">${last?fmtTime(last.at):''}</span>${unread?`<span class="unread-badge">${unread>99?'99+':unread}</span>`:''}</div></div>`;
    }).join('')||'<div class="empty"><div class="big">💬</div><strong>No conversations yet</strong>Find a friend by FunX ID to start chatting.</div>';
  };
  window.renderMessages=function(){const el=document.getElementById('messages');if(!el)return;
    const last=el.lastElementChild?.dataset?.mid;
    el.innerHTML=messages.map(m=>`<div class="bubble ${m.from===me.id?'mine':''}" data-mid="${safe(m.id)}">${m.type==='image'?`<img alt="Shared photo" src="${safe(m.text)}">`:safe(m.text)}<div class="meta">${fmtTime(m.at)} ${m.from===me.id?ticks(m):''}</div></div>`).join('');
    if(el.lastElementChild?.dataset.mid!==last)el.scrollTop=el.scrollHeight;
    updateTypingIndicator();updateTypingPreview();
  };
  const originalOpenChat=openChat;
  window.openChat=function(id){contactTyping=false;originalOpenChat(id)};
  window.renderEarnTab=function(){oldRenderEarn();
    const body=document.getElementById('body'),sec=body.querySelector('.section');if(!sec)return;
    const cards=Array.from(sec.children).filter(x=>x.classList.contains('card'));
    const introGrid=Array.from(sec.children).find(x=>x.classList.contains('earn-grid'));
    if(introGrid)introGrid.classList.add('earning-intro-grid');
    const nav=document.createElement('div');nav.className='earn-sections';nav.setAttribute('role','tablist');
    nav.innerHTML=['activity:⏱ Activity','daily:🎁 Daily','referral:👥 Referrals','wallet:💳 Wallet & Cash Out'].map(x=>{const [id,label]=x.split(':');return `<button type="button" data-earn="${id}" onclick="switchEarnCategory('${id}')">${label}</button>`}).join('');
    sec.insertBefore(nav,cards[0]||null);
    for(const name of ['activity','daily','referral','wallet']){
      const panel=document.createElement('div');panel.className='earn-category';panel.dataset.category=name;sec.appendChild(panel);
    }
    cards.forEach((node,i)=>{const dest=i===0?'activity':i===1?'daily':i===2?'referral':'wallet';sec.querySelector(`[data-category="${dest}"]`).appendChild(node)});
    const progressNode=document.getElementById('activityProgress');if(progressNode){
      progressNode.insertAdjacentHTML('beforebegin',`<div class="progress-line"><span class="progress-main" id="activityExactMinutes">0 / 60 min</span><span class="claim-pill" id="activityPercent">0%</span></div><div class="reward-progress"><div id="activityBarFill"></div></div>`);
      progressNode.classList.add('reward-state');
    }
    const privacy=document.createElement('div');privacy.className='earn-privacy';
    privacy.innerHTML='<strong>📍 Privacy & Location</strong><div>Location is optional and controlled by you. You can pause it any time.</div><button onclick="goTab(\'location\')">Location sharing settings ›</button>';
    sec.appendChild(privacy);
    const x=sec.querySelector('.earn-hero .sub');if(x)x.textContent='Easy, transparent rewards for the FunX personal chat community.';
    switchEarnCategory(earnCategory);updateEarnMeter();
  };
  window.switchEarnCategory=function(next){earnCategory=next;
    document.querySelectorAll('[data-earn]').forEach(x=>{x.classList.toggle('active',x.dataset.earn===next);x.setAttribute('aria-selected',String(x.dataset.earn===next))});
    document.querySelectorAll('[data-category]').forEach(x=>x.classList.toggle('active',x.dataset.category===next));
  };
  const oldRefreshEarn=refreshEarn;
  window.refreshEarn=async function(){await oldRefreshEarn();updateEarnMeter();};
  const oldAdminLocations=loadAdminLocations,oldAdminPresence=loadAdminPresence,oldAdminRewards=adminRewards;
  const oldBotInfo=botInfo,oldRewardAction=rewardAction;
  function injectAdminKey(){const el=document.getElementById('adminSecret');if(el&&adminKeyForSession&&!el.value)el.value=adminKeyForSession;}
  window.openModal=function(type){oldOpenModal(type);
    if(type==='admin'){
      injectAdminKey();
      const field=document.getElementById('adminSecret');
      if(field){field.insertAdjacentHTML('afterend','<button class="light" onclick="unlockAdminSession()" style="width:100%;margin:10px 0">Authenticate once for this session</button><div class="sub" id="sessionAdminStatus">'+(adminKeyForSession?'Admin authenticated for this app session':'Enter your admin secret once. Map links then open directly.')+'</div>');}
    }
  };
  window.unlockAdminSession=async function(){const k=document.getElementById('adminSecret')?.value||'';
    try{const r=await api('/api/admin/config',{adminKey:k});adminKeyForSession=k;
      const st=document.getElementById('sessionAdminStatus');if(st)st.textContent='Admin authenticated · '+r.accounts+' members. No additional code needed to open permitted map links.';
      await loadAdminLocations();toast('Admin access confirmed');
    }catch(e){adminKeyForSession='';toast(e.message)}
  };
  window.loadAdminLocations=async function(){injectAdminKey();return oldAdminLocations()};
  window.loadAdminPresence=async function(){injectAdminKey();return oldAdminPresence()};
  window.adminRewards=async function(){injectAdminKey();return oldAdminRewards()};
  window.rewardAction=async function(a,id){injectAdminKey();return oldRewardAction(a,id)};
  window.botInfo=async function(){injectAdminKey();return oldBotInfo()};
  window.botAction=async function(action){injectAdminKey();
    const key=document.getElementById('adminSecret')?.value||'';
    const notice=document.getElementById('botResult');if(!notice)return;
    const payload={action};if(action==='save'){
      payload.token=document.getElementById('botToken').value.trim();
      payload.chatId=document.getElementById('botChat').value.trim();
    }
    try{const result=await api('/api/admin/bot',{adminKey:key,body:payload});
      if(action==='save'){
        document.getElementById('botToken').value='';
        notice.textContent=result.testDelivered?'✅ Bot activated now. First notification delivered.':'✅ Bot configuration activated immediately. Telegram test failed; verify Chat ID and bot chat permission.';
      }else if(action==='delete')notice.textContent='Bot disabled';else notice.textContent='✅ Telegram test delivered';
    }catch(e){notice.textContent='Telegram: '+e.message}
  };
  const auth=document.getElementById('auth');
  auth?.querySelector('.brand')?.removeAttribute('onclick');
  if(auth){auth.insertAdjacentHTML('afterbegin','<button type="button" class="auth-hide-tap" aria-label="Administrator access" onclick="adminTap()"></button>')}
  document.getElementById('brandTap')?.removeAttribute('onclick');
  const topLoc=document.querySelector('[data-tab="location"]');if(topLoc)topLoc.remove();
  // Keep a consent-controlled location control in Earn and Profile instead.
  const authReferralNote=document.querySelector('#referralWrap .earn-info');
  if(authReferralNote)authReferralNote.textContent='The inviter receives ৳100 instantly after the first eligible, unique referred registration. Rewards are credited once per inviter.';
  const offer=auth.querySelector('.earn-grid .sub');if(offer)offer.textContent='First eligible referral · credited instantly';
  const footer=document.querySelector('#main .footer');if(footer)footer.textContent='FunX 4.1 · Private Chats & Rewards';
  setInterval(()=>{
    if(!me||!appVisible||document.hidden)return;
    if(Date.now()>=rewardCycle){rewardCycle=Date.now()+30*60*1000;void refreshInboxWallet()}
    if(tab==='chats'&&Date.now()-lastWalletFetch>=60000)void refreshInboxWallet();
    updateInboxReward();updateEarnMeter();
  },15000);
})();
