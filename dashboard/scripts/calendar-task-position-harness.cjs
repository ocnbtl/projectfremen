// Synthetic local test server. Production calls and external browser requests are blocked.
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),assert=require('assert/strict'),{spawn}=require('child_process');
const {webkit,chromium,expect}=require('@playwright/test');
const app=path.resolve(__dirname,'..'),out=process.env.TASK_QA_OUTPUT||path.join(app,'output/calendar-task-position');fs.mkdirSync(out,{recursive:true});
const data=fs.mkdtempSync(path.join(os.tmpdir(),'tasks-browser-')),port=String(20000+crypto.randomInt(20000)),base='http://localhost:'+port,secret=crypto.randomBytes(24).toString('hex');
const server=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',port],{cwd:app,env:{...process.env,ADMIN_PASSWORD:'test',ADMIN_SESSION_SECRET:secret,FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',RESEND_API_KEY:'',VERCEL:'',MORGEN_API_KEY:''},stdio:['ignore','pipe','pipe']});
const ready=new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error('Local server did not start')),20000);server.stdout.on('data',d=>{log+=d;if(log.includes('Ready in')){clearTimeout(timer);resolve();}});server.stderr.on('data',()=>{});server.on('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code));});});
let browser,page;
(async()=>{
 await ready;browser=await (process.env.BROWSER_ENGINE==='chromium'?chromium:webkit).launch({executablePath:process.env.BROWSER_EXECUTABLE||process.env.WEBKIT_EXECUTABLE});const context=await browser.newContext({serviceWorkers:'block',viewport:{width:process.env.MOBILE_ONLY?390:1920,height:1000},timezoneId:'America/New_York'});
 const payload='v1.'+(Date.now()+3600000)+'.qa';await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'fixture-csrf',url:base}]);await context.route(/^https:\/\//,r=>r.request().url().startsWith('https://task-fixture.test/')?r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="#d9b093"/><circle cx="32" cy="25" r="12" fill="#243940"/><path d="M10 64v-9a22 22 0 0 1 44 0v9" fill="#243940"/></svg>'}):r.abort());
 const headers={origin:base,'x-csrf-token':'fixture-csrf'},post=async(route,data)=>{const response=await context.request.post(base+route,{headers,data});assert(response.ok(),await response.text());return response.json();};

 page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const snapshot=async()=>(await(await context.request.get(base+'/api/planning')).json());
 // The 3-day view anchors to Today; keep this fixture independent of the test date.
 await page.clock.setFixedTime(new Date('2026-11-15T17:00:00Z'));

 const day='2026-11-15',zone='America/New_York';
 async function task(title,start,end){await post('/api/planning/tasks',{operation:'create',id:'task-'+crypto.randomUUID(),timeZone:zone,input:{title,kind:'task',description:'Position regression fixture',start:day+'T'+start,end:day+'T'+end,allDay:false,timeZone:zone,recurrence:'',calendarIds:['native'],linkedRefs:[],peopleIds:[]}});}
 await task('Finish drone clip edits','11:00','15:00');await task('Send over drone clips','16:00','17:00');
 await post('/api/planning',{operation:'save',collection:'events',input:{title:'Event-backed task',calendarId:'native',description:'',start:day+'T18:00',end:day+'T19:00',allDay:false,timeZone:zone,isTask:true,location:'',linkedRefs:[],recurrence:'',reminderMinutes:null,kind:'event'}});
 await post('/api/planning',{operation:'save',collection:'events',input:{title:'Ordinary appointment',calendarId:'native',description:'',start:day+'T16:30',end:day+'T17:30',allDay:false,timeZone:zone,isTask:false,location:'',linkedRefs:[],recurrence:'',reminderMinutes:null,kind:'event'}});
 const before=await snapshot();
 await page.goto(base+'/admin/calendar?date='+day);
 const column=()=>page.locator('[data-calendar-day="'+day+'"]');
 const entry=title=>column().locator('[data-morph-event][title^="'+title+'"]');
 await expect(entry('Send over drone clips')).toBeVisible();
 await expect(entry('Send over drone clips')).toHaveAttribute('title',/4pm to 5pm/);
 async function measured(title,hour,fraction=0){return entry(title).evaluate((e,{hour,fraction})=>{const parent=e.closest('[data-calendar-day]'),slot=parent.querySelector('[data-hour="'+hour+'"]'),r=e.getBoundingClientRect(),s=slot.getBoundingClientRect();return {position:getComputedStyle(e).position,offsetMinutes:(r.top-s.top)/s.height*60-fraction*60,heightMinutes:r.height/s.height*60};},{hour,fraction});}
 if(process.argv.includes('--baseline')){const m=await measured('Send over drone clips',16);console.log('BASELINE',JSON.stringify(m));assert.equal(m.position,'relative');assert(Math.abs(m.offsetMinutes-240)<2,'second task shifted by preceding four-hour task');await page.screenshot({path:path.join(out,'before.png')});return;}
 async function verify(label){for(const [title,hour,fraction,duration] of [['Finish drone clip edits',11,0,240],['Send over drone clips',16,0,60],['Event-backed task',18,0,60],['Ordinary appointment',16,.5,60]]){await expect.poll(async()=>Math.abs((await measured(title,hour,fraction)).offsetMinutes),{message:label+' '+title+' start'}).toBeLessThan(2);const m=await measured(title,hour,fraction);assert.equal(m.position,'absolute');assert(Math.abs(m.heightMinutes-duration)<3,label+' duration '+title);}assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 for(const width of (process.env.MOBILE_ONLY?[390]:[1920,1440,390])){
  await page.setViewportSize({width,height:1000});
  for(const view of ['Week','3 days','Day']){
   const picker=page.getByRole('combobox',{name:'Calendar view',exact:true});
   if(await picker.isVisible()){await picker.click();await page.getByRole('option',{name:view,exact:true}).click();}else await page.getByRole('radio',{name:view,exact:true}).click();
   await verify(width+' '+view);await page.screenshot({path:path.join(out,width+'-'+view.replace(' ','-')+'.png')});
  }
 }
 if(!process.env.MOBILE_ONLY)await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('button',{name:/^Show before 8 am/}).click();await verify('expanded morning');
 await page.getByRole('button',{name:/^Show after 10 pm/}).click();await verify('expanded evening');
 await page.getByRole('button',{name:/^Hide before 8 am/}).click();await verify('collapsed morning');
 await page.getByRole('button',{name:/^Hide after 10 pm/}).click();await verify('collapsed evening');
 const after=await snapshot();assert.deepEqual(after.taskItems,before.taskItems,'no task data changes');assert.deepEqual(after.state.events,before.state.events,'no event data changes');assert.deepEqual(errors,[]);
 console.log('PASS: saved 4–5pm task aligns at 4pm after preceding four-hour task; native and event-backed tasks, normal overlapping events, Week/3 days/Day, desktop/mobile, animated hour controls, unchanged times and records.');
})().catch(async e=>{console.error(e);if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});

