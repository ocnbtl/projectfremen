// Verifies that cross-tab sync adds no polling or hidden-tab request bursts.
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
global.window=new EventTarget();global.document=new EventTarget();document.hidden=false;
const tokens=[];global.localStorage={setItem:(key,value)=>tokens.push([key,value])};
const {subscribeTaskChanges,notifyTaskChange,TASK_CHANGE_KEY}=require('../lib/modules/planning/task-changes.ts');
const emit=key=>{const event=new Event('storage');event.key=key;window.dispatchEvent(event);};
let local=0,remote=0;
const stop=subscribeTaskChanges(()=>local++),stopRemote=subscribeTaskChanges(()=>remote++,false);
notifyTaskChange();assert.equal(local,1);assert.equal(remote,0);assert.equal(tokens[0][0],TASK_CHANGE_KEY);assert.match(tokens[0][1],/^[a-f0-9-]{36}$/);
emit('unrelated');assert.equal(local,1);
document.hidden=true;for(let n=0;n<30;n++)emit(TASK_CHANGE_KEY);assert.equal(local,1);assert.equal(remote,0);
document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));assert.equal(local,2);assert.equal(remote,1);
document.dispatchEvent(new Event('visibilitychange'));assert.equal(local,2);assert.equal(remote,1);
localStorage.setItem=()=>{throw new Error('Storage denied');};assert.doesNotThrow(notifyTaskChange);assert.equal(local,3);
stop();stopRemote();emit(TASK_CHANGE_KEY);notifyTaskChange();assert.equal(local,3);assert.equal(remote,1);
console.log('PASS: signal only, unrelated storage ignored, 30 hidden changes coalesce to one refresh, no extra visibility reads, local notification survives blocked storage, subscriptions clean up.');
