const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),assert=require('assert/strict');
const {spawn}=require('child_process');
const app=path.resolve(__dirname,'..'),{chromium}=require('@playwright/test');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'fremen-account-media-')),base='http://localhost:3227',secret='isolated-account-secret';
const server=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3227'],{cwd:app,env:{...process.env,ADMIN_PASSWORD:'isolated-password',ADMIN_SESSION_SECRET:secret,FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',VERCEL:''},stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.equal((await fetch(base+'/api/media/files?record=none&chunk=0')).status,401);
 browser=await chromium.launch({headless:true});
 for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport}),payload='v1.'+(Date.now()+3600000)+'.'+crypto.randomBytes(12).toString('base64url');
  await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'isolated-csrf-token',url:base}]);
  const headers={'x-csrf-token':'isolated-csrf-token',origin:base},page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',async r=>{if(r.url().includes('/api/media/files')&&r.status()>=400) console.log('Media response',r.status(),await r.text());});
  assert.equal((await context.request.post(base+'/api/media/files',{data:{action:'chunk'}})).status(),403);
  await page.goto(base+'/admin/media');await page.locator('.work-surface[aria-busy=false]').waitFor();
  const buffer=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#c9ded1"/><circle cx="400" cy="250" r="100" fill="#183d53"/></svg>');
  await page.locator('input[type=file]').setInputFiles({name:'Account '+name+'.svg',mimeType:'image/svg+xml',buffer});
  const row=page.getByRole('button',{name:new RegExp('Account '+name+'\\.svg')});await row.waitFor({timeout:30000}).catch(async e=>{console.log(await page.locator('body').innerText());throw e;});await row.click();
  await page.locator('.media-detail-page img').waitFor();
  await page.getByRole('textbox',{name:'Description',exact:true}).fill('Available while Vault is locked');
  await page.getByRole('button',{name:'Save details',exact:true}).click();
  await page.waitForTimeout(250);await page.reload();await page.getByRole('button',{name:new RegExp('Account '+name+'\\.svg')}).click();
  assert.equal(await page.getByRole('textbox',{name:'Description',exact:true}).inputValue(),'Available while Vault is locked');
  await page.locator('.media-detail-page img').waitFor();
  const download=await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:'Download',exact:true}).click()]);
  assert.deepEqual(fs.readFileSync(await download[0].path()),buffer);
  const records=(await (await context.request.get(base+'/api/personal/records')).json()).items;
  const record=records.find(item=>item.title==='Account '+name+'.svg');assert(record.mediaProfile.accountFile);
  const chunk=await context.request.get(base+'/api/media/files?record='+record.id+'&chunk=0');assert.deepEqual(await chunk.body(),buffer);assert.match(chunk.headers()['cache-control'],/private.*no-store/);
  assert.equal((await context.request.get(base+'/api/media/files?record='+record.id+'&chunk=5')).status(),404);
  const stale=await context.request.post(base+'/api/media/files',{headers,data:{action:'edit',recordId:record.id,expectedUpdatedAt:'2000-01-01T00:00:00Z',profile:record.mediaProfile}});assert(!stale.ok());
  const invalid=await context.request.post(base+'/api/media/files',{headers,data:{action:'chunk',id:'../../escape',index:0,data:'YQ=='}});assert.equal(invalid.status(),400);
  const missing=await context.request.post(base+'/api/media/files',{headers,data:{action:'finish',name:'Incomplete',file:{id:crypto.randomUUID(),sha256:'a'.repeat(64),byteLength:1,chunkSize:1048576,totalChunks:1}}});assert.equal(missing.status(),400);
  await page.getByRole('button',{name:'Archive',exact:true}).click();await page.waitForTimeout(250);assert.equal(await page.getByRole('button',{name:new RegExp('Account '+name+'\\.svg')}).count(),0);
  await page.getByRole('button',{name:'Filter',exact:true}).click();await page.getByRole('button',{name:'Archive',exact:true}).click();
  await page.getByRole('button',{name:new RegExp('Account '+name+'\\.svg')}).click();await page.getByRole('button',{name:'Restore',exact:true}).click();
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  console.log('PASS '+name+' locked-Vault upload, preview, edit, reload, byte-identical download, archive/restore, authentication, CSRF, bounds and stale-write protection');
  if(name==='desktop') {
   const target=path.join(data,'personal-records.json'), all=JSON.parse(fs.readFileSync(target,'utf8'));
   const original=structuredClone(record), originalId='personal-'+crypto.randomUUID(), originalChunkSize=1600000;
   original.id=originalId;original.title='Encrypted original';delete original.mediaProfile.accountFile;
   const prefix=Buffer.from('unigentamos-media-root-v1:'+buffer.length+':'+originalChunkSize+':');
   original.mediaProfile.manifest={...original.mediaProfile.manifest,format:'unigentamos-vault-media-v1',digestAlgorithm:'chunk-root-v1',objectId:crypto.randomUUID(),mediaId:crypto.randomUUID(),chunkSize:originalChunkSize,contentRoot:crypto.createHash('sha256').update(Buffer.concat([prefix,crypto.createHash('sha256').update(buffer).digest()])).digest('hex')};
   all.push(original);fs.writeFileSync(target,JSON.stringify(all));
   const id=crypto.randomUUID();let r=await context.request.post(base+'/api/media/files',{headers,data:{action:'chunk',id,index:0,data:buffer.toString('base64')}});assert(r.ok(),await r.text());
   r=await context.request.post(base+'/api/media/files',{headers,data:{action:'finish',recordId:originalId,expectedUpdatedAt:original.updatedAt,file:{id,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),byteLength:buffer.length,chunkSize:1048576,totalChunks:1}}});assert(r.ok(),await r.text());
   const copy=(await r.json()).record;assert.deepEqual(copy.mediaProfile.manifest,original.mediaProfile.manifest);assert(copy.mediaProfile.accountFile);assert.deepEqual(copy.mediaProfile.linkedRefs,original.mediaProfile.linkedRefs);
   const bad=Buffer.alloc(buffer.length,65),bid=crypto.randomUUID();r=await context.request.post(base+'/api/media/files',{headers,data:{action:'chunk',id:bid,index:0,data:bad.toString('base64')}});assert(r.ok());
   r=await context.request.post(base+'/api/media/files',{headers,data:{action:'finish',recordId:originalId,expectedUpdatedAt:copy.updatedAt,file:{id:bid,sha256:crypto.createHash('sha256').update(bad).digest('hex'),byteLength:bad.length,chunkSize:1048576,totalChunks:1}}});assert.equal(r.status(),400);assert.match((await r.json()).error,/does not match/);
   console.log('PASS per-file conversion preserves encrypted identity and rejects mismatched copies');
  }
  await context.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
