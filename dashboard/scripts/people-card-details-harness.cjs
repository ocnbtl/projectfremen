const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const app=path.resolve(__dirname,'..'),out=process.env.CONTROL_QA_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'people-details-'));
const ts=require('typescript');require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {organizationCategory,occupationLabel,interactionTimeLabel}=require('../lib/modules/people/directory-presentation.ts');
const org={id:'org',subjects:[],profile:{organizationType:'Business'}};
assert.equal(organizationCategory(org,[{id:'area',tags:['Area'],linkedRefs:[{module:'people',objectId:'org'}]}]),'Organization');
assert.equal(organizationCategory({...org,profile:{organizationType:'University / School'}}),'School');
assert.equal(organizationCategory({...org,profile:{organizationType:'Pub'}}),'Food');
assert.equal(organizationCategory({...org,profile:{organizationType:'Airport'}}),'Travel');
assert.equal(organizationCategory({...org,profile:{locations:[{placeId:'p'}]}},[{id:'p',tags:['Food'],linkedRefs:[]}]),'Food');
assert.equal(occupationLabel({profile:{occupations:[{status:'past',title:'Old role'},{status:'current',title:'Designer'}]}}),'Designer');
assert.equal(interactionTimeLabel('23:15','00:15'),'11:15 PM – 12:15 AM (+1 day)');
assert.equal(interactionTimeLabel(undefined,'13:00'),'Until 1:00 PM');assert.equal(interactionTimeLabel('24:00',undefined),'');
const {chromium}=require('@playwright/test'),data=fs.mkdtempSync(path.join(os.tmpdir(),'people-details-data-')),base='http://localhost:3236',secret='isolated-people-details';
const server=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3236'],{cwd:app,env:{...process.env,ADMIN_PASSWORD:'fixture',ADMIN_SESSION_SECRET:secret,FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',RESEND_API_KEY:'',VERCEL:''},stdio:'ignore'});
let browser;const expectedTimes=new Map();
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true});
 for(const [viewportName,viewport] of [['desktop',{width:1440,height:1000}],['tablet',{width:820,height:1180}],['mobile',{width:390,height:844}]]) {
  const context=await browser.newContext({viewport}),payload=`v1.${Date.now()+3600000}.${crypto.randomBytes(12).toString('base64url')}`;
  await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'cards-csrf',url:base}]);
  const headers={origin:base,'x-csrf-token':'cards-csrf'},post=async(body)=>{const r=await context.request.post(base+'/api/personal/records',{headers,data:body});assert(r.ok(),await r.text());return r.json();};
  if(viewportName==='desktop') {
   const people=[];
   for(let i=0;i<6;i++) {const title=`Person ${i}`;const r=await post({domain:'family',className:'person',title,status:i%2?'inactive':'active',starred:i%2===0,subjects:['Friend'],time:{nextReview:i%2?'2026-12-01':undefined},profile:{primaryOccupation:i===0?'Industrial designer with a longer occupation title':'Designer',context:i%2?'A useful description of this person.':''}});people.push(r.items.find(x=>x.title===title).id);}
   for(const [title,type] of [['Example school','University / School'],['Example cafe','Restaurant'],['Example agency','Agency']])await post({domain:'family',className:'org',title,status:'active',areas:['Relationships'],profile:{organizationType:type,associatedPeople:people.slice(0,4)}});
   for(let i=0;i<6;i++) {const start=['09:00','23:15',undefined,'14:30',undefined,'10:00'][i],end=['10:00','00:15','13:00',undefined,undefined,'11:30'][i];const title=i===0?'A longer interaction title that wraps over more than one line without moving the timing row':`Interaction ${i}`;
    const r=await post({domain:'notes-docs',className:'interaction',title,status:'completed',body:i%2?'A longer conversation summary that should stay inside its own row, wrap cleanly, and never displace the date, time range, or interaction type.':'',interaction:{participantIds:people.slice(0,i%3+1),kind:['catch-up','call','meeting','memory','note','ran-into'][i],occurredOn:'2026-10-20',startTime:start,endTime:end,endNextDay:i===1,updatesLastContact:true}});expectedTimes.set(r.items.find(x=>x.title===title).id,interactionTimeLabel(start,end));
   }
  }
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  for(const kind of ['all','organizations','interactions']) {
   await page.goto(base+'/admin/people?sidebar='+kind,{waitUntil:'domcontentloaded'});
   const rows=page.locator(kind==='interactions'?'.people-interaction-row':'.people-directory-row');await rows.first().waitFor();
   for(const mode of ['comfortable','compact','grid']) {
    const cycle=page.locator('.people-view-cycle');for(let i=0;i<3&&!(await cycle.innerText()).toLowerCase().includes(mode);i++)await cycle.click();await page.waitForTimeout(350);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,kind+' page overflow');
    assert(await rows.evaluateAll(rows=>rows.every(row=>row.scrollWidth<=row.clientWidth)),kind+' card overflow');
    if(kind==='interactions') {
     for(const [id,time] of expectedTimes) {const card=page.locator(`[data-interaction-id="${id}"]`);assert.equal(await card.locator('.people-interaction-row-date small').count(),time?1:0);if(time)assert.equal(await card.locator('.people-interaction-row-date small').innerText(),time);}
     const positions=await rows.evaluateAll(rows=>rows.map(row=>{const r=row.getBoundingClientRect(),f=row.querySelector('.people-interaction-row-footer').getBoundingClientRect(),identity=row.querySelector('.people-interaction-row-identity').getBoundingClientRect();return {y:f.y-r.y,overlap:identity.bottom>f.y+1,heights:[...row.querySelectorAll('.people-interaction-row-date > *')].map(el=>el.getBoundingClientRect().height)};}));
     assert(positions.every(p=>!p.overlap&&p.heights.every(h=>h===28)),JSON.stringify(positions));assert(positions.every(p=>Math.abs(p.y-positions[0].y)<1),'Timing rows align');
    } else {
     assert.equal(await rows.locator('.people-row-dates:not(.people-row-contact .people-row-dates)').count(),0);
     if(kind==='all')assert.equal(await rows.locator('.people-row-occupation').count(),mode==='compact'?0:6);
     else {assert.equal(await rows.locator('.people-row-linked').count(),3);assert(!((await rows.allTextContents()).join(' ').includes('Relationships')));assert.equal(await rows.locator('.people-row-linked .people-profile-photo').first().evaluate(el=>el.getBoundingClientRect().width),24);}
    }
    await page.screenshot({path:path.join(out,`people-details-${kind}-${mode}-${viewportName}.png`)});console.log(`${kind} ${mode} ${viewportName}: PASS`);
   }
   await rows.first().click();if(kind==='interactions'){await page.getByRole('heading',{name:/A longer interaction|Interaction/}).first().waitFor();await page.getByRole('button',{name:'Back to interactions',exact:true}).click();}else{await page.getByRole('button',{name:/Back to/}).first().click();}await rows.first().waitFor();
  }
  assert.deepEqual(errors,[]);await context.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill();});
