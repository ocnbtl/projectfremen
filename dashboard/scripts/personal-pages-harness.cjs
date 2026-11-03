// Local-only regression: isolated synthetic data, no external browser requests.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const assert = require('assert/strict');
const { spawn } = require('child_process');
const app = path.resolve(__dirname, '..');
const { webkit, expect } = require(path.join(app, 'node_modules/@playwright/test'));
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'personal-pages-'));
const port = String(20000 + crypto.randomInt(30000));
const base = 'http://localhost:' + port;
const secret = crypto.randomBytes(24).toString('hex');
const server = spawn(process.execPath, [path.join(app, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', port], {
  cwd: app,
  env: { ...process.env, ADMIN_PASSWORD: 'test', ADMIN_SESSION_SECRET: secret, FREMEN_DATA_DIR: data, FREMEN_REQUIRE_SUPABASE: 'false', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', RESEND_API_KEY: '', VERCEL: '' },
  stdio: ['ignore', 'pipe', 'pipe']
});
// Do not send fixture mutations unless this isolated child actually bound its port.
const serverReady = new Promise((resolve, reject) => {
  let output = '';
  const timeout = setTimeout(() => reject(new Error('Local fixture server did not start')), 15000);
  timeout.unref();
  server.stdout.on('data', chunk => { output += chunk; if (output.includes('Ready in')) { clearTimeout(timeout); resolve(); } });
  server.stderr.on('data', () => {});
  server.once('error', error => { clearTimeout(timeout); reject(error); });
  server.once('exit', code => { clearTimeout(timeout); reject(new Error('Local fixture server exited: ' + code)); });
});




const output=path.join(app,'output/personal-pages');fs.mkdirSync(output,{recursive:true});let browser;
(async()=>{
 await serverReady;browser=await webkit.launch({executablePath:process.env.WEBKIT_EXECUTABLE});
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000},timezoneId:'America/New_York'});
 const payload='v1.'+(Date.now()+3600000)+'.qa';await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'fixture-csrf',url:base}]);await context.route(/^https:\/\//,r=>r.abort());
 const headers={origin:base,'x-csrf-token':'fixture-csrf'},post=async(route,data)=>{const response=await context.request.post(base+route,{headers,data});assert(response.ok(),await response.text());return response.json();};
 const today=new Date(),start=new Date(today.getFullYear(),today.getMonth(),today.getDate(),12);start.setDate(start.getDate()-(start.getDay()+6)%7);const day=start.toLocaleDateString('en-CA'),day2=new Date(start.getTime()+86400000).toLocaleDateString('en-CA');
 const ref={module:'people',objectType:'person',objectId:'fixture-person',label:'Jamie',route:'/admin/people?person=fixture-person'};
 const goal=(await post('/api/personal/ops',{family:'goals',input:{title:'Refine goal',outcome:'Finish a meaningful result',lifecycle:'active',dueAt:day2,domain:'Learning',keyResults:[{id:'result',title:'First result',complete:false}]}})).item;
 const follow=(await post('/api/personal/ops',{family:'followUps',input:{title:'Refine follow-up',followUpType:'person_check_in',context:'Ask Jamie about the proposal',followUpState:'open',dueAt:day,domain:'Relationships',linkedRefs:[ref]}})).item;
 const decision=(await post('/api/personal/ops',{family:'decisions',input:{title:'Refine decision',question:'Which option fits best?',decisionState:'considering',options:[{id:'option-a',title:'Option A',pros:['Clear scope'],cons:['Longer lead time'],selected:false}],rationale:'Compare the trade-offs',dueAt:day2}})).item;
 const obligation=(await post('/api/personal/ops',{family:'obligations',input:{title:'Refine obligation',consequence:'Keep the commitment',completionCriteria:[{id:'required',label:'Delivery checked',satisfied:false}],requiredEvidence:[{id:'receipt',label:'Receipt',required:true,state:'missing'}],dueAt:day2}})).item;
 const routine=(await post('/api/personal/ops',{secondaryFamily:'routines',input:{title:'Refine routine',summary:'Plan the coming week',lifecycle:'planned',cadenceRule:{frequency:'weekly',weekdays:[1],timezone:'America/New_York'},nextRunDate:day,nextRunTime:'09:00',completionCriteria:['Check calendar','Pick next actions']}})).item;
 const project=(await post('/api/projects',{operation:'create',family:'projects',input:{name:'Refine project',summary:'Test agenda',lifecycle:'active'}})).item;
 const milestone=(await post('/api/projects',{operation:'create',family:'milestones',input:{projectId:project.id,title:'Refine deadline',dueAt:day2,state:'planned'}})).item;
 const stamp=new Date().toISOString();const event={id:'event-fixture',calendarId:'cal',title:'Refine appointment',description:'',start:day+'T09:00:00',end:day+'T10:00:00',timeZone:'America/New_York',allDay:false,location:'',linkedRefs:[],recurrence:'FREQ=DAILY;COUNT=3',reminderMinutes:null,kind:'event',createdAt:stamp,updatedAt:stamp,exceptions:{[day2+'T09:00:00']:{cancelled:true}}};
 fs.writeFileSync(path.join(data,'planning-records.json'),JSON.stringify({schemaVersion:1,places:[],calendars:[{id:'cal',name:'Test',color:'#345678',visible:true,createdAt:stamp,updatedAt:stamp}],events:[event],connections:[],savedViews:[],reminders:[]}));
 const api=await context.request.get(base+'/api/personal/agenda?start='+day+'&timeZone=America%2FNew_York');assert.equal(api.status(),200);const agenda=await api.json();assert.equal(agenda.entries.filter(x=>x.id.startsWith('calendar:')).length,2,'Cancelled recurrence excluded');assert(agenda.entries.find(x=>x.id==='milestone:'+milestone.id));assert(agenda.entries.filter(x=>x.id.startsWith('calendar:')).every(x=>x.time==='9:00 AM – 10:00 AM'));
 assert.equal((await context.request.get(base+'/api/personal/agenda?start=bad')).status(),400);assert.equal((await context.request.get(base+'/api/personal/agenda?start=2026-02-31')).status(),400);const anonymous=await browser.newContext();assert.equal((await anonymous.request.get(base+'/api/personal/agenda?start='+day)).status(),401);await anonymous.close();
 const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));let agendaReads=0;page.on('request',r=>{if(r.url().includes('/api/personal/agenda'))agendaReads++;});
 await page.goto(base+'/admin/personal?query=Refine');await expect(page.getByRole('button',{name:'Open Refine goal',exact:true})).toBeVisible();assert.equal(agendaReads,0,'Today never fetches weekly sources');
 for(const label of ['Add Goal','Add Follow-up','Add Decision','Add Obligation','Add Routine','Add section'])await expect(page.getByRole('button',{name:label,exact:true})).toBeVisible();assert.equal(await page.getByRole('button',{name:'Customize',exact:true}).count(),0);
 await expect(page.getByRole('button',{name:'Add section',exact:true})).toBeEnabled();const home=page.getByRole('region',{name:'Your Personal workspace'});const goalFilter=home.getByRole('button',{name:/^Goals/});await expect(goalFilter).toHaveAttribute('aria-pressed','true');await goalFilter.click();await expect(page).toHaveURL(/types=goal/);await expect(page.getByRole('button',{name:'Open Refine follow-up',exact:true})).toHaveCount(0);await expect(goalFilter).toHaveAttribute('aria-pressed','true');await goalFilter.click();await expect(page.getByRole('button',{name:'Open Refine follow-up',exact:true})).toBeVisible();
 await page.screenshot({path:path.join(output,'home-desktop.png')});
 for(const [item,type,heading] of [[goal,'goal','Progress & key results'],[follow,'follow_up','Next action'],[decision,'decision','Options considered'],[obligation,'obligation','Requirements']]){
  await page.getByRole('button',{name:'Open '+item.title,exact:true}).click();const detail=page.locator('[data-record-overview="'+type+'"]');await expect(detail).toBeVisible();await expect(detail.getByRole('heading',{name:heading,exact:true})).toBeVisible();await page.screenshot({path:path.join(output,type+'-desktop.png')});
  if(type==='goal'){await detail.getByRole('checkbox',{name:'First result'}).click();await expect(detail.getByRole('checkbox',{name:'First result'})).toBeChecked();await expect(detail.getByRole('checkbox',{name:'First result'})).toBeEnabled();const saved=await(await context.request.get(base+'/api/personal/ops?family=goals&id='+goal.id)).json();assert(saved.item.keyResults[0].complete);}
  if(type==='follow_up'){
   await detail.getByRole('button',{name:'Record an outcome'}).click();const form=page.getByRole('dialog');await expect(form).toBeVisible();await form.getByLabel(/^Outcome \(optional\)/).fill('Jamie approved the proposal.');await form.getByRole('button',{name:'Save changes',exact:true}).click();await expect(form).toHaveCount(0);await expect(detail.getByText('Jamie approved the proposal.')).toBeVisible();const saved=await(await context.request.get(base+'/api/personal/ops?family=followUps&id='+follow.id)).json();assert.equal(saved.item.outcome,'Jamie approved the proposal.');assert.equal(saved.item.linkedRefs[0].objectId,'fixture-person');
  }
  if(type==='obligation'){
   const complete=page.getByRole('button',{name:'Complete',exact:true});await expect(complete).toBeDisabled();
   await detail.getByRole('checkbox',{name:'Delivery checked'}).click();await expect(detail.getByRole('checkbox',{name:'Delivery checked'})).toBeChecked();await expect(detail.getByRole('checkbox',{name:'Delivery checked'})).toBeEnabled();await expect(complete).toBeDisabled();
   await detail.getByRole('button',{name:'missing',exact:true}).click();await expect(detail.getByRole('button',{name:'received',exact:true})).toBeEnabled();await detail.getByRole('button',{name:'received',exact:true}).click();await expect(detail.getByRole('button',{name:'verified',exact:true})).toBeEnabled();await expect(complete).toBeEnabled();
   const saved=await(await context.request.get(base+'/api/personal/ops?family=obligations&id='+obligation.id)).json();assert(saved.item.completionCriteria[0].satisfied);assert.equal(saved.item.requiredEvidence[0].state,'verified');
  }
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),type+' mobile overflow');await page.screenshot({path:path.join(output,type+'-mobile.png')});
  await page.getByRole('button',{name:'Return to Personal',exact:true}).click();await expect(page.getByRole('button',{name:'Open '+item.title,exact:true})).toBeVisible();assert(new URL(page.url()).searchParams.get('query')==='Refine');await page.setViewportSize({width:1440,height:1000});
 }
 await page.getByRole('group',{name:'Personal time view'}).getByRole('button',{name:'This week',exact:true}).click();const week=page.getByRole('region',{name:'Personal weekly agenda'});await expect(week.getByText('Refine appointment').first()).toBeVisible();await expect(week.getByText('Refine deadline')).toBeVisible();assert.equal(agendaReads,1);await page.screenshot({path:path.join(output,'week-desktop.png')});await page.setViewportSize({width:390,height:844});await expect(page.locator('.workspace-actions-trigger')).toBeVisible();await page.waitForTimeout(350);await week.screenshot({path:path.join(output,'week-mobile.png')});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.goto(base+'/admin/personal/routines?selected='+routine.id);await expect(page.locator('[data-record-overview="routine"]')).toBeVisible();await page.screenshot({path:path.join(output,'routine-mobile.png')});
 await page.goto(base+'/admin/personal?query=Refine');await page.locator('.workspace-actions-trigger').click();await page.getByRole('button',{name:'Add Routine',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.screenshot({path:path.join(output,'create-routine-mobile.png')});
 assert.deepEqual(errors,[]);console.log('PASS five tailored details, goal persistence, filters, return state, week aggregation, recurrence cancellation, API auth/validation, mobile layout, Add Routine and zero Today agenda fetches');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
