const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),assert=require('assert/strict'),{spawn}=require('child_process');
const app=path.resolve(__dirname,'..'),out=process.env.CONTROL_QA_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(),'fremen-control-screenshots-'));
const {chromium}=require(path.join(app,'node_modules/@playwright/test'));
const data=fs.mkdtempSync(path.join(os.tmpdir(),'fremen-control-qa-')),base='http://localhost:3231',secret='control-qa-secret';
const server=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3231'],{cwd:app,env:{...process.env,TZ:'UTC',ADMIN_PASSWORD:'qa-password',ADMIN_SESSION_SECRET:secret,FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',RESEND_API_KEY:'',VERCEL:''},stdio:'ignore'});
let browser;
(async()=>{
for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
browser=await chromium.launch({headless:true});
for(const [view,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
const context=await browser.newContext({viewport,timezoneId:'America/New_York'}),payload='v1.'+(Date.now()+3600000)+'.'+crypto.randomBytes(12).toString('base64url');
await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'control-qa-csrf',url:base}]);
const headers={'x-csrf-token':'control-qa-csrf',origin:base};
if(view==='desktop') {
for(let i=0;i<8;i++)for(const kind of ['person','resource']) {const r=await context.request.post(base+'/api/personal/records',{headers,data:{domain:kind==='person'?'family':'notes-docs',className:kind,title:kind==='person'?['Alex Morgan','Jordan Lee','Sam Rivera','Taylor Kim','Cameron Park','Avery Jordan','Casey Lee','Robin Taylor'][i]:'Design resource '+(i+1),status:'active',body:'Practical reference for our next project.',...(kind==='person'?{profile:{context:'A thoughtful collaborator on community projects and design. We met through university and enjoy exchanging ideas.',groups:['Friend']}}:{})}});assert(r.ok(),await r.text());}
const r=await context.request.post(base+'/api/personal/records',{headers,data:{domain:'notes-docs',className:'idea',title:'Control QA note',status:'active'}});assert(r.ok());
}
const task=await context.request.post(base+'/api/personal/ops',{headers,data:{family:'followUps',input:{title:'Calendar follow-up '+view,followUpType:'other',context:'Fixture task',lifecycle:'active',followUpState:'open',dueAt:'2026-10-25',priority:'medium'}}});assert(task.ok(),await task.text());const taskData=await task.json();
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(page.url()+' '+e.message));
for(const module of ['people','notes','projects','media','reviews','resources','personal','finance']){
await page.goto(base+'/admin/'+module,{waitUntil:'domcontentloaded'});await page.locator('.workspace-topnav').waitFor();await page.waitForTimeout(500);
const input=page.locator('.workspace-topnav input').first();
if(await input.count()){await input.focus();await page.waitForTimeout(250);const focus=await input.evaluate(el=>({shadow:getComputedStyle(el).boxShadow,outline:getComputedStyle(el).outlineStyle}));assert.equal(focus.shadow,'none',module+' double focus ring');assert.equal(focus.outline,'none',module+' native outline');}
if(module==='people'){
assert.equal(await page.locator('.people-primary-search .people-search-controls').count(),0);
for(const mode of ['Comfortable','Compact','Grid']){const button=page.getByRole('button',{name:new RegExp('^View: '+mode)});await button.waitFor();assert((await button.locator('span').last().boundingBox()).width>20,'Current view label must remain readable');await page.screenshot({path:path.join(out,`controls-people-${mode}-${view}.png`)});const list=page.locator('.people-directory-list');assert(!/\bN\/A\b/.test(await list.innerText()));const cols=await list.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);if(view==='desktop')assert.equal(cols,mode==='Comfortable'?1:mode==='Compact'?2:5);await button.click();}
await page.getByRole('button',{name:'Show sorting',exact:true}).click();assert(await page.getByRole('menu',{name:'Sort people'}).isVisible());await page.keyboard.press('Escape');
}
if(module==='notes'){const sort=page.getByRole('combobox',{name:'Sort Notes'});await sort.click();const option=page.getByRole('option',{name:'Title',exact:true});await option.click();assert.equal(await sort.getAttribute('data-value'),'title');await sort.click();await page.getByRole('listbox',{name:'Sort Notes'}).waitFor();await page.waitForTimeout(250);await page.screenshot({path:path.join(out,`controls-notes-sort-${view}.png`)});await page.keyboard.press('Escape');}
if(module==='resources') {for(const mode of ['comfortable','compact','grid']){const button=page.getByRole('button',{name:'View: '+mode,exact:true});await button.waitFor();await page.screenshot({path:path.join(out,`controls-resources-${mode}-${view}.png`)});await button.click();}await page.locator('summary[aria-label="Sort Resources"]').click();await page.getByRole('menu',{name:'Sort Resources'}).getByRole('button',{name:'Title',exact:true}).click();}
if(module==='finance' && view==='desktop') {
 await page.getByRole('button',{name:'Add account',exact:true}).first().click();
 const dialog=page.getByRole('dialog',{name:'Add account'});
 await dialog.getByLabel('Account name',{exact:true}).fill('Fixture savings');
 await dialog.getByRole('combobox',{name:'Type',exact:true}).click();
 await page.getByRole('option',{name:'Savings',exact:true}).click();
 assert.equal(await dialog.locator('select[name="accountKind"]').inputValue(),'Savings');
 await dialog.getByRole('button',{name:'Save',exact:true}).click();
 await dialog.waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Record transaction',exact:true}).click();
 const transaction=page.getByRole('dialog',{name:'Record transaction'});
 const account=transaction.getByRole('combobox',{name:'Account',exact:true});
 assert.match(await account.innerText(),/Fixture savings/);
 await account.click();await page.getByRole('option',{name:/Fixture savings/}).waitFor();await page.keyboard.press('Escape');
 await transaction.getByLabel('Merchant or source',{exact:true}).fill('Fixture purchase');
 await transaction.getByLabel('Amount',{exact:true}).fill('12.50');
 await transaction.getByRole('button',{name:'Save',exact:true}).click();await transaction.waitFor({state:'hidden'});
 console.log('Finance custom dropdowns retain options, defaults, and submitted values PASS');
}
if(module==='personal'){await page.locator('.workspace-topnav').getByRole('button',{name:view==='mobile'?'Views':'Personal',exact:true}).click();const menu=page.locator('.workspace-nav-menu[data-state="open"]');for(const name of ['Passwords','Lists','Travel','Personal build','Car','Style guide','Dog'])assert(await menu.getByRole('link',{name,exact:true}).isVisible(),name+' missing');await page.screenshot({path:path.join(out,`controls-personal-${view}.png`)});await page.keyboard.press('Escape');}
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,module+' overflow');console.log(module+' '+view+' PASS');
}
await page.goto(base+'/admin/calendar?date=2026-10-25',{waitUntil:'domcontentloaded'});
const complete=page.getByRole('button',{name:'Complete Calendar follow-up '+view,exact:true}).first();await complete.waitFor();await page.screenshot({path:path.join(out,`controls-calendar-task-${view}.png`)});await complete.click();await page.getByText('Follow-up completed',{exact:true}).waitFor();
const state=await (await context.request.get(base+'/api/personal/ops')).json();assert(state.state.followUps.some(x=>x.title==='Calendar follow-up '+view&&x.followUpState==='complete'));
const planning=await(await context.request.get(base+'/api/planning')).json();assert(!planning.state.events.some(x=>x.title==='Calendar follow-up '+view));assert.equal(planning.workEvents.filter(x=>x.title==='Calendar follow-up '+view).length,1);
assert.deepEqual(errors,[]);console.log('Calendar task writes back to original without duplication: '+view+' PASS');await context.close();
}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill();});
