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
 const card=()=>page.getByRole('listitem').filter({has:page.getByText('Pending task 1',{exact:true})});await expect(card()).toBeVisible();
 assert.equal(await page.getByRole('button',{name:'Focus mode',exact:true}).locator('svg').getAttribute('data-icon-candidate'),'viewfinder');
 for(let v=0;v<3;v++){
  await page.waitForTimeout(400);const title=card().locator('strong').first();const before=await title.boundingBox();
  await page.getByRole('button',{name:'Focus mode',exact:true}).click();await expect(card().locator('[data-task-date]')).toHaveCount(0);await expect(card().getByRole('combobox')).toHaveCount(0);await page.waitForTimeout(400);const after=await title.boundingBox();assert(Math.abs(before.height-after.height)<2,'Focus title height remains stable');
  await page.getByRole('button',{name:'Focus mode',exact:true}).click();await expect(card().getByRole('combobox')).toBeVisible();await page.getByRole('button',{name:/^View:/}).click();
 }
 await page.goto(base+'/admin/calendar?view=week&date='+today);await page.getByRole('button',{name:'Tasks',exact:true}).click();const tasks=page.getByRole('dialog',{name:'Tasks',exact:true});await expect(tasks).toBeVisible();
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.waitForTimeout(400);const body=tasks.locator('.work-sheet-body');const before=await body.evaluate(e=>e.clientWidth);
  await tasks.getByRole('button',{name:'Hidden tasks (0)',exact:true}).click();await expect(tasks.getByRole('heading',{name:'No hidden tasks'})).toBeVisible();await page.waitForTimeout(400);assert.equal(await body.evaluate(e=>e.clientWidth),before,'Stable width with hidden results');await tasks.getByRole('button',{name:'Hidden tasks (0)',exact:true}).click();
  await tasks.getByRole('searchbox',{name:'Search tasks',exact:true}).fill('Pending task 1');await page.waitForTimeout(350);
  await tasks.getByRole('combobox',{name:'Change type for Pending task 1',exact:true}).click();const opt=page.getByRole('option',{name:'Decision',exact:true});await expect(opt).toBeVisible();await opt.click();await expect(tasks.getByRole('combobox',{name:'Change type for Pending task 1',exact:true})).toContainText('Decision');
  await tasks.getByRole('button',{name:'Edit Pending task 1',exact:true}).click();await expect(tasks.getByRole('textbox',{name:'Task name'})).toBeVisible();await expect(tasks.getByText('Task details',{exact:true})).toHaveCount(0);
  await page.waitForTimeout(350);const input=await tasks.getByRole('textbox',{name:'Task name'}).boundingBox(),type=await tasks.getByRole('combobox',{name:'New task type'}).boundingBox();assert(Math.abs(input.y-type.y)<4,'Task and type first row');
  await tasks.getByRole('button',{name:'Choose a day',exact:true}).click();await expect(tasks.getByRole('combobox',{name:'Task time zone'})).toBeVisible();
  if(width===1440){const start=await tasks.getByRole('button',{name:'Start',exact:true}).boundingBox(),zone=await tasks.getByRole('combobox',{name:'Task time zone'}).boundingBox(),repeat=await tasks.getByRole('combobox',{name:'Repeat schedule'}).boundingBox();assert(Math.abs(start.y-zone.y)<5&&repeat.y>start.y,'Day fields align with Calendar repeat below');}
  await tasks.getByRole('combobox',{name:'Repeat schedule',exact:true}).click();await page.getByRole('option',{name:'Every week',exact:true}).click();await expect(tasks.getByRole('combobox',{name:'Repeat schedule',exact:true})).toContainText('Every week');
  await tasks.getByRole('button',{name:'Choose a time',exact:true}).click();await expect(tasks.getByRole('button',{name:'End',exact:true})).toBeVisible();
  if(width===1440){assert(await body.evaluate(e=>e.scrollHeight<=e.clientHeight+2),'Default editor fits without scrolling');}
  const save=tasks.getByRole('button',{name:'Save updates',exact:true});assert.notEqual(await save.locator('svg').getAttribute('data-icon-candidate'),await tasks.getByRole('button',{name:'Complete',exact:true}).locator('svg').getAttribute('data-icon-candidate'));
  await page.screenshot({path:path.join(out,'task-editor-'+width+'.png')});await tasks.getByRole('button',{name:'Back to tasks',exact:true}).click();await expect(tasks.getByRole('searchbox',{name:'Search tasks',exact:true})).toBeVisible();
 }
 await page.setViewportSize({width:1440,height:1000});await tasks.getByRole('button',{name:'Edit Pending task 1',exact:true}).click();await tasks.getByRole('button',{name:'Add due date',exact:true}).click();await tasks.getByRole('textbox',{name:'Task notes'}).fill('Local compact editor note');await tasks.getByRole('button',{name:'Save updates',exact:true}).click();await expect(tasks.getByRole('searchbox',{name:'Search tasks',exact:true})).toBeVisible();
 const final=await snapshot();const task=final.taskItems.find(i=>i.title==='Pending task 1');assert.equal(task.description,'Local compact editor note');assert(task.dueAt);assert(!task.completed);
 assert.deepEqual(errors,[]);console.log('PASS: distinct focus icon, nonstretching text, floating date hidden in focus, stable sheet width, unclipped mobile/desktop type menu, compact day/time editor, Save updates and due date persistence.');
})().catch(async e=>{console.error(e);if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
