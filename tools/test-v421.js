'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('app/src/main/assets/index.html','utf8');
const server=fs.readFileSync('server/server.js','utf8');
const gradle=fs.readFileSync('app/build.gradle','utf8');
assert.match(gradle,/versionName '4\.2\.1'/);
for(const marker of ['adminDashboardCard','adminDashboard()','adminRefreshAll()',
 'Open permitted Google Map','admin-stat-grid','Save & Activate',
 'Location sharing OFF','Telegram Bot','botResult']){
 assert.ok(html.includes(marker),'Missing admin UI feature: '+marker);
}
for(const marker of ['botStatus','/api/admin/dashboard','recentMembers',
 'lastDeliveredAt','testDelivered','Admin authorization required',
 'member.shareLocation','LIVE_LOCATION_WINDOW_MS']){
 assert.ok(server.includes(marker),'Missing server admin feature: '+marker);
}
assert.ok(!server.includes('token:db.bot.token'),'Bot token must not be returned to client');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.ok(scripts.length>=2,'Missing FunX inline JavaScript');
for(const [i,part] of scripts.entries())new vm.Script(part[1],{filename:'funx-admin-'+i+'.js'});
console.log('PASS: FunX 4.2.1 admin GPS maps, bot token controls, overview and JS syntax');
