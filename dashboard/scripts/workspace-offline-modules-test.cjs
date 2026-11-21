const {readFileSync}=require("node:fs");
const assert=require("node:assert/strict");
const ts=require("typescript");
require.extensions[".ts"]=(module,file)=>module._compile(ts.transpileModule(readFileSync(file,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,file);
const {BrowserVaultEngine}=require("../lib/local-first/browser-engine.ts");
const {offlineModuleFor}=require("../lib/local-first/offline-modules.ts");
async function verify(){
  const originals=new Set(["already-offline"]);
  const device={
    excludedOfflineModules:async()=>["finance"],
    readObject:async key=>originals.has(key),
    mirrorCanonicalObject:async({objectId})=>{originals.add(objectId);return{changed:true};}
  };
  const mirror=(key,id,excluded)=>BrowserVaultEngine.prototype.mirrorSelectedModule.call(device,key,{objectId:id,objectKind:"finance",fields:{}},excluded);
  assert.equal(await mirror("finance:accounts:new","new-file"),false);
  assert.equal(originals.has("new-file"),false);
  assert.equal(await mirror("finance:accounts:existing","already-offline"),true);
  assert.equal(await mirror("personal-records:note:draft","draft"),true);
  assert.equal(await mirror("finance:accounts:new","new-file",[]),true);
  assert.equal(offlineModuleFor("personal-records:org:demo"),"people");
  assert.equal(offlineModuleFor("personal-ops:goals:demo"),"personal");
  console.log("Offline capture honors module choices, retains existing records and resumes capture when re-enabled.");
}
verify().catch(error=>{console.error(error);process.exitCode=1;});
