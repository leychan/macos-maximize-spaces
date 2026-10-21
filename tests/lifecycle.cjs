const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../contents/code/main.js'), 'utf8');
function signal() { const handlers=[]; return {connect:f=>handlers.push(f), emit:()=>handlers.slice().forEach(f=>f())}; }
function setup() {
 const home={name:'Home'}, windows=[];
 const ws={desktops:[home],currentDesktop:home,windowAdded:signal(),windowList:()=>windows,
 createDesktop(i,n){this.desktops.splice(i,0,{name:n});},removeDesktop(d){this.desktops=this.desktops.filter(x=>x!==d);}};
 vm.runInNewContext(source,{workspace:ws, console});
 function window() {
  const w={normalWindow:true, transient:false,onAllDesktops:false,minimized:false,maximizeMode:0,desktops:[ws.currentDesktop],caption:'Test',maximizedChanged:signal(),minimizedChanged:signal(),desktopsChanged:signal(),closed:signal()};
  windows.push(w);
  // signal supports arguments for workspace.windowAdded.
  return w;
 }
 return {ws,home,windows,window};
}
// Build a variant of signal with argument forwarding for the workspace signal.
signal=function(){const h=[];return {connect:f=>h.push(f),emit:(...args)=>h.slice().forEach(f=>f(...args))};};
let checks=0;
function scenario(f){const s=setup(); const add=()=>{const w=s.window();s.ws.windowAdded.emit(w);return w;};f({...s,add});checks++;}
function maximize(w){w.maximizeMode=3;w.maximizedChanged.emit();}
scenario(({ws,home,add})=>{const w=add();maximize(w);assert.equal(ws.desktops.length,2);assert.equal(ws.currentDesktop,w.desktops[0]);w.minimized=true;w.minimizedChanged.emit();assert.equal(ws.desktops.length,1);assert.equal(ws.currentDesktop,home);assert.equal(w.desktops[0],home);w.minimized=false;w.minimizedChanged.emit();assert.equal(ws.desktops.length,2);w.maximizeMode=0;w.maximizedChanged.emit();assert.equal(ws.desktops.length,1);});
scenario(({ws,home,add})=>{const w=add();maximize(w);w.closed.emit();assert.equal(ws.desktops.length,1);assert.equal(ws.currentDesktop,home);});
scenario(({ws,home,add})=>{const w=add();w.maximizeMode=1;w.maximizedChanged.emit();assert.equal(ws.desktops.length,1);maximize(w);ws.currentDesktop=home;w.closed.emit();assert.equal(ws.currentDesktop,home);});
scenario(({ws,add})=>{const w=add();maximize(w);add();w.closed.emit();assert.equal(ws.desktops.length,2);});
scenario(({ws,home,add})=>{const a=add();maximize(a);const b=add();maximize(b);a.closed.emit();assert.equal(ws.desktops.length,2);b.closed.emit();assert.equal(ws.desktops.length,1);assert.equal(ws.currentDesktop,home);});
scenario(({ws,home,add})=>{const w=add();maximize(w);w.desktops=[home];w.desktopsChanged.emit();assert.equal(ws.desktops.length,1);assert.equal(w.desktops[0],home);});
scenario(({ws,add})=>{ws.createDesktop=()=>{};maximize(add());assert.equal(ws.desktops.length,1);});
scenario(({ws,add})=>{const w=add();w.onAllDesktops=true;maximize(w);assert.equal(ws.desktops.length,1);});
scenario(({ws,home,add})=>{const w=add();maximize(w);const extra={name:'Other'};ws.desktops.push(extra);ws.desktops=ws.desktops.filter(d=>d!==home);w.minimized=true;w.minimizedChanged.emit();assert.equal(w.desktops[0],extra);assert.equal(ws.desktops.length,1);});
console.log(checks+' lifecycle scenarios passed');
