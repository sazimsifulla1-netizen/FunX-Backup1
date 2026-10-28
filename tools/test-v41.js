'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('app/src/main/assets/index.html','utf8');
const server=fs.readFileSync('server/server.js','utf8');
const gradle=fs.readFileSync('app/build.gradle','utf8');
assert.match(gradle,/versionName '4\.2\.0'/);
assert.ok(html.includes('/* FunX 4.1 — progressive'));
assert.ok(html.includes('/* Typing indicator retains'));
for (const marker of [
 'inboxReward','activityExactMinutes','activityBarFill',
 'switchEarnCategory','unread-badge','ticks delivered',
 'ticks seen','30-minute reward check','typing-last-preview',
 'typing-animated','adminKeyForSession','auth-hide-tap'
]) assert.ok(html.includes(marker),'Missing new feature: '+marker);
for(const marker of ['deliveredAt','readAt','testDelivered','first_completed_referral']){
 assert.ok(server.includes(marker),'Missing backend feature: '+marker);
}
for(const id of ['authPhone','authPass','savePayoutPassword','withdrawPassword']){
 const m=html.match(new RegExp('<input\\b[^>]*\\bid="'+id+'"[^>]*>'));
 assert.ok(m && m[0].includes('autocomplete="off"'),'Autofill still enabled: '+id);
}
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.ok(scripts.length>=2,'Expected inlined UI modules');
for(const [i,s] of scripts.entries())new vm.Script(s[1],{filename:'funx-ui-'+i+'.js'});
console.log('PASS: FunX 4.2.0 new UI, syntax, reward, typing, autofill and backend markers');
