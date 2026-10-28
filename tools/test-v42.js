'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {activityWindowIndex,activityWindowCounts,activityProgress,recordHeartbeat}=require('../server/server');
const html=fs.readFileSync('app/src/main/assets/index.html','utf8');
const manifest=fs.readFileSync('app/src/main/AndroidManifest.xml','utf8');
const server=fs.readFileSync('server/server.js','utf8');
assert.match(manifest,/windowSoftInputMode="adjustResize"/);
for(const marker of ['adminOverview','refreshAdminOverview','fxAdminRecentMaps','funxAdminJump',
 'Bot Token','loadAdminLocations','loadAdminPresence'])
 assert.ok(html.includes(marker),'Admin feature missing: '+marker);

for(const marker of ['--funx-chat-height','visualViewport.addEventListener','resizeChatForKeyboard',
  'unread-chat','peer-typing-bubble','inboxWindowSlots','earnWindowSlots',
  'activityWindowsSeconds','Complete 20 min in EACH','windowCardsHtml'])
  assert.ok(html.includes(marker),'Missing UI behavior: '+marker);
for(const marker of ['ACTIVITY_SLOT_SECONDS=1200','activityWindowCounts',
  'recordHeartbeat','activityProgress(u).activityEligible','persist(); // Save every accepted tick'])
  assert.ok(server.includes(marker),'Missing backend behavior: '+marker);
for(const [slot,utc] of [
  [0,'2026-10-28T05:59:59Z'],[1,'2026-10-28T06:00:00Z'],
  [1,'2026-10-28T09:59:59Z'],[2,'2026-10-28T10:00:00Z'],
  [2,'2026-10-28T17:59:59Z'],[0,'2026-10-28T18:00:00Z']])
  assert.equal(activityWindowIndex(Date.parse(utc)),slot,'Dhaka boundary '+utc);
const user={presenceActive:false,activityDay:'',activityTickAt:0,activityWindowsSeconds:[]};
const bases=['2026-10-28T00:10:00Z','2026-10-28T07:10:00Z','2026-10-28T11:10:00Z'];
for(let slot=0;slot<3;slot++){
 const start=Date.parse(bases[slot]);
 recordHeartbeat(user,start,true);
 for(let tick=1;tick<=60;tick++)recordHeartbeat(user,start+tick*10000,true);
 assert.equal(activityWindowCounts(user,start+600000)[slot],600,'First ten minutes in slot '+slot);
 recordHeartbeat(user,start+600100,false);
 const previous=activityWindowCounts(user,start+600100)[slot];
 recordHeartbeat(user,start+6000000,true); // 90-minute pause, must not accrue
 assert.equal(activityWindowCounts(user,start+6000000)[slot],previous,'Pause preserves minutes in slot '+slot);
 for(let tick=1;tick<=60;tick++)recordHeartbeat(user,start+6000000+tick*10000,true);
 assert.equal(activityWindowCounts(user,start+6600000)[slot],1200,'Reentry completes slot '+slot);
 recordHeartbeat(user,start+6600500,false);
}
assert.equal(activityProgress(user,Date.parse(bases[2])).activityEligible,true,'All slots required');
assert.deepEqual(activityWindowCounts(user,Date.parse(bases[2])),[1200,1200,1200]);
const crossing={presenceActive:false,activityDay:'',activityTickAt:0,activityWindowsSeconds:[]};
const n=Date.parse('2026-10-28T05:59:55Z');
recordHeartbeat(crossing,n,true);
recordHeartbeat(crossing,n+10000,true);
assert.deepEqual(activityWindowCounts(crossing,n+10000),[0,0,0],'Cross-window ticks do not miscredit');
recordHeartbeat(user,Date.parse('2026-10-28T18:01:00Z'),true);
assert.deepEqual(activityProgress(user,Date.parse('2026-10-28T18:01:00Z')).activityWindowsSeconds,[0,0,0],'Next Dhaka day reset');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.ok(scripts.length>=2,'Inline UI modules');
for(const [i,script] of scripts.entries())new vm.Script(script[1],{filename:'funx-v42-ui-'+i+'.js'});
console.log('PASS: FunX v4.2 typing, keyboard, unread highlight, saved 3x20-minute windows and JS syntax');
