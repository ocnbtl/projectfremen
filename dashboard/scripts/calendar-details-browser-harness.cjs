const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('@playwright/test'),app=path.resolve(__dirname,'..'),out=process.env.CONTROL_QA_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'calendar-details-'));
const base='http://localhost:3237',secret='isolated-calendar-details',data=fs.mkdtempSync(path.join(os.tmpdir(),'calendar-details-data-'));
const server=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3237'],{cwd:app,env:{...process.env,ADMIN_PASSWORD:'fixture',ADMIN_SESSION_SECRET:secret,FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',VERCEL:''},stdio:'ignore'});
const person={module:'people',objectType:'person',objectId:'person-fixture',label:'Fixture Person',route:'/admin/people'},object={module:'projects',objectType:'project',objectId:'project-fixture',label:'Fixture Project',route:'/admin/projects'},place={id:'place-fixture',name:'Fixture Venue',address:'123 Main Street, Cincinnati, OH 45202',tags:[],linkedRefs:[]};
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()), nextDay=new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
const fields={description:'A full event description',calendarId:'native',timeZone:'America/New_York',location:'Fixture Venue',placeId:place.id,linkedRefs:[person,object],recurrence:'',reminderMinutes:null,kind:'event',exceptions:{}};
const payload={ok:true,state:{calendars:[{id:'native',name:'Fixture Calendar',color:'#59518b',visible:true,groups:[]}],events:[{...fields,id:'event-fixture',title:'Fixture Appointment',start:day+'T09:00',end:day+'T15:00',allDay:false},{...fields,id:'all-day-fixture',title:'Fixture Trip',start:day,end:nextDay,allDay:true}],places:[place],connections:[],savedViews:[]},refs:[person,object,{module:'map',objectType:'place',objectId:place.id,label:place.name,route:'/admin/map'}],trips:[],dated:[],birthdays:[],workEvents:[],sourceErrors:[],capabilities:{morgen:false,routing:false}};
let browser;
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true});
 for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['tablet',{width:820,height:1180}],['mobile',{width:390,height:844}]]) {
  const context=await browser.newContext({viewport}),value=`v1.${Date.now()+600000}.${crypto.randomBytes(12).toString('base64url')}`;
  await context.addCookies([{name:'admin_session',value:value+'.'+crypto.createHmac('sha256',secret).update(value).digest('base64url'),url:base}]);
  await context.route('**/api/planning',route=>route.fulfill({json:payload}));
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/admin/calendar?date='+day,{waitUntil:'domcontentloaded'});
  const settings=()=>page.getByRole('dialog',{name:'Calendar settings',exact:true});
  const openSettings=async()=>{await page.locator('[data-calendar-options-trigger]').click();await settings().waitFor();};
  const chooseView=async(view)=>{if(name==='mobile'){await page.getByRole('combobox',{name:'Calendar view',exact:true}).click();await page.getByRole('option',{name:view,exact:true}).click();}else await page.getByRole('radio',{name:view,exact:true}).click();await page.waitForTimeout(400);};
  await openSettings();assert.equal(await page.locator('[data-calendar-options-trigger] svg').getAttribute('data-icon-candidate'),'settings');
  assert(await settings().getByRole('button',{name:'Share calendar',exact:true}).innerText().then(t=>t==='Share'));
  const labels=['Detailed time','Detailed address','Detailed people','Detailed objects'];for(const label of labels)assert(await settings().getByRole('button',{name:label,exact:true}).getAttribute('aria-pressed').then(value=>value==='true'));
  const detailGroup=settings().getByRole('group',{name:'Details',exact:true}),timeToggle=detailGroup.getByRole('button',{name:'Detailed time',exact:true});
  assert.equal(await detailGroup.getByRole('checkbox').count(),0,'Details use toggle buttons without checkboxes');
  await timeToggle.focus();await page.keyboard.press('Space');assert.equal(await timeToggle.getAttribute('aria-pressed'),'false');
  await page.waitForTimeout(200);const offColor=await timeToggle.evaluate(node=>getComputedStyle(node).backgroundColor);
  await page.keyboard.press('Enter');assert.equal(await timeToggle.getAttribute('aria-pressed'),'true');
  await page.waitForTimeout(200);assert.notEqual(await timeToggle.evaluate(node=>getComputedStyle(node).backgroundColor),offColor,'Shading communicates the selected state');
  const geometry=await settings().evaluate(root=>{const sections=[...root.querySelectorAll('[class*="viewOptionSection"]')],zone=root.querySelector('[class*="zoneControl"]'),button=root.querySelector('[data-calendar-settings-trigger]'),icon=button.querySelector('svg').getBoundingClientRect(),text=button.querySelector('span').getBoundingClientRect();return {gap1:sections[1].getBoundingClientRect().top-sections[0].getBoundingClientRect().bottom,gap2:zone.getBoundingClientRect().top-sections[1].getBoundingClientRect().bottom,align:Math.abs(icon.y+icon.height/2-text.y-text.height/2),overflow:root.scrollWidth>root.clientWidth};});
  assert(Math.abs(geometry.gap1-geometry.gap2)<1,JSON.stringify(geometry));assert(geometry.align<2);assert(!geometry.overflow);
  await page.waitForTimeout(350);await page.screenshot({path:path.join(out,`calendar-settings-${name}.png`)});
  await settings().getByRole('button',{name:'Calendars',exact:true}).click();await page.getByRole('heading',{name:'Calendars',exact:true}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'Close details',exact:true}).click();
  await openSettings();for(const label of labels)await settings().getByRole('button',{name:label,exact:true}).click();await page.keyboard.press('Escape');
  for(const view of ['Day','3 days','Week','Month','Agenda']) {
   await chooseView(view);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Page overflow');
   const time=page.locator('[data-event-detail="time"]').first(),address=page.locator('[data-event-detail="place"]').first();
   assert(await time.count()>0,view+' time icon retained');assert.equal(await time.getAttribute('data-compact'),'true');
   assert(await address.count()>0,view+' place icon retained');assert.equal(await address.getAttribute('data-compact'),'true');
   assert(await page.locator('[data-linked-summary="people"]').count()>0,view+' people icon retained');assert(await page.locator('[data-linked-summary="objects"]').count()>0,view+' object icon retained');
   if(view==='Day'||view==='Agenda') {
    await time.click();await page.getByRole('dialog',{name:'Time for Fixture Appointment',exact:true}).waitFor();assert((await page.getByRole('dialog',{name:'Time for Fixture Appointment',exact:true}).innerText()).includes('9am'));await page.keyboard.press('Escape');
    await address.click();assert((await page.getByRole('dialog',{name:/Place for Fixture/}).innerText()).includes(place.address));await page.keyboard.press('Escape');
    await page.locator('[data-linked-summary="people"]').first().click();assert(await page.getByRole('dialog',{name:/People linked to Fixture/}).getByRole('button',{name:'Preview Fixture Person'}).count());await page.keyboard.press('Escape');
    await page.locator('[data-linked-summary="objects"]').first().click();assert(await page.getByRole('dialog',{name:/Objects linked to Fixture/}).getByRole('button',{name:'Preview Fixture Project'}).count());await page.keyboard.press('Escape');
   }
   await page.screenshot({path:path.join(out,`calendar-icons-${view.replaceAll(' ','-')}-${name}.png`)});console.log(`${name} ${view}: simplified details PASS`);
  }
  await page.reload({waitUntil:'domcontentloaded'});await openSettings();for(const label of labels)assert(!(await settings().getByRole('button',{name:label,exact:true}).getAttribute('aria-pressed').then(value=>value==='true')),'Saved '+label);
  await settings().getByRole('button',{name:'Detailed people',exact:true}).click();await page.keyboard.press('Escape');await chooseView('Day');assert.equal(await page.locator('[data-linked-summary="people"]').count(),0);assert(await page.locator('[data-linked-summary="objects"]').count()>0,'Independent objects setting');
  await openSettings();for(const label of labels){const toggle=settings().getByRole('button',{name:label,exact:true});if(await toggle.getAttribute('aria-pressed')==='false')await toggle.click();};await page.keyboard.press('Escape');await chooseView('Agenda');assert.equal(await page.locator('[data-linked-summary]').count(),0);assert.equal(await page.locator('[data-event-detail="place"]').first().getAttribute('data-compact'),null);
  assert.deepEqual(errors,[]);console.log(name+': settings, labels, popovers, independent preferences and persistence PASS');await context.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill();});
