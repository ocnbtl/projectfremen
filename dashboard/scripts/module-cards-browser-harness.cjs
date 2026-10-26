const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const app=path.resolve(__dirname,'..'),out=process.env.CONTROL_QA_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'module-cards-'));
const {chromium}=require(path.join(app,'node_modules/@playwright/test'));
const data=fs.mkdtempSync(path.join(os.tmpdir(),'module-cards-data-')),base='http://localhost:3235',secret='isolated-module-cards';
const server=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3235'],{cwd:app,env:{...process.env,ADMIN_PASSWORD:'fixture',ADMIN_SESSION_SECRET:secret,FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',RESEND_API_KEY:'',VERCEL:''},stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true});
 for(const [view,viewport] of [['desktop',{width:1440,height:1000}],['tablet',{width:820,height:1180}],['mobile',{width:390,height:844}]]) {
  const context=await browser.newContext({viewport}),payload=`v1.${Date.now()+3600000}.${crypto.randomBytes(12).toString('base64url')}`;
  await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'cards-csrf',url:base}]);
  const headers={origin:base,'x-csrf-token':'cards-csrf'};
  const post=async(route,body)=>{const r=await context.request.post(base+route,{headers,data:body});assert(r.ok(),await r.text());return r.json();};
  if(view==='desktop')for(let i=0;i<6;i++) {
   const title=i===0?'International community research and education programme with a longer title':`Example ${i}`,body=i%2?'Useful context about this item and its purpose. This should wrap cleanly without shifting the status and tag positions.':'';
   await post('/api/personal/records',{domain:'notes-docs',className:['idea','decision','meeting'][i%3],title,body,status:i%2?'draft':'active'});
   await post('/api/projects',{operation:'create',family:'projects',input:{name:title,description:body,lifecycle:i%2?'active':'planned',starred:i%2===0}});
   const bytes=await require(path.join(app,"node_modules/sharp"))(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="${i%2?'#c9ded1':'#dfe0f3'}"/><circle cx="400" cy="250" r="100" fill="#183d53"/></svg>`)).png().toBuffer(),id=crypto.randomUUID();
   await post('/api/media/files',{action:'chunk',id,index:0,data:bytes.toString('base64')});
   await post('/api/media/files',{action:'finish',file:{id,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),byteLength:bytes.length,chunkSize:1048576,totalChunks:1},name:title+'.png',mimeType:'image/png'});
  }
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const kind of ['projects','notes','media']) {
   await page.goto(base+'/admin/'+kind,{waitUntil:'domcontentloaded'});
   const list=page.locator('.resource-directory').first(),rows=list.locator('.resource-directory-card');await rows.first().waitFor();assert((await rows.count())>=6);
   for(const mode of ['comfortable','compact','grid',...(kind==='media'?['gallery']:[])]) {
    await page.getByRole('combobox',{name:kind==='projects'?'Project layout':kind==='notes'?'Notes layout':'Media view',exact:true}).click();
    await page.getByRole('option',{name:mode[0].toUpperCase()+mode.slice(1),exact:true}).click();await page.waitForTimeout(350);
    const columns=await list.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
    assert.equal(columns,view==='desktop'?(['grid','gallery'].includes(mode)?3:2):view==='tablet'&&['grid','gallery'].includes(mode)?2:1);
    const metrics=await rows.evaluateAll(rows=>rows.map(row=>{const r=row.getBoundingClientRect(),p=row.querySelector('.resource-card-picture').getBoundingClientRect(),t=row.querySelector('.resource-card-tags').getBoundingClientRect();return {picture:[p.width,p.height],tagX:t.x-r.x,tagY:t.y-r.y,overflow:row.scrollWidth>row.clientWidth};}));
    if(mode!=='gallery')assert(metrics.every(m=>m.picture[0]===(mode==='compact'?56:68)&&m.picture[1]===m.picture[0]),kind+' pictures');
    assert(metrics.every(m=>!m.overflow),kind+' card overflow');
    if(view==='desktop'||['grid','gallery'].includes(mode))assert(metrics.every(m=>Math.abs(m.tagX-metrics[0].tagX)<1&&Math.abs(m.tagY-metrics[0].tagY)<1),kind+' fixed slots '+JSON.stringify(metrics));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,kind+' page overflow');
    assert.equal(await rows.locator('button button').count(),0);
    if(kind==='media')await page.waitForFunction(()=>document.querySelector('.resource-card-picture img')?.complete);
    await page.screenshot({path:path.join(out,`modules-${kind}-${mode}-${view}.png`)});console.log(`${kind} ${mode} ${view}: PASS`);
   }
   if(kind==='projects') {
    const star=rows.first().locator('.resource-card-pin button'),before=await star.getAttribute('aria-pressed');
    await star.click();await page.waitForTimeout(500);assert.notEqual(await star.getAttribute('aria-pressed'),before);assert(await list.isVisible());
    await page.reload();await rows.first().waitFor();assert.equal(await rows.first().locator('.resource-card-pin button').getAttribute('aria-pressed'),before==='true'?'false':'true');
    await rows.first().getByRole('button',{name:/^Open /}).focus();await page.keyboard.press('Enter');await page.locator('.workspace-detail-page').waitFor();
    await page.waitForTimeout(700);
    await (view==='mobile'?page.getByRole('link',{name:'Back to projects',exact:true}):page.getByRole('button',{name:'Back',exact:true})).first().click();await rows.first().waitFor();console.log(`${view}: Project star persistence and keyboard open/back PASS`);
   }
   if(kind==='notes') {
    await rows.first().getByRole('button',{name:/^Open /}).click();await page.locator('.workspace-detail-page').waitFor();await page.getByRole('button',{name:'Back',exact:true}).first().click();await rows.first().waitFor();console.log(`${view}: Note open/back PASS`);
   }
   if(kind==='media') {
    await page.getByRole('button',{name:'View options',exact:true}).click();await page.getByRole('button',{name:'Select files',exact:true}).click();await page.keyboard.press('Escape');await rows.first().getByRole('checkbox').check();assert(await list.isVisible());assert(await rows.first().getByRole('checkbox').isChecked());
    await page.getByRole('button',{name:'View options',exact:true}).click();await page.getByRole('button',{name:'Select files',exact:true}).click();await page.keyboard.press('Escape');await rows.first().getByRole('button',{name:/^Open /}).click();await page.locator('.media-detail-page img').waitFor();
    assert(await page.locator('.media-detail-page img').evaluate(img=>img.complete&&img.naturalWidth>0));console.log(`${view}: Media selection and original preview PASS`);
   }
  }
  assert.deepEqual(errors,[]);await context.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill();});
