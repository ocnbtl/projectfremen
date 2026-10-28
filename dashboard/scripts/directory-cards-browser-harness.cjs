const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const app=path.resolve(__dirname,'..'),out=process.env.CONTROL_QA_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'directory-cards-'));
const {chromium}=require(path.join(app,'node_modules/@playwright/test'));
const data=fs.mkdtempSync(path.join(os.tmpdir(),'directory-data-')),base='http://localhost:3234',secret='isolated-directory-qa';
const server=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3234'],{cwd:app,env:{...process.env,ADMIN_PASSWORD:'fixture',ADMIN_SESSION_SECRET:secret,FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',RESEND_API_KEY:'',VERCEL:''},stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true});
 for(const [view,viewport] of [['desktop',{width:1440,height:1000}],['tablet',{width:820,height:1180}],['mobile',{width:390,height:844}]]) {
  const context=await browser.newContext({viewport}),payload=`v1.${Date.now()+3600000}.${crypto.randomBytes(12).toString('base64url')}`;
  await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'directory-csrf',url:base}]);
  await context.route('https://fixture.example/**',route=>route.request().url().includes('missing')?route.fulfill({status:404,body:''}):route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150"><rect width="300" height="150" fill="#133c5e"/><circle cx="150" cy="75" r="56" fill="#8dc35e"/></svg>'}));
  await context.route('**/api/people/photos/**',route=>route.request().url().endsWith('1')?route.fulfill({status:404,body:''}):route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150"><rect width="300" height="150" fill="#133c5e"/><circle cx="150" cy="75" r="56" fill="#8dc35e"/></svg>'}));
  if(view==='desktop')for(const kind of ['org','resource'])for(let i=0;i<7;i++) {
   const imageUrl=i%3===0?'https://fixture.example/logo.svg':i%3===1?'https://fixture.example/missing.svg':'';
   const response=await context.request.post(base+'/api/personal/records',{headers:{origin:base,'x-csrf-token':'directory-csrf'},data:{domain:kind==='org'?'family':'notes-docs',className:kind,title:(kind==='org'?'Organization ':'Resource ')+(i===0?'International Association for Community Research and Education':String(i)),status:i%3===1?'inactive':'active',starred:i%2===0,subjects:kind==='org'&&i%2?['University']:[],body:i%2?'A concise description of the work and the context for keeping this record.':'',url:kind==='resource'&&i%2?'https://fixture.example/reference':'',profile:kind==='org'?{organizationType:'School',photoUrl:imageUrl?'/api/people/photos/personal-00000000-0000-0000-0000-'+(i%3===1?'000000000001':'000000000000'):'',context:i%2?'Education and community research.':''}:{},resourceProfile:kind==='resource'?{version:1,resourceType:['tool','contract_invoice','unknown'][i%3],metadata:{imageUrl},lifecycle:i%3===1?'unavailable':'active'}:undefined}});
   assert(response.ok(),await response.text());
  }
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const kind of ['organizations','resources']) {
   await page.goto(base+(kind==='organizations'?'/admin/people?sidebar=organizations':'/admin/resources'),{waitUntil:'domcontentloaded'});
   const list=page.locator(kind==='organizations'?'.people-directory-list':'.resource-directory');await list.waitFor();
   const rows=list.locator(kind==='organizations'?'.people-directory-row':'.resource-directory-card');assert.equal(await rows.count(),7);
   for(const mode of ['comfortable','compact','grid']) {
    const cycle=page.locator('.directory-view-cycle');
    for(let i=0;i<3&&!(await cycle.getAttribute('aria-label')).toLowerCase().includes(': '+mode+'.');i++)await cycle.click();
    await page.waitForTimeout(300);
    const columns=await list.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
    assert.equal(columns,view==='desktop'?(mode==='grid'?3:2):mode==='grid'?2:1);
    const picture=kind==='organizations'?'.people-row-avatar':'.resource-card-picture',tags=kind==='organizations'?'.people-row-tags':'.resource-card-tags';
    const measurements=await rows.evaluateAll((rows,{picture,tags})=>rows.map(row=>{const r=row.getBoundingClientRect(),p=row.querySelector(picture).getBoundingClientRect(),t=row.querySelector(tags).getBoundingClientRect();return {picture:[p.width,p.height],tagX:t.x-r.x,tagY:t.y-r.y,overflow:row.scrollWidth>row.clientWidth};}),{picture,tags});
    assert(measurements.every(m=>m.picture[0]===(view==='mobile'&&mode==='grid'?44:view==='mobile'&&kind==='organizations'&&mode==='compact'?40:mode==='compact'?56:68)&&m.picture[1]===m.picture[0]),kind+' picture sizes');
    assert(measurements.every(m=>!m.overflow),kind+' card overflow');
    if(view==='desktop'||mode==='grid')assert(measurements.every(m=>Math.abs(m.tagX-measurements[0].tagX)<1&&Math.abs(m.tagY-measurements[0].tagY)<1),kind+' metadata slots');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(out,`directory-${kind}-${mode}-${view}.png`)});
    if(kind==='resources')for(const card of await rows.all()) {
     const tag=await card.locator('.resource-card-tags').boundingBox(),pin=await card.locator('.resource-card-pin button').boundingBox();
     assert(Math.abs(tag.y+tag.height/2-pin.y-pin.height/2)<1,'Pin center '+JSON.stringify({tag,pin}));
     assert.equal(await card.locator('button button').count(),0);
    }
    await page.screenshot({path:path.join(out,`directory-${kind}-${mode}-${view}.png`)});
    console.log(`${kind} ${mode} ${view}: alignment PASS`);
   }
   if(kind==='resources') {
    const first=rows.first(),pin=first.getByRole('button',{name:/^(Unpin|Pin) resource$/});const before=await pin.getAttribute('aria-label');
    await pin.click();await page.waitForTimeout(350);assert.notEqual(await pin.getAttribute('aria-label'),before);assert(await list.isVisible(),'Pin must not open detail');
    await first.getByRole('button',{name:/^Open /}).focus();await page.keyboard.press('Enter');await page.locator('.workspace-detail-page').waitFor();
    await page.waitForTimeout(600);
    await page.getByRole('button',{name:'Back',exact:true}).first().click();await list.waitFor();await page.waitForTimeout(350);
    assert(await first.getByRole('button',{name:/^Open /}).evaluate(el=>el===document.activeElement),'Return focus');
    await page.reload();await list.waitFor();assert.equal(await rows.first().getByRole('button',{name:/^(Unpin|Pin) resource$/}).getAttribute('aria-label'),before==='Pin resource'?'Unpin resource':'Pin resource');
    console.log(`${view}: pin persistence, keyboard open, return focus PASS`);
   }
  }
  assert.deepEqual(errors,[]);await context.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill();});
