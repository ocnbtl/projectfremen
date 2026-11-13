// Synthetic local test server. Production calls and external browser requests are blocked.
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),assert=require('assert/strict'),{spawn}=require('child_process');
const {webkit,expect}=require('@playwright/test');
const app=path.resolve(__dirname,'..'),out=process.env.TASK_QA_OUTPUT||path.join(app,'output/tasks');fs.mkdirSync(out,{recursive:true});
const data=fs.mkdtempSync(path.join(os.tmpdir(),'tasks-browser-')),port=String(20000+crypto.randomInt(20000)),base='http://localhost:'+port,secret=crypto.randomBytes(24).toString('hex');
const server=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',port],{cwd:app,env:{...process.env,ADMIN_PASSWORD:'test',ADMIN_SESSION_SECRET:secret,FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',RESEND_API_KEY:'',VERCEL:'',MORGEN_API_KEY:''},stdio:['ignore','pipe','pipe']});
const ready=new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error('Local server did not start')),20000);server.stdout.on('data',d=>{log+=d;if(log.includes('Ready in')){clearTimeout(timer);resolve();}});server.stderr.on('data',()=>{});server.on('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code));});});
let browser,page;
(async()=>{
 await ready;browser=await webkit.launch({executablePath:process.env.WEBKIT_EXECUTABLE});const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000},timezoneId:'America/New_York'});
 const payload='v1.'+(Date.now()+3600000)+'.qa';await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'fixture-csrf',url:base}]);await context.route(/^https:\/\//,r=>r.request().url().startsWith('https://task-fixture.test/')?r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="#d9b093"/><circle cx="32" cy="25" r="12" fill="#243940"/><path d="M10 64v-9a22 22 0 0 1 44 0v9" fill="#243940"/></svg>'}):r.abort());
 const headers={origin:base,'x-csrf-token':'fixture-csrf'},post=async(route,data)=>{const response=await context.request.post(base+route,{headers,data});assert(response.ok(),await response.text());return response.json();};
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date());
 const sage=(await post('/api/planning',{operation:'save',collection:'calendars',input:{name:'Sage',color:'#37884a',visible:true}})).item;
 const photo='data:image/png;base64,'+(await require('sharp')(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#d9b093"/><circle cx="32" cy="25" r="12" fill="#243940"/><path d="M10 64v-9a22 22 0 0 1 44 0v9" fill="#243940"/></svg>')).png().toBuffer()).toString('base64');
 const person=(await post('/api/personal/records',{className:'person',title:'Jamie Harper',domain:'family',privacy:'private',status:'active',initialPhoto:photo})).record;
 const follow=(await post('/api/personal/ops',{family:'followUps',input:{title:'Check the proposal',context:'Confirm the next step with Jamie',dueAt:'2026-12-01'}})).item;

 const project=(await post('/api/projects',{operation:'create',family:'projects',input:{name:'Community garden',description:'A shared garden for the neighborhood.',objectives:[{text:'Confirm the planting plan',targetAt:'2026-12-02'}]}})).item;
 const projectPhoto=await context.request.post(base+'/api/projects/photos/'+project.id,{headers,multipart:{photo:{name:'garden.png',mimeType:'image/png',buffer:Buffer.from(photo.split(',')[1],'base64')}}});assert(projectPhoto.ok(),await projectPhoto.text());const photoMeta=await projectPhoto.json();const projectUpdate=await context.request.patch(base+'/api/projects',{headers,data:{operation:'update',family:'projects',id:project.id,expectedUpdatedAt:project.updatedAt,patch:{photoUpdatedAt:photoMeta.photo.updatedAt}}});assert(projectUpdate.ok(),await projectUpdate.text());
 await post('/api/planning',{operation:'save',collection:'events',input:{title:'Ordinary appointment',description:'',calendarId:'native',start:today+'T11:00',end:today+'T12:00',allDay:false,timeZone:'America/New_York',location:'',linkedRefs:[],recurrence:'',reminderMinutes:null,kind:'event'}});
 const native={operation:'create',id:'task-'+crypto.randomUUID(),timeZone:'America/New_York',input:{title:'Daily planning',description:'Choose one important next step.',kind:'routine',start:today+'T09:00',end:today+'T10:00',allDay:false,recurrence:'FREQ=DAILY;COUNT=5',calendarIds:['native',sage.id]}};
 await post('/api/planning/tasks',native);
 await post('/api/planning/tasks',{...native,id:'task-'+crypto.randomUUID(),input:{...native.input,title:'Afternoon planning',start:today+'T16:30',end:today+'T17:30',recurrence:''}});
 const anonymous=await browser.newContext();assert.equal((await anonymous.request.get(base+'/api/planning/tasks')).status(),401);await anonymous.close();assert.equal((await context.request.post(base+'/api/planning/tasks',{data:native})).status(),403);
 page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const first=(await(await context.request.get(base+'/api/planning')).json());const personId=first.refs.find(r=>r.label==='Jamie Harper').objectId;
 for(let i=1;i<=20;i++)await post('/api/planning/tasks',{operation:'create',id:'task-'+crypto.randomUUID(),timeZone:'America/New_York',input:{...native.input,title:'Pending task '+i,kind:i%2?'follow_up':'decision',start:'',end:'',allDay:true,recurrence:'',peopleIds:i<3?[personId]:[],linkedRefs:[{module:'projects',objectType:'project',objectId:project.id,label:project.name,route:'/admin/projects'}]}});
 const summaryDay=new Date(today+'T12:00:00');summaryDay.setDate(summaryDay.getDate()+2);const taskDay=summaryDay.toISOString().slice(0,10);await post('/api/planning/tasks',{operation:'create',id:'task-'+crypto.randomUUID(),timeZone:'America/New_York',input:{title:'Task without all-day event',kind:'task',start:taskDay,end:new Date(summaryDay.getTime()+86400000).toISOString().slice(0,10),allDay:true,recurrence:'',calendarIds:['native']}});
 const previous=new Date(today+'T12:00:00');previous.setDate(previous.getDate()-1);const after=new Date(today+'T12:00:00');after.setDate(after.getDate()+2);
 await post('/api/planning',{operation:'save',collection:'events',input:{title:'Important all-day trip',description:'',calendarId:'native',start:previous.toISOString().slice(0,10),end:after.toISOString().slice(0,10),allDay:true,timeZone:'America/New_York',location:'',linkedRefs:[],recurrence:'',reminderMinutes:null,kind:'event'}});
 const snapshot=async()=>(await(await context.request.get(base+'/api/planning')).json());
 const before=await snapshot();
 const eventTask=(await post('/api/planning',{operation:'save',collection:'events',input:{title:'Legacy calendar task',description:'Keep this event',calendarId:'native',start:today+'T15:00',end:today+'T16:00',allDay:false,isTask:true,timeZone:'America/New_York',location:'',linkedRefs:[],recurrence:'',reminderMinutes:null,kind:'event'}})).item;

 await page.goto(base+'/admin/personal');
 for(const width of [1440,820,390,320]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(400);
  for(const name of ['Focus mode','Hidden tasks (0)','All tasks','New task'])await expect(page.locator('.workspace-topnav').getByRole('button',{name,exact:true})).toBeVisible();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Personal overflow '+width);
  assert(await page.locator('.workspace-topnav__actions button').evaluateAll(ns=>ns.every(n=>{const r=n.getBoundingClientRect();return r.right<=innerWidth+1&&r.left>=0;})),'Nav clipping '+width);
  const count=page.getByRole('button',{name:'Hidden tasks (0)',exact:true}).locator('span').last();assert(await count.evaluate(n=>parseFloat(getComputedStyle(n).fontSize)>0),'Visible hidden count '+width);
  await page.screenshot({path:path.join(out,'task-toolbar-'+width+'.png')});
  for(let i=0;i<3;i++){
   await page.waitForTimeout(400);
   const buttons=page.getByRole('listitem').filter({has:page.getByText('Pending task 1',{exact:true})}).getByRole('button',{name:/^(Hide from Calendar|Edit|Complete) Pending task 1$/});
   const sizes=await buttons.evaluateAll(ns=>ns.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));
   assert(sizes.length===3&&sizes.every(r=>Math.abs(r.w-r.h)<1&&r.w>=32),'Square task controls '+width+' '+JSON.stringify(sizes));
   await page.getByRole('button',{name:/^View:/}).click();
  }
 }
 await page.setViewportSize({width:1440,height:900});await page.getByRole('button',{name:'Hide from Calendar Pending task 1',exact:true}).click();
 await expect(page.getByRole('button',{name:'Hidden tasks (1)',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Hidden tasks (1)',exact:true}).click();await expect(page.getByRole('button',{name:'Show on Calendar Pending task 1',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Show on Calendar Pending task 1',exact:true}).click();await expect(page.getByRole('heading',{name:'No hidden tasks',exact:true})).toBeVisible();
 await page.goto(base+'/admin/calendar?view=week&date='+today);await page.getByRole('button',{name:'Tasks',exact:true}).click();
 const tasks=page.getByRole('dialog',{name:'Tasks',exact:true});await expect(tasks).toBeVisible();await page.waitForTimeout(400);const full=await tasks.boundingBox();
 await tasks.getByRole('searchbox').fill('No matching fixture');await expect(tasks.getByRole('heading',{name:'No matching tasks'})).toBeVisible();await page.waitForTimeout(400);const empty=await tasks.boundingBox();assert(Math.abs(full.height-empty.height)<2,'Task sheet stable height');
 await page.screenshot({path:path.join(out,'tasks-empty-desktop.png')});
 const pet=(await post('/api/personal/pets',{entity:'pet',input:{name:'Orbit',species:'Axolotl',fields:{},archived:false}})).item;
 await page.goto(base+'/admin/personal/pets/'+pet.id);assert.equal(await page.locator('.workspace-topnav').getByRole('button',{name:'Tasks',exact:true}).count(),0);
 await page.getByRole('button',{name:'Log care',exact:true}).first().click();const care=page.getByRole('dialog',{name:'Log care',exact:true});
 await expect(care.getByRole('combobox',{name:'Care type',exact:true})).toBeVisible();await expect(care.getByRole('button',{name:'Save care',exact:true})).toBeDisabled();assert.equal(await care.getByLabel('When',{exact:true}).count(),0);
 const types=[['Food','Portion'],['Water','Amount'],['Walk','Duration / distance'],['Activity','Duration'],['Medication','Dose & unit'],['Vet visit',null],['Vaccination',null],['Grooming',null],['Habitat care','Reading / amount'],['Bathroom',null],['Weight / measurement','Value & unit'],['Other care','Amount / duration']];
 for(const [type,field] of types){await care.getByRole('combobox',{name:'Care type',exact:true}).click();const option=page.getByRole('option',{name:type,exact:true});assert(await option.locator('svg').count()>0,'Type icon '+type);await option.click();await page.waitForTimeout(550);await expect(care.getByLabel('When',{exact:true})).toBeVisible();if(field)await expect(care.getByLabel(field,{exact:true})).toBeVisible();else assert.equal(await care.getByLabel('Amount / duration',{exact:true}).count(),0);}
 await care.getByRole('combobox',{name:'Care type',exact:true}).click();await page.getByRole('option',{name:'Medication',exact:true}).click();await page.waitForTimeout(550);
 await care.getByLabel('Medication name (optional)',{exact:true}).fill('Fixture medication');await care.getByLabel('Dose & unit',{exact:true}).fill('2 ml');await care.getByLabel('Directions / frequency',{exact:true}).fill('Fixture directions');await care.getByLabel('Notes (optional)',{exact:true}).fill('Fixture observation');
 for(const width of [1440,820,390,320]){await page.setViewportSize({width,height:900});await page.waitForTimeout(350);assert(await care.evaluate(n=>n.scrollWidth<=n.clientWidth+1),'Care overflow '+width);await page.screenshot({path:path.join(out,'care-medication-'+width+'.png')});}
 await care.getByRole('button',{name:'Save care',exact:true}).click();await expect(care).toHaveCount(0);
 let saved=(await(await context.request.get(base+'/api/personal/pets')).json()).state.events;assert.equal(saved.length,1);assert.equal(saved[0].amount,'2 ml');assert.equal(saved[0].instructions,'Fixture directions');
 await page.getByRole('button',{name:'Edit Fixture medication',exact:true}).click();const editor=page.getByRole('dialog',{name:'Edit care',exact:true});await expect(editor.getByLabel('Dose & unit',{exact:true})).toHaveValue('2 ml');
 await editor.getByRole('combobox',{name:'Care type',exact:true}).click();await page.getByRole('option',{name:'Vet visit',exact:true}).click();await page.waitForTimeout(550);await expect(editor.getByLabel('Amount / duration',{exact:true})).toHaveValue('2 ml');await editor.getByRole('button',{name:'Save care',exact:true}).click();await expect(editor).toHaveCount(0);
 saved=(await(await context.request.get(base+'/api/personal/pets')).json()).state.events;assert.equal(saved.length,1);assert.equal(saved[0].amount,'2 ml');assert.equal(saved[0].notes,'Fixture observation');
 assert.deepEqual(errors,[]);console.log('PASS: task nav, square controls in all views, hide/unhide, stable empty popup, 12 care types with icons, responsive forms, save/edit preservation.');
})().catch(async e=>{console.error(e);if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
