const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {safeLoginPath}=require('../lib/login-redirect.ts');
const {getLoginRateLimitKey}=require('../lib/audit-log.ts');
const {checkLoginAllowance,recordLoginResult}=require('../lib/login-rate-limit.ts');
const {buildSignedAdminSessionToken,isSignedAdminSessionTokenValid}=require('../lib/auth.ts');
const {fetchResource}=require('../lib/server/resource-fetch.ts');
(async()=>{
 for(const value of ['//evil.example','/\\evil.example','/\t/evil.example','https://evil.example'])assert.equal(safeLoginPath(value,'/'),'/');
 assert.equal(safeLoginPath('/admin/map?view=saved','/'),'/admin/map?view=saved');
 for(let i=0;i<8;i++){const key=getLoginRateLimitKey(new Request('https://app.example/api/admin/login',{headers:{'x-vercel-forwarded-for':'198.51.100.7','user-agent':`agent-${i}`}}));assert.equal(key,'198.51.100.7');recordLoginResult(key,false);}
 assert.equal(checkLoginAllowance(getLoginRateLimitKey(new Request('https://app.example',{headers:{'x-vercel-forwarded-for':'198.51.100.7','user-agent':'entirely-new'}}))).allowed,false);
 const token=buildSignedAdminSessionToken('test-secret',3600);assert.ok(isSignedAdminSessionTokenValid(token,'test-secret'));assert.equal(isSignedAdminSessionTokenValid(token,'other-secret'),false);assert.equal(isSignedAdminSessionTokenValid(buildSignedAdminSessionToken('test-secret',-1),'test-secret'),false);assert.equal(isSignedAdminSessionTokenValid(require('node:crypto').createHash('sha256').update('admin-session:test-secret').digest('hex'),'test-secret'),false);
 let calls=0,lookups=0;
 const result=await fetchResource('https://public.example/',false,{resolve:async()=>{lookups++;return [{address:'93.184.216.34',family:4}]},request:async(target,_signal,_limit,format)=>{calls++;assert.equal(target.address.address,'93.184.216.34');assert.equal(format,'headers');return {status:404,headers:{'content-type':'application/pdf'},html:''}}});
 assert.equal(result.response.status,404);assert.equal(calls,1);assert.equal(lookups,1);
 await assert.rejects(fetchResource('https://public.example/',true,{resolve:async()=>[{address:'93.184.216.34',family:4}],request:async()=>({status:302,headers:{location:'http://127.0.0.1/'},html:''})}),/public website/);
 await assert.rejects(fetchResource('https://mixed.example/',true,{resolve:async()=>[{address:'93.184.216.34',family:4},{address:'10.0.0.1',family:4}],request:async()=>{throw Error('Must never fetch')}}),/public website/);
 await assert.rejects(fetchResource('https://slow.example/',true,{timeoutMs:10,resolve:async()=>new Promise(()=>{})}),/timed out/);
 const html=await fetchResource('https://public.example/',true,{resolve:async()=>[{address:'93.184.216.34',family:4}],request:async()=>({status:200,headers:{'content-type':'text/html'},html:'<title>Public page</title>'})});assert.equal(await html.response.text(),'<title>Public page</title>');
 console.log('PASS security regressions: header-independent throttle, local redirects, expiring signatures, pinned destinations, redirect/private-IP denial, metadata and health checks, DNS timeout.');
})().catch(e=>{console.error(e);process.exitCode=1});
