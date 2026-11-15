// Synthetic local test server. Production calls and external browser requests are blocked.
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),assert=require('assert/strict'),{spawn}=require('child_process');
const {webkit,chromium,expect}=require('@playwright/test');
const app=path.resolve(__dirname,'..'),out=process.env.TASK_QA_OUTPUT||path.join(app,'output/task-calendar-sync');fs.mkdirSync(out,{recursive:true});
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
 async function drag(title,date,hour){const card=entry(title);await expect(card).toHaveCount(1);const source=card.locator('button[draggable=true]');const rect=await card.boundingBox(),column=page.locator('[data-calendar-day="'+date+'"]'),slot=await column.locator('[data-hour="'+hour+'"]').boundingBox();const dt=await page.evaluateHandle(()=>new DataTransfer());await source.dispatchEvent('dragstart',{dataTransfer:dt,clientX:rect.x+10,clientY:rect.y});await column.dispatchEvent('dragover',{dataTransfer:dt,clientX:slot.x+10,clientY:slot.y+1});await column.dispatchEvent('drop',{dataTransfer:dt,clientX:slot.x+10,clientY:slot.y+1});await source.dispatchEvent('dragend',{dataTransfer:dt});await dt.dispose();}
 async function resize(title,edge,minutes){const handle=entry(title).getByRole('button',{name:new RegExp('^Resize '+edge)});await handle.hover();const box=await handle.boundingBox(),slot=await entry(title).locator('..').locator('[data-hour="16"]').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2+slot.height*minutes/60,{steps:8});await page.mouse.up();}
 async function synced(taskId,expectedStart,expectedEnd){for(const [name,p] of [['personal',personal],['projects',projects]]){await p.bringToFront();await expect.poll(()=>observed[name].some(items=>items.some(t=>t.id===taskId&&t.start.slice(0,16)===expectedStart&&t.end.slice(0,16)===expectedEnd))).toBe(true);}await page.bringToFront();}
 await drag('Native scheduled task',nextDay,17);await waitTask(id,nextDay+'T14:00',nextDay+'T15:00');await synced(id,nextDay+'T14:00',nextDay+'T15:00');
 await resize('Native scheduled task','end',30);await waitTask(id,nextDay+'T14:00',nextDay+'T15:30');
 await resize('Native scheduled task','start',-15);await waitTask(id,nextDay+'T13:45',nextDay+'T15:30');await synced(id,nextDay+'T13:45',nextDay+'T15:30');
 // Personal renders the same saved local time; project card opens the latest shared editor.
 await personal.bringToFront();await expect(personal.getByRole('button',{name:'Edit schedule for Native scheduled task',exact:true})).toHaveCount(1);await expect(personal.getByRole('button',{name:'Edit schedule for Native scheduled task',exact:true})).toContainText('1:45');
 await projects.getByRole('button',{name:'Edit task: Native scheduled task',exact:true}).click();for(const [name,value] of [['Start hour','1'],['Start minute','45'],['Start period','pm'],['End hour','3'],['End minute','30'],['End period','pm']])await expect(projects.getByRole('textbox',{name,exact:true})).toHaveValue(value);await projects.keyboard.press('Escape');await page.bringToFront();
 await drag('Older calendar task',nextDay,11);await waitTask('events:'+old.id,nextDay+'T11:00',nextDay+'T12:00');await synced('events:'+old.id,nextDay+'T11:00',nextDay+'T12:00');
 await resize('Older calendar task','end',30);await waitTask('events:'+old.id,nextDay+'T11:00',nextDay+'T12:30');
 await drag('Source objective',nextDay,14);await waitTask(objective.id,nextDay+'T14:00',nextDay+'T15:00');await resize('Source objective','end',30);await waitTask(objective.id,nextDay+'T14:00',nextDay+'T15:30');
 // Move only the first repeat occurrence; then resize that same occurrence.
 const repeatTitle='Repeating scheduled task';
 const firstRepeat=page.locator('[data-calendar-day="'+day+'"] [data-morph-event][title^="'+repeatTitle+'"]');
 const dt=await page.evaluateHandle(()=>new DataTransfer());const source=firstRepeat.locator('button[draggable=true]'),rect=await firstRepeat.boundingBox(),column=page.locator('[data-calendar-day="'+day+'"]'),slot=await column.locator('[data-hour="10"]').boundingBox();await source.dispatchEvent('dragstart',{dataTransfer:dt,clientX:rect.x+10,clientY:rect.y});await column.dispatchEvent('drop',{dataTransfer:dt,clientX:slot.x+10,clientY:slot.y+1});await source.dispatchEvent('dragend',{dataTransfer:dt});await dt.dispose();
 await expect.poll(async()=>Object.values((await read(repeatId)).exceptions)[0]?.start.slice(0,16)).toBe(day+'T10:00');
 await firstRepeat.getByRole('button',{name:/^Resize end/}).press('ArrowDown');
 await expect.poll(async()=>Object.values((await read(repeatId)).exceptions)[0]?.end.slice(0,16)).toBe(day+'T11:05');
 const repeated=await read(repeatId);assert.equal(repeated.start,day+'T09:00');assert.equal(Object.keys(repeated.exceptions).length,1);
 // A concurrent edit must win over a stale drag, with no duplicate or silent overwrite.
 const current=await read(id);await post('/api/planning/tasks',{operation:'details',id,timeZone:zone,expectedUpdatedAt:current.updatedAt,input:{...current,description:'Concurrent note'}});
 await drag('Native scheduled task',nextDay,18);await expect(page.getByRole('alert').filter({hasText:'changed elsewhere'})).toBeVisible();await waitTask(id,nextDay+'T13:45',nextDay+'T15:30');
 const after=await snapshot();assert.deepEqual(after.taskItems.map(t=>t.id).sort(),ids);assert.equal(after.state.events.length,before.state.events.length);assert.equal(after.state.taskPlans.length,before.state.taskPlans.length);
 for(const item of after.taskItems){const original=before.taskItems.find(t=>t.id===item.id);assert.equal(item.dueAt,original.dueAt);assert.deepEqual(item.linkedRefs,original.linkedRefs);assert.deepEqual(item.calendarIds,original.calendarIds);assert.equal(item.completed,original.completed);}
 assert.equal((await read(id)).description,'Concurrent note');assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(out,'calendar-after.png')});
 console.log('PASS: drag across days and zones; pointer resize both edges; native, older event and objective persistence; one repeating occurrence moved/resized; Personal and project tab refresh and preview; stale-write rejection; identities, due dates, links, statuses and record counts preserved.');
})().catch(async e=>{console.error(e);if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});





