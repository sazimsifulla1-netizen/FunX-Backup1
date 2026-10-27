'use strict';
// Isolated registration-flow test with fake Android bridge and fake API (no real GPS or network).
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const html = fs.readFileSync(__dirname+'/../app/src/main/assets/index.html','utf8');
assert(html.includes('id="regShareLocation"') && html.includes('onchange="registrationShareChanged(this.checked)"'));
assert(html.includes('Location sharing is OFF. Registration does not require location access.'));
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id,{id,checked:false,value:'',textContent:'',innerHTML:'',style:{display:'none'},classList:{add(){},remove(){},toggle(){}},querySelectorAll(){return []}});
  return elements.get(id);
}
const calls={permission:0,locationStart:0,remoteEnabled:[],api:[],session:0,toasts:[]};
const native={
  requestRegistrationLocationPermission(){calls.permission++},
  getSavedToken(){return ''}, getSavedServer(){return ''}, getLocationState(){return JSON.stringify({permission:true,running:false})},
  saveSession(){calls.session++;return true},setRemoteEnabled(x){calls.remoteEnabled.push(x)},
  enableTracking(){calls.locationStart++}, disableTracking(){}
};
const ls = new Map();
const ctx=vm.createContext({
  document:{getElementById:element,querySelectorAll(){return []}},
  window:{FunXNative:native},
  localStorage:{getItem:k=>ls.get(k)??null,setItem:(k,v)=>ls.set(k,String(v)),removeItem:k=>ls.delete(k)},
  location:{protocol:'https:'},
  setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},
  AbortSignal:{timeout:()=>null},console,
});
vm.runInContext(js,ctx);
vm.runInContext(`api=async(route,opt={})=>{window.__calls.api.push(route);if(route==='/api/register')return {token:'${'a'.repeat(64)}',user:{id:'user1',code:'ABCDE',name:'Jane'}}; if(route==='/api/location-consent')return {sharing:opt.body.enabled};return {ok:true}};showApp=()=>{};toast=(s)=>window.__calls.toasts.push(s);`,ctx);
ctx.window.__calls=calls;
function evalJs(expr){return vm.runInContext(expr,ctx)}
(async()=>{
  element('authName').value='Jane';element('authPhone').value='+8801712345678';element('authPass').value='testPassword123';element('regPrivacy').checked=true;
  // Unchecked registration does not request location.
  await evalJs('submitAuth()');
  assert.equal(calls.permission,0);assert.equal(calls.locationStart,0);
  // Reset mock login for a second test.
  evalJs(`token='';me=null;share=false`);
  element('regShareLocation').checked=true;evalJs('registrationShareChanged(true)');
  assert.equal(calls.permission,1,'checking box must request Android permission immediately');
  evalJs('window.funxRegistrationPermissionResult(false)');
  assert.equal(element('regShareLocation').checked,false,'denying permissions unchecks box');
  await evalJs('submitAuth()');assert.equal(calls.locationStart,0,'denial must not start GPS');
  // Permission granted; remote consent only after registration API succeeds.
  evalJs(`token='';me=null;share=false`);
  element('regShareLocation').checked=true;evalJs('registrationShareChanged(true)');
  assert.equal(calls.permission,2);
  assert.equal(calls.locationStart,0,'checking checkbox alone must not start GPS');
  evalJs('window.funxRegistrationPermissionResult(true)');
  calls.api.length=0;
  await evalJs('submitAuth()');
  assert.equal(calls.api[0],'/api/register');
  assert.equal(calls.api[1],'/api/location-consent');
  assert.equal(calls.locationStart,1,'sharing starts once registration and server consent succeed');
  assert(calls.remoteEnabled.includes(true));
  console.log('PASS: registration checkbox/permission/consent flow assertions');
})().catch(e=>{console.error(e);process.exit(1)});
