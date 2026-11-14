// Synthetic local test server. Production calls and external browser requests are blocked.
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),assert=require('assert/strict'),{spawn}=require('child_process');
const {webkit,expect}=require('@playwright/test');
const app=path.resolve(__dirname,'..'),out=process.env.TASK_QA_OUTPUT||path.join(app,'output/task-editor-refinement');fs.mkdirSync(out,{recursive:true});
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



 await post('/api/planning/tasks',{operation:'create',id:'task-'+crypto.randomUUID(),timeZone:'America/New_York',input:{title:'No links fixture',kind:'task',start:'',end:'',allDay:true,recurrence:'',calendarIds:[]}});
 const initialSnapshot=await snapshot();
 if(!process.env.TASK_EDITOR_ONLY){
 for(const surface of ['personal','calendar']){
  await page.goto(base+'/admin/'+surface+(surface==='calendar'?'?view=week&date='+today:''));await page.waitForTimeout(500);
  if(surface==='calendar')await page.getByRole('button',{name:'Tasks',exact:true}).click();
  const root=surface==='calendar'?page.getByRole('dialog',{name:'Tasks',exact:true}):page;
  const card=()=>root.getByRole('listitem').filter({has:page.getByText('Pending task 1',{exact:true})});
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1050});
   for(const view of ['comfortable','compact','grid']){
    const cycle=root.getByRole('button',{name:/^View:/});for(let i=0;i<3&&!((await cycle.getAttribute('aria-label')).toLowerCase().startsWith('view: '+view+'.'));i++)await cycle.click();
    await page.waitForTimeout(400);
    for(const focus of [false,true]){
     const toggle=root.getByRole('button',{name:'Focus mode',exact:true});if((await toggle.getAttribute('aria-pressed')==='true')!==focus)await toggle.click();await page.waitForTimeout(400);
     await expect(card().locator('[data-task-objects]')).toBeVisible();await expect(card().getByRole('button',{name:'Preview Community garden',exact:true})).toBeVisible();await expect(card().getByRole('button',{name:'Preview Jamie Harper',exact:true})).toBeVisible();
     await expect(card().getByRole('combobox',{name:'Change type for Pending task 1',exact:true})).toHaveCount(focus?0:1);await expect(card().getByRole('button',{name:'Change calendars for Pending task 1',exact:true})).toHaveCount(focus?0:1);
     const rect=await card().boundingBox(),linked=await card().locator('[data-task-context]').boundingBox(),title=await card().locator('strong').first().boundingBox(),edit=await card().getByRole('button',{name:'Edit Pending task 1',exact:true}).boundingBox();
     assert(linked.x>=rect.x&&linked.x+linked.width<=rect.x+rect.width+1,'context inside card');assert(Math.abs(edit.width-edit.height)<1,'square actions');
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow');
     assert(await card().evaluate(e=>e.scrollWidth<=e.clientWidth+1),'card overflow '+surface+' '+width+' '+view+' '+focus);
     if(view==='grid'){
      assert(title.y+title.height<linked.y,'title above context');assert(linked.x<edit.x,'context left of actions');
      if(!focus){const date=await card().locator('[data-task-date]').boundingBox();assert(date.y+date.height<=edit.y+1,'date above actions');}
      await page.screenshot({path:path.join(out,surface+'-grid-'+width+'-'+(focus?'focus':'normal')+'.png')});
     }
     if(focus){const url=page.url();await card().getByRole('button',{name:'Preview Community garden',exact:true}).click();await expect(page.getByRole('dialog',{name:'Community garden',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close profile preview',exact:true}).click();assert.equal(page.url(),url);await expect(card()).toBeVisible();}
    }
   }
  }
 }
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('dialog',{name:'Tasks',exact:true}).getByRole('button',{name:'Focus mode',exact:true}).click();await page.waitForTimeout(50);
 assert.deepEqual((await snapshot()).taskItems,initialSnapshot.taskItems,'view changes never mutate task data');assert.deepEqual(errors,[]);

 }
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/admin/calendar');await page.getByRole('button',{name:'Tasks',exact:true}).click();
 await page.emulateMedia({reducedMotion:'no-preference'});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});const dialog=page.getByRole('dialog',{name:'Tasks',exact:true});await dialog.getByRole('button',{name:'New task',exact:true}).click();await page.getByRole('textbox',{name:'Task name',exact:true}).fill('Editor QA '+width);
  await expect(page.getByRole('button',{name:'Back to tasks',exact:true})).toBeVisible();
  const due=page.getByRole('button',{name:'Add due date',exact:true});const a=await due.locator('svg').boundingBox(),b=await due.locator('span').boundingBox();assert(Math.abs(a.y+a.height/2-b.y-b.height/2)<2,'due icon/text aligned');
  await due.click();await expect(page.getByRole('group',{name:'Due date',exact:true})).toBeVisible();
  for(const mode of ['Choose a day','Choose a time']){
   await page.getByRole('button',{name:mode,exact:true}).click();await page.waitForTimeout(300);
   const start=await page.getByRole('group',{name:'Start',exact:true}).boundingBox(),tz=await page.getByRole('combobox',{name:'Task time zone',exact:true}).boundingBox();
   if(width===1440){assert(Math.abs(start.y+start.height/2-tz.y-tz.height/2)<5,'date and time zone align');}
   assert(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'editor no horizontal overflow');
   await page.screenshot({path:path.join(out,'editor-'+width+'-'+mode.replaceAll(' ','-')+'.png')});
  }
  await page.getByRole('checkbox',{name:'Repeat',exact:true}).check();await page.getByRole('combobox',{name:'Repeat schedule',exact:true}).click();await page.getByRole('option',{name:'Custom…',exact:true}).click();await page.getByRole('textbox',{name:'Custom repeat rule'}).fill('Every Monday and Thursday');await page.getByRole('button',{name:'Apply',exact:true}).click();
  await page.getByRole('button',{name:'Save updates',exact:true}).click();await expect(dialog.getByRole('button',{name:'New task',exact:true})).toBeVisible();const saved=(await snapshot()).taskItems.find(t=>t.title==='Editor QA '+width);assert(saved.recurrence.includes('BYDAY=MO,TH'));assert(saved.dueAt);assert(!saved.allDay);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: focus layouts and previews across all views; aligned task editor controls; Calendar repeat checkbox/custom days; saved due date and recurrence; desktop/mobile.');
})().catch(async e=>{console.error(e);if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
