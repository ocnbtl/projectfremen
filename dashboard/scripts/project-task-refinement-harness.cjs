// Synthetic local test server. Production calls and external browser requests are blocked.
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),assert=require('assert/strict'),{spawn}=require('child_process');
const {webkit,expect}=require('@playwright/test');
const app=path.resolve(__dirname,'..'),out=process.env.TASK_QA_OUTPUT||path.join(app,'output/project-task-refinement');fs.mkdirSync(out,{recursive:true});
const data=fs.mkdtempSync(path.join(os.tmpdir(),'tasks-browser-')),port=String(20000+crypto.randomInt(20000)),base='http://localhost:'+port,secret=crypto.randomBytes(24).toString('hex');
const server=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',port],{cwd:app,env:{...process.env,ADMIN_PASSWORD:'test',ADMIN_SESSION_SECRET:secret,FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',RESEND_API_KEY:'',VERCEL:'',MORGEN_API_KEY:''},stdio:['ignore','pipe','pipe']});
const ready=new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error('Local server did not start')),20000);server.stdout.on('data',d=>{log+=d;if(log.includes('Ready in')){clearTimeout(timer);resolve();}});server.stderr.on('data',()=>{});server.on('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code));});});
let browser,page;
(async()=>{
 await ready;browser=await webkit.launch({executablePath:process.env.WEBKIT_EXECUTABLE});const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000},timezoneId:'America/New_York'});
 const payload='v1.'+(Date.now()+3600000)+'.qa';await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'fixture-csrf',url:base}]);await context.route(/^https:\/\//,r=>r.request().url().startsWith('https://task-fixture.test/')?r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="#d9b093"/><circle cx="32" cy="25" r="12" fill="#243940"/><path d="M10 64v-9a22 22 0 0 1 44 0v9" fill="#243940"/></svg>'}):r.abort());
 const headers={origin:base,'x-csrf-token':'fixture-csrf'},post=async(route,data)=>{const response=await context.request.post(base+route,{headers,data});assert(response.ok(),await response.text());return response.json();};

 page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const snapshot=async()=>(await(await context.request.get(base+'/api/planning')).json());
 async function type(label,value){const input=page.getByRole('textbox',{name:label,exact:true});await input.fill(value);await input.press('Tab');}

 const create=async(family,input)=>(await post('/api/projects',{operation:'create',family,input})).item;
 const read=async(family,id)=>(await(await context.request.get(base+`/api/projects?family=${family}&id=${id}`)).json()).item;
 const project=await create('projects',{name:'Project local task refinement',description:'Original description',completionTarget:'Ten happy customers',lifecycle:'active',objectives:[{text:'Prototype objective',kind:'objective',targetAt:'2020-01-01'},{text:'Weekly check-in',kind:'routine'}]});
 const other=await create('projects',{name:'Unrelated project',objectives:[{text:'Never show unrelated task'}]});
 const milestone=await create('milestones',{projectId:project.id,title:'First customer',state:'complete',completedAt:'2022-07-15',completionNote:'A happy day',completionCriteria:['Keep this context']});
 await create('milestones',{projectId:project.id,title:'Next launch',dueAt:'2027-06-01'});
 assert.equal(milestone.completedAt,'2022-07-15');
 const stamped=await create('milestones',{projectId:project.id,title:'Late evening achievement',state:'complete',completedAt:'2024-07-16T02:30:00.000Z'});
 const detail=base+'/admin/projects/'+project.id;
 const tasks=()=>page.getByRole('region',{name:'Project tasks',exact:true});
 const rows=()=>tasks().getByRole('list',{name:'Tasks',exact:true}).getByRole('listitem');
 await page.goto(detail);
 await expect(rows()).toHaveCount(2);await expect(tasks()).not.toContainText('Never show unrelated task');
 await expect(page.getByRole('region',{name:'Project progress',exact:true})).toContainText('Ten happy customers');
 await expect(page.locator('li').filter({has:page.getByText('First customer',{exact:true})}).first()).toContainText('Reached Jul 15, 2022');
 await expect(page.getByRole('button',{name:'More project options'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Delete project',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Delete project',exact:true}).locator('svg')).toHaveAttribute('data-icon-role','delete');
 assert.equal(await page.getByRole('button',{name:'Inspect First customer'}).count(),0);
 // Completion writes through to the original project objective; Undo restores it.
 const initialTaskIds=(await snapshot()).taskItems.filter(t=>t.source?.projectId===project.id).map(t=>t.id).sort();
 await tasks().getByRole('button',{name:'Complete Prototype objective',exact:true}).click();await expect(rows()).toHaveCount(1);
 assert((await read('projects',project.id)).objectives[0].completedAt);
 await page.getByRole('complementary',{name:'Task completion'}).getByRole('button',{name:'Undo',exact:true}).click();await expect(rows()).toHaveCount(2);
 assert.equal((await read('projects',project.id)).objectives[0].completedAt,undefined);
 assert.deepEqual((await snapshot()).taskItems.filter(t=>t.source?.projectId===project.id).map(t=>t.id).sort(),initialTaskIds);
 assert.equal((await read('projects',project.id)).objectives[1].kind,'routine');
 await tasks().getByRole('button',{name:'Edit Prototype objective',exact:true}).click();await expect(tasks().getByRole('textbox',{name:'Task name'})).toHaveValue('Prototype objective');
 await tasks().getByRole('textbox',{name:'Task notes'}).fill('Keep shared notes');await tasks().getByRole('button',{name:'Save updates',exact:true}).click();await expect(rows()).toHaveCount(2);
 assert.equal((await snapshot()).taskItems.find(t=>t.title==='Prototype objective').description,'Keep shared notes');
 // A new task links to this project immediately, and is the same record elsewhere.
 await tasks().getByRole('button',{name:'Add task',exact:true}).click();await tasks().getByRole('textbox',{name:'Task name',exact:true}).fill('Linked project task');await tasks().getByRole('button',{name:'Save updates',exact:true}).click();await expect(rows()).toHaveCount(3);
 const linked=(await snapshot()).taskItems.filter(t=>t.title==='Linked project task');assert.equal(linked.length,1);assert(linked[0].linkedRefs.some(r=>r.objectId===project.id));
 const star=page.getByRole('button',{name:'Star project',exact:true});await star.click();await expect(page.getByRole('button',{name:'Remove star',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByText('Project starred.',{exact:true})).toHaveCount(0);
 await expect.poll(()=>page.getByRole('button',{name:'Remove star',exact:true}).locator('svg').evaluate(e=>getComputedStyle(e).fill)).toBe('rgb(154, 94, 40)');
 // Properties preserve the target on unrelated edits and update it in place.
 await page.getByRole('tab',{name:'Properties',exact:true}).click();await expect(page.getByRole('textbox',{name:'Completion target',exact:true})).toHaveValue('Ten happy customers');
 await page.getByRole('button',{name:'Edit properties',exact:true}).click();await page.getByRole('textbox',{name:'Description',exact:true}).fill('Updated description');await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.getByRole('button',{name:'Edit properties',exact:true})).toBeVisible();assert.equal((await read('projects',project.id)).completionTarget,'Ten happy customers');
 await page.getByRole('button',{name:'Edit properties',exact:true}).click();await page.getByRole('textbox',{name:'Completion target',exact:true}).fill('Twenty happy customers');await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.getByRole('button',{name:'Edit properties',exact:true})).toBeVisible();await page.getByRole('tab',{name:'Overview',exact:true}).click();await expect(page.getByRole('region',{name:'Project progress',exact:true})).toContainText('Twenty happy customers');
 await page.getByRole('tab',{name:'Activity',exact:true}).click();await expect(page.getByRole('button',{name:'Add update',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Log update',exact:true})).toHaveCount(0);
 const all=page.getByRole('group',{name:'Filter project activity'}).getByRole('button',{name:'All',exact:true});assert((await all.boundingBox()).width>=64);
 await page.getByRole('button',{name:'Edit First customer',exact:true}).click();let form=page.getByRole('form',{name:'Edit milestone',exact:true});await form.getByLabel('Reached on',{exact:true}).fill('2021-08-20');await form.getByRole('button',{name:'Save changes',exact:true}).click();await expect(form).toHaveCount(0);
 let saved=await read('milestones',milestone.id);assert.equal(saved.completedAt,'2021-08-20');assert.equal(saved.completionNote,'A happy day');assert.deepEqual(saved.completionCriteria,['Keep this context']);
 await page.goto(detail+'?tab=activity');await page.getByRole('button',{name:'Add milestone',exact:true}).click();form=page.getByRole('form',{name:'Add milestone',exact:true});await form.getByLabel('Milestone title').fill('An unplanned achievement');await form.getByLabel('Reached on',{exact:true}).fill('2023-02-11');await form.getByRole('button',{name:'Add milestone',exact:true}).click();await expect(form).toHaveCount(0);
 await page.goto(detail+'?tab=activity');await page.getByRole('button',{name:'Edit Late evening achievement',exact:true}).click();form=page.getByRole('form',{name:'Edit milestone',exact:true});await form.getByLabel('Owner').fill('Local owner');await form.getByRole('button',{name:'Save changes',exact:true}).click();await expect(form).toHaveCount(0);assert.equal((await read('milestones',stamped.id)).completedAt,stamped.completedAt,'unrelated edit preserves original achievement timestamp');
 const state=await(await context.request.get(base+'/api/projects')).json();const past=state.state.milestones.find(m=>m.title==='An unplanned achievement');assert.equal(past.state,'complete');assert.equal(past.completedAt,'2023-02-11');
 // Optimistic-concurrency guard still refuses an old milestone revision.
 const stale=await context.request.patch(base+'/api/projects',{headers,data:{family:'milestones',id:milestone.id,expectedUpdatedAt:milestone.updatedAt,patch:{completedAt:'2001-01-01'}}});assert.equal(stale.status(),409);assert.equal((await read('milestones',milestone.id)).completedAt,'2021-08-20');
 await page.goto(base+'/admin/projects');const directoryCard=page.locator('.resource-directory-card:visible').filter({has:page.getByRole('button',{name:'Open '+project.name,exact:true})});await expect(directoryCard).toHaveCount(1);await expect(directoryCard.getByRole('button',{name:'Remove star',exact:true})).toBeVisible();await expect.poll(()=>directoryCard.getByRole('button',{name:'Remove star',exact:true}).locator('svg').evaluate(e=>getComputedStyle(e).fill)).toBe('rgb(154, 94, 40)');await expect(page.getByRole('group',{name:'Project views',exact:true})).toBeVisible();await directoryCard.getByRole('button',{name:'Open '+project.name,exact:true}).click();await expect(page.getByRole('group',{name:'Project views',exact:true})).toHaveCount(0);await expect(tasks()).toBeVisible();
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});await page.goto(detail);await expect(rows()).toHaveCount(3);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'project fits '+width);await page.screenshot({path:path.join(out,'overview-'+width+'.png')});await tasks().getByRole('button',{name:'Add task',exact:true}).click();await expect(tasks().getByRole('textbox',{name:'Task name'})).toBeVisible();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'task form fits '+width);await tasks().locator('.work-object-links').scrollIntoViewIfNeeded();assert((await tasks().locator('.work-object-links .work-links > span > a').first().boundingBox()).width>120,'linked project has readable width');await page.screenshot({path:path.join(out,'task-editor-'+width+'.png')});await tasks().getByRole('button',{name:'Back to tasks',exact:true}).click();await page.getByRole('tab',{name:'Activity',exact:true}).click();await page.screenshot({path:path.join(out,'activity-'+width+'.png')});}
 await page.goto(base+'/admin/personal');await page.getByRole('searchbox',{name:'Search tasks',exact:true}).fill('Linked project task');await expect(page.getByRole('list',{name:'Tasks',exact:true}).getByRole('listitem')).toHaveCount(1);
 await page.goto(base+'/admin/calendar');await page.getByRole('button',{name:'Tasks',exact:true}).click();await page.getByRole('searchbox',{name:'Search tasks',exact:true}).fill('Linked project task');await page.getByRole('group',{name:'Task period'}).getByRole('button',{name:'All tasks',exact:true}).click();await expect(page.getByRole('list',{name:'Tasks',exact:true}).getByRole('listitem')).toHaveCount(1);
 assert.equal((await snapshot()).taskItems.filter(t=>t.title==='Linked project task').length,1);assert.deepEqual(errors,[]);
 console.log('PASS: project Tasks use original objectives, completion/Undo sync, notes, linked creation without duplicates, Personal and Calendar, past milestone dates/create/edit/stale protection, completion target preserved and updated, brown star without banner, desktop and mobile layouts.');
})().catch(async e=>{console.error(e);if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
