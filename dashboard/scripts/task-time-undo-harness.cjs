// Synthetic local test server. Production calls and external browser requests are blocked.
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),assert=require('assert/strict'),{spawn}=require('child_process');
const {webkit,chromium,expect}=require('@playwright/test');
const app=path.resolve(__dirname,'..'),out=process.env.TASK_QA_OUTPUT||path.join(app,'output/task-time-undo');fs.mkdirSync(out,{recursive:true});
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

 const day='2026-11-15',nextDay='2026-11-16',zone='America/New_York';
 const project=(await post('/api/projects',{operation:'create',family:'projects',input:{name:'Schedule sync fixture',lifecycle:'active',objectives:[{text:'Source objective',kind:'objective',targetAt:'2026-12-01'}]}})).item;
 const ref={module:'projects',objectType:'project',objectId:project.id,label:project.name,route:'/admin/projects/'+project.id};
 async function task(title,start,end,timeZone=zone,recurrence=''){const id='task-'+crypto.randomUUID();await post('/api/planning/tasks',{operation:'create',id,timeZone,input:{title,kind:'task',description:'Preserve notes',dueAt:'2026-12-01',start,end,allDay:false,timeZone,recurrence,calendarIds:['native'],linkedRefs:[ref],peopleIds:[]}});return id;}
 const id=await task('Native scheduled task',day+'T13:00',day+'T14:00','America/Los_Angeles'); // 4-5pm in display zone
 const repeatId=await task('Repeating scheduled task',day+'T09:00',day+'T10:00',zone,'FREQ=DAILY;COUNT=3');
 const old=(await post('/api/planning',{operation:'save',collection:'events',input:{title:'Older calendar task',description:'Preserve event notes',calendarId:'native',start:day+'T11:00',end:day+'T12:00',allDay:false,isTask:true,timeZone:zone,location:'',linkedRefs:[ref],recurrence:'',reminderMinutes:15,kind:'event'}})).item;
 const read=async id=>(await snapshot()).taskItems.find(t=>t.id===id);
 const objective=(await snapshot()).taskItems.find(t=>t.title==='Source objective');
 await post('/api/planning/tasks',{operation:'schedule',id:objective.id,expectedUpdatedAt:objective.updatedAt,sourceUpdatedAt:objective.sourceUpdatedAt,timeZone:zone,input:{...objective,start:day+'T14:00',end:day+'T15:00',allDay:false,calendarIds:['native']}});
 const before=await snapshot(),ids=before.taskItems.map(t=>t.id).sort();
 const personal=await context.newPage(),projects=await context.newPage();
 for(const p of [personal,projects]){p.setDefaultTimeout(12000);await p.clock.setFixedTime(new Date('2026-11-15T17:00Z'));}
 await personal.goto(base+'/admin/personal');await expect(personal.getByRole('button',{name:'Edit schedule for Native scheduled task',exact:true})).toBeVisible();
 await projects.goto(base+'/admin/projects');await expect(projects.getByRole('button',{name:'Edit task: Native scheduled task',exact:true})).toBeVisible();
 const observed={personal:[],projects:[]};
 for(const [name,p] of [['personal',personal],['projects',projects]])p.on('response',async r=>{if(r.request().method()==='GET'&&['/api/planning','/api/planning/tasks'].includes(new URL(r.url()).pathname)){try{const body=await r.json();observed[name].push(body.taskItems||body.items||[]);}catch{}}});
 await page.goto(base+'/admin/calendar?date='+day);
 const entry=title=>page.locator('[data-morph-event][title^="'+title+'"]');
 async function waitTask(taskId,start,end){await expect.poll(async()=>{const t=await read(taskId);return [t.start.slice(0,16),t.end.slice(0,16)];}).toEqual([start,end]);}
 async function drag(title,date,hour){let previous;await expect.poll(async()=>{const next=await page.locator('[data-calendar-day="'+date+'"]').boundingBox();const stable=previous&&Math.abs(next.y-previous.y)<.1&&Math.abs(next.height-previous.height)<.1;previous=next;return !!stable;}).toBe(true);const card=entry(title).first();await expect(card).toHaveCount(1);const source=card.locator('button[draggable=true]');const rect=await card.boundingBox(),column=page.locator('[data-calendar-day="'+date+'"]'),slot=await column.locator('[data-hour="'+hour+'"]').boundingBox();const dt=await page.evaluateHandle(()=>new DataTransfer());await source.dispatchEvent('dragstart',{dataTransfer:dt,clientX:rect.x+10,clientY:rect.y});await column.dispatchEvent('dragover',{dataTransfer:dt,clientX:slot.x+10,clientY:slot.y+1});await column.dispatchEvent('drop',{dataTransfer:dt,clientX:slot.x+10,clientY:slot.y+1});await source.dispatchEvent('dragend',{dataTransfer:dt});await dt.dispose();}
 async function resize(title,edge,minutes){const handle=entry(title).getByRole('button',{name:new RegExp('^Resize '+edge)});await handle.hover();const box=await handle.boundingBox(),slot=await entry(title).locator('..').locator('[data-hour="16"]').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2+slot.height*minutes/60,{steps:8});await page.mouse.up();}
 async function synced(taskId,expectedStart,expectedEnd){for(const [name,p] of [['personal',personal],['projects',projects]]){await p.bringToFront();await expect.poll(()=>observed[name].some(items=>items.some(t=>t.id===taskId&&t.start.slice(0,16)===expectedStart&&t.end.slice(0,16)===expectedEnd))).toBe(true);}await page.bringToFront();}
 const notice=()=>page.getByRole('complementary',{name:'Task time saved',exact:true});
 async function undo(){await expect(notice()).toBeVisible();await expect(notice().getByRole('button',{name:'Undo',exact:true})).toBeEnabled();await notice().getByRole('button',{name:'Undo',exact:true}).click();await expect(notice()).toHaveCount(0);}
 function clearObserved(){observed.personal=[];observed.projects=[];}
 await drag('Native scheduled task',nextDay,17);await waitTask(id,nextDay+'T14:00',nextDay+'T15:00');await synced(id,nextDay+'T14:00',nextDay+'T15:00');
 clearObserved();await undo();await waitTask(id,day+'T13:00',day+'T14:00');await synced(id,day+'T13:00',day+'T14:00');
 await personal.bringToFront();await expect(personal.getByRole('button',{name:'Edit schedule for Native scheduled task',exact:true})).toHaveCount(1);await expect(personal.getByRole('button',{name:'Edit schedule for Native scheduled task',exact:true})).toContainText('1:00');
 await projects.getByRole('button',{name:'Edit task: Native scheduled task',exact:true}).click();for(const [name,value] of [['Start day','15'],['Start hour','1'],['Start minute','00'],['End hour','2'],['End minute','00']])await expect(projects.getByRole('textbox',{name,exact:true})).toHaveValue(value);await projects.keyboard.press('Escape');await page.bringToFront();
 await resize('Native scheduled task','end',30);await waitTask(id,day+'T13:00',day+'T14:30');await undo();await waitTask(id,day+'T13:00',day+'T14:00');
 await resize('Native scheduled task','start',-15);await waitTask(id,day+'T12:45',day+'T14:00');await undo();await waitTask(id,day+'T13:00',day+'T14:00');
 await drag('Older calendar task',nextDay,11);await waitTask('events:'+old.id,nextDay+'T11:00',nextDay+'T12:00');clearObserved();await undo();await waitTask('events:'+old.id,day+'T11:00',day+'T12:00');await synced('events:'+old.id,day+'T11:00',day+'T12:00');
 await resize('Older calendar task','end',30);await waitTask('events:'+old.id,day+'T11:00',day+'T12:30');await undo();await waitTask('events:'+old.id,day+'T11:00',day+'T12:00');
 await drag('Source objective',nextDay,14);await waitTask(objective.id,nextDay+'T14:00',nextDay+'T15:00');await undo();await waitTask(objective.id,day+'T14:00',day+'T15:00');
 const repeatTitle='Repeating scheduled task',firstRepeat=page.locator('[data-calendar-day="'+day+'"] [data-morph-event][title^="'+repeatTitle+'"]');
 await drag(repeatTitle,day,10);
 await expect.poll(async()=>Object.values((await read(repeatId)).exceptions)[0]?.start.slice(0,16)).toBe(day+'T10:00');
 await firstRepeat.getByRole('button',{name:/^Resize end/}).press('ArrowDown');await expect.poll(async()=>Object.values((await read(repeatId)).exceptions)[0]?.end.slice(0,16)).toBe(day+'T11:05');
 await undo();await expect.poll(async()=>Object.values((await read(repeatId)).exceptions)[0]?.end.slice(0,16)).toBe(day+'T11:00');
 await expect(firstRepeat).toHaveAttribute('title',/10am to 11am/);await page.keyboard.press('Control+z');await expect.poll(async()=>Object.values((await read(repeatId)).exceptions)[0]?.start.slice(0,16)).toBe(day+'T09:00');
 const repeated=await read(repeatId);assert.equal(repeated.start,day+'T09:00');assert.equal(Object.keys(repeated.exceptions).length,1);assert.equal(Object.values(repeated.exceptions)[0].end.slice(0,16),day+'T10:00');
 // A later schedule change must not be overwritten by Undo, even before the tab refreshes.
 await drag('Native scheduled task',nextDay,17);await waitTask(id,nextDay+'T14:00',nextDay+'T15:00');await expect(notice().getByRole('button',{name:'Undo',exact:true})).toBeEnabled();
 let current=await read(id);await post('/api/planning/tasks',{operation:'schedule',id,timeZone:current.timeZone,expectedUpdatedAt:current.updatedAt,input:{...current,start:nextDay+'T15:00',end:nextDay+'T16:00'}});
 await notice().getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'changed elsewhere'})).toBeVisible();await waitTask(id,nextDay+'T15:00',nextDay+'T16:00');
 await page.getByRole('button',{name:'Try again',exact:true}).click();await notice().getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:"schedule changed since your move"})).toBeVisible();await waitTask(id,nextDay+'T15:00',nextDay+'T16:00');
 await notice().getByRole('button',{name:'Dismiss move notification',exact:true}).click();await expect(notice()).toHaveCount(0);
 // A failed save does not advertise a successful move or produce an Undo receipt.
 await page.route('**/api/planning/tasks',route=>route.request().method()==='POST'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:'Fixture save unavailable'})}):route.continue());
 await drag('Native scheduled task',nextDay,19);await expect(page.getByRole('alert').filter({hasText:'Fixture save unavailable'})).toBeVisible();await expect(notice()).toHaveCount(0);await waitTask(id,nextDay+'T15:00',nextDay+'T16:00');await page.unroute('**/api/planning/tasks');
 // Compact mobile notice and keyboard dismissal preserve the last saved task.
 await page.setViewportSize({width:390,height:900});await page.getByRole('combobox',{name:'Calendar view',exact:true}).click();await page.getByRole('option',{name:'Day',exact:true}).click();await firstRepeat.getByRole('button',{name:/^Resize end/}).press('ArrowDown');await expect(notice()).toBeVisible();await expect(notice().getByRole('button',{name:'Undo',exact:true})).toBeEnabled();await expect.poll(()=>notice().evaluate(e=>getComputedStyle(e).opacity)).toBe('1');const bounds=await notice().boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=390&&bounds.height<100);await page.screenshot({path:path.join(out,'undo-mobile.png')});await undo();
 const after=await snapshot();assert.deepEqual(after.taskItems.map(t=>t.id).sort(),ids);assert.equal(after.state.events.length,before.state.events.length);assert.equal(after.state.taskPlans.length,before.state.taskPlans.length);
 for(const item of after.taskItems){const original=before.taskItems.find(t=>t.id===item.id);assert.equal(item.dueAt,original.dueAt);assert.deepEqual(item.linkedRefs,original.linkedRefs);assert.deepEqual(item.calendarIds,original.calendarIds);assert.equal(item.completed,original.completed);assert.equal(item.description,original.description);}
 assert.deepEqual(errors,[]);
 console.log('PASS: Undo drag and both resize edges, source-zone time restoration, Personal/project preview sync, legacy event and objective Undo, repeating occurrence and consecutive keyboard Undo, stale schedule and failed-save protection, compact mobile notice, unchanged IDs/counts/due dates/links/statuses/notes.');
})().catch(async e=>{console.error(e);if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});




