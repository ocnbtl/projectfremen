
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),assert=require('assert/strict');
const {spawn}=require('child_process');
const app=path.resolve(__dirname,'..');
const artifactRoot=path.join(app,'output','playwright','workspace-pages');fs.mkdirSync(artifactRoot,{recursive:true});
const {chromium}=require(path.join(app,'node_modules/@playwright/test'));
const data=fs.mkdtempSync(path.join(os.tmpdir(),'fremen-workspace-pages-')),base='http://localhost:3226',secret='isolated-pages-secret';
const server=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3226'],{cwd:app,env:{...process.env,TZ:'UTC',ADMIN_PASSWORD:'isolated-password',ADMIN_SESSION_SECRET:secret,FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',RESEND_API_KEY:'',VERCEL:''},stdio:'ignore'});
let browser;
(async()=>{
for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
browser=await chromium.launch({headless:true});
for(const [name,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
 const context=await browser.newContext({viewport,timezoneId:'America/New_York'}),payload='v1.'+(Date.now()+3600000)+'.'+crypto.randomBytes(12).toString('base64url');
 await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'isolated-csrf-token',url:base}]);
 if(name==='desktop')for(const [title,className,domain] of [['Jordan Lee','person','family'],['Cedar Studio','org','family'],['Layout QA note','idea','notes-docs'],['Layout QA resource','resource','notes-docs']]){
 const r=await context.request.post(base+'/api/personal/records',{headers:{'x-csrf-token':'isolated-csrf-token',origin:base},data:{domain,title,className,status:'active'}});assert(r.ok(),await r.text());
 }
 if(name==='desktop') for(let i=0;i<45;i++){const r=await context.request.post(base+'/api/personal/records',{headers:{'x-csrf-token':'isolated-csrf-token',origin:base},data:{domain:'family',title:'Return person '+String(i).padStart(2,'0'),className:'person',status:'active'}});assert(r.ok(),await r.text());}
 const page=await context.newPage();let errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(name==='desktop') {
 for(const file of ['personal-records.json']) {
 const target=path.join(data,file);
 const fixture=JSON.parse(fs.readFileSync(target,'utf8'));
 const setBoundaryDate=value=>{if(value&&typeof value==='object'){for(const key of Object.keys(value)){if(key==='updatedAt')value[key]='2026-10-25T01:00:00.000Z';else setBoundaryDate(value[key]);}}};
 setBoundaryDate(fixture);fs.writeFileSync(target,JSON.stringify(fixture));
 }
 for(const [route,data] of [['/api/reviews/runs',{input:{cadence:'weekly',title:'Layout QA review',periodStart:'2026-10-19',periodEnd:'2026-10-25'}}],['/api/personal/life',{collection:'lists',input:{title:'Layout QA list',description:'',kind:'custom',items:[],columns:[],rows:[]}}]]) {
 const response=await context.request.post(base+route,{headers:{'x-csrf-token':'isolated-csrf-token',origin:base},data});assert(response.ok(),await response.text());
 }
 }
 for(const module of ['people','projects','notes','media','personal','reviews','resources','finance','vault']){
 await page.goto(base+(module==='vault'?'/vault':'/admin/'+module),{waitUntil:'domcontentloaded'});await page.waitForTimeout(800); if(module==='vault') await page.getByRole('heading',{name:'Connect to your vault',exact:true}).waitFor({timeout:30000});
 await page.screenshot({path:path.join(artifactRoot,'pages-'+module+'-'+name+'.png')});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,module+' overflow');
 if(module==='notes') assert(await page.getByText('Updated Oct 24',{exact:true}).isVisible());
 console.log(JSON.stringify({module,name,errors,metrics:await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,nav:[...document.querySelectorAll('.workspace-topnav')].map(e=>({w:e.clientWidth,h:e.clientHeight})),main:[...document.querySelectorAll('.module-shell__main, .people-directory-panel, [data-personal-pages]>main')].map(e=>({w:e.clientWidth,h:e.clientHeight})),buttons:[...document.querySelectorAll('main button')].filter(e=>e.getClientRects().length).map(e=>e.getAttribute('aria-label')||e.textContent.trim()).slice(0,12)}))}));
 if(['projects','notes','resources','finance','personal'].includes(module)){
 const title=module==='projects'?/Project Pint/:module==='notes'?/Layout QA note/:module==='resources'?/Layout QA resource/:module==='finance'?/Inspect selected range/:/Keep all 12/;
 const row=page.getByRole('button',{name:title}).first(); await row.click(); await page.waitForTimeout(500);
 const stage=page.locator(module==='personal'?'[data-personal-pages] > .inspector-rail':'.workspace-detail-page');
 // Mobile project rows may use their existing deep route instead.
 if(module==='projects'&&name==='mobile'){assert(page.url().includes('/admin/projects/')); await page.getByRole('link',{name:'Back to projects',exact:true}).first().click();}
 else {assert(await stage.isVisible(),module+' details did not open');assert.equal(await page.locator(module==='personal'?'[data-personal-pages]>main':'.module-shell__main').isVisible(),false); await page.screenshot({path:path.join(artifactRoot,'pages-'+module+'-detail-'+name+'.png')});await page.getByRole('button',{name:'Back',exact:true}).first().click();}
 await page.waitForTimeout(350);
}
if(module==='reviews') {
 await page.getByRole('button',{name:/Layout QA review/}).first().click();await page.waitForTimeout(300);
 assert(await page.locator('.workspace-detail-page').isVisible());await page.getByRole('button',{name:'Back',exact:true}).first().click();
}
if(module==='people'){
 await page.getByRole('searchbox',{name:'Search people',exact:true}).fill('Jordan');
 await page.getByRole('button',{name:/Jordan Lee/}).click();await page.waitForTimeout(400); await page.screenshot({path:path.join(artifactRoot,'pages-profile-'+name+'.png')});
 assert.equal(await page.locator('.people-directory-panel').isVisible(),false);
 await page.getByRole('tab',{name:'Properties',exact:true}).click();await page.waitForTimeout(300);
 await page.screenshot({path:path.join(artifactRoot,'pages-properties-'+name+'.png')});
 if(name==='desktop')assert.equal(await page.locator('.people-edit-form').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2);
 await page.getByRole('button',{name:'Cancel',exact:true}).first().click();
 await page.getByRole('button',{name:/Back to/}).click();await page.waitForTimeout(300);assert(await page.locator('.people-directory-panel').isVisible());
 assert.equal(await page.getByRole('searchbox',{name:'Search people',exact:true}).inputValue(),'Jordan');
 await page.getByRole('searchbox',{name:'Search people',exact:true}).fill('Return person');
 await page.waitForTimeout(200);
 const list=page.locator('.people-directory-panel');
 await list.evaluate(el=>{el.scrollTop=el.scrollHeight;});
 const last=page.locator('.people-directory-row-body').last(); await last.scrollIntoViewIfNeeded();
 const before=await list.evaluate(el=>el.scrollTop);
 await last.click();await page.getByRole('button',{name:/Back to/}).click();await page.waitForTimeout(400);
 assert.equal(await page.getByRole('searchbox',{name:'Search people',exact:true}).inputValue(),'Return person');
 assert(Math.abs(await list.evaluate(el=>el.scrollTop)-before)<3,'People list scroll preserved');
 assert(before>0,'Fixture exercises actual scrolling');
 await page.getByRole('searchbox',{name:'Search people',exact:true}).fill('');
 const trigger=page.locator('.workspace-topnav').getByRole('button',{name:name==='mobile'?'Views':'People',exact:true});await trigger.click();
 const menu=page.locator('.workspace-nav-menu[data-state="open"]').first();
 await menu.getByRole('button',{name:/^Interactions/}).click();
 assert(await menu.isVisible(),'View menu stays open'); await page.keyboard.press('Escape');
 assert(await page.locator('.workspace-topnav').getByRole('searchbox',{name:'Search interactions'}).isVisible());
 await page.screenshot({path:path.join(artifactRoot,'pages-interactions-'+name+'.png')});
 }
 }
 await page.goto(base+'/admin/personal/lists'); await page.getByRole('button',{name:/Layout QA list/}).click();
 await page.getByRole('textbox',{name:'List title',exact:true}).fill('Draft retained');
 await page.getByRole('button',{name:'Back to lists',exact:true}).click();
 await page.getByRole('button',{name:/Layout QA list/}).click();
 assert.equal(await page.getByRole('textbox',{name:'List title',exact:true}).inputValue(),'Draft retained');
 await page.getByRole('button',{name:'Save list',exact:true}).click();await page.waitForTimeout(300);
 await page.reload();await page.getByRole('button',{name:/Draft retained/}).click();
 assert.equal(await page.getByRole('textbox',{name:'List title',exact:true}).inputValue(),'Draft retained');
 await page.getByRole('textbox',{name:'List title',exact:true}).fill('Layout QA list');await page.getByRole('button',{name:'Save list',exact:true}).click();
 assert.deepEqual(errors,[]);
 await context.close();
}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
