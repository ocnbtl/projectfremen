// Local-only regression: isolated synthetic data, no external browser requests.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const assert = require('assert/strict');
const { spawn } = require('child_process');
const app = path.resolve(__dirname, '..');
const { chromium, expect } = require(path.join(app, 'node_modules/@playwright/test'));
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'event-outcomes-'));
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
const output = path.join(app, 'output/integrated-work');
fs.mkdirSync(output, { recursive: true });
let browser, page;
(async()=>{await serverReady;browser=await chromium.launch();const context=await browser.newContext({timezoneId:'America/New_York'}),payload=`v1.${Date.now()+3600000}.qa`;await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'fixture-csrf',url:base}]);await context.route(/^https:\/\//,r=>r.abort());const headers={origin:base,'x-csrf-token':'fixture-csrf'},post=async(route,data)=>{const r=await context.request.post(base+route,{headers,data});assert(r.ok(),await r.text());return r.json();};
const get=async route=>{const r=await context.request.get(base+route);assert(r.ok(),await r.text());return r.json();};
const patchOps=async(family,item,patch)=>{const r=await context.request.patch(base+'/api/personal/ops',{headers,data:{family,id:item.id,expectedUpdatedAt:item.updatedAt,patch}});assert(r.ok(),await r.text());return (await r.json()).item;};
const make=async(family,input)=>(await post('/api/personal/ops',{family,input})).item;
const person=(await post('/api/personal/records',{domain:'family',className:'person',title:'Local Alex',status:'active'})).items.find(p=>p.title==='Local Alex');
const personRef={module:'people',objectType:'person',objectId:person.id,label:person.title,route:'/admin/people/'+person.id};
const eventBase={title:'Local planning call',description:'Discuss next steps.',start:'2026-11-02T10:00',end:'2026-11-02T12:00',timeZone:'America/New_York',allDay:false,calendarId:'native',location:'',linkedRefs:[personRef],recurrence:'',reminderMinutes:null,kind:'event',interactionKind:'call',exceptions:{}};
const saveEvent=async input=>(await post('/api/planning',{operation:'save',collection:'events',input,expectedUpdatedAt:input.id?(await get('/api/planning?view=calendar')).state.events.find(e=>e.id===input.id).updatedAt:undefined})).item;
let event=await saveEvent(eventBase);
const sourceOf=(event,key=event.recurrence?event.start+":00":event.start)=>({family:'events',id:event.id,occurrenceKey:key,expectedUpdatedAt:event.updatedAt});
const input={interactionKind:'call',note:'Agreed on the next actions.',nextSteps:[{type:'follow_up',title:'Send the proposal',dueAt:'2026-11-04'},{type:'decision',title:'Choose the service',dueAt:'2026-11-05'},{type:'goal',title:'Launch the project',dueAt:'2026-12-01'}]};
const source=sourceOf(event);
let r=await context.request.post(base+'/api/planning/outcomes',{data:{source,input}});assert.equal(r.status(),403,'CSRF protection');
r=await context.request.post(base+'/api/planning/outcomes',{headers,data:{source:{...source,expectedUpdatedAt:'old'},input}});assert.equal(r.status(),409,'Stale edits rejected');
const receipts=await Promise.all([post('/api/planning/outcomes',{source,input}),post('/api/planning/outcomes',{source,input})]);assert.equal(receipts[0].receipt.id,receipts[1].receipt.id);assert.equal(receipts[0].receipt.refs.length,4);
await post('/api/planning/outcomes',{source,input});
r=await context.request.post(base+'/api/planning/outcomes',{headers,data:{source,input:{...input,note:'Changed'}}});assert.equal(r.status(),409,'Retry payload cannot overwrite saved content');
let records=(await get('/api/personal/records?domain=notes-docs')).items;let interaction=records.find(p=>p.className==='interaction');assert(interaction);assert.equal(records.filter(p=>p.className==='interaction').length,1);assert.equal(interaction.interaction.kind,'call');assert.equal(interaction.interaction.startTime,'10:00');assert.equal(interaction.interaction.endTime,'12:00');assert.match(interaction.body,/Agreed on/);
let planning=await get('/api/planning?view=calendar');let completed=planning.state.events.find(e=>e.id===event.id);assert(completed.completed);assert(!planning.state.outcomeReceipts,'Recovery payload is not preloaded');assert.equal(completed.linkedRefs.length,5);assert(planning.workEvents.some(e=>e.title==='Send the proposal'));assert(planning.workEvents.some(e=>e.title==='Choose the service'));
const opsState=()=>JSON.parse(fs.readFileSync(path.join(data,'personal-ops.json'),'utf8'));let ops=opsState();assert.equal(ops.goals.length,1);assert.equal(ops.followUps.length,1);assert.equal(ops.decisions.length,1);
const beforeLinks=JSON.parse(fs.readFileSync(path.join(data,'note-links.json'),'utf8')).links;assert.equal(beforeLinks.length,5);assert(beforeLinks.every(l=>l.noteRef.objectId===interaction.id));
// Reopen/recomplete preserves the same interaction and next-step IDs.
let reopened=await saveEvent({id:event.id,completed:false});await post('/api/planning/outcomes',{source:sourceOf(reopened),input});planning=await get('/api/planning?view=calendar');assert(planning.state.events.find(e=>e.id===event.id).completed);assert.equal(opsState().goals.length,1);
// Moving a completed one-off event and completing it again must not create a second interaction.
const rescheduled=await saveEvent({id:event.id,completed:false,start:'2026-11-03T10:00',end:'2026-11-03T12:00'});await post('/api/planning/outcomes',{source:sourceOf(rescheduled),input});assert.equal((await get('/api/personal/records?domain=notes-docs')).items.filter(p=>p.className==='interaction').length,1);
// Different recurring occurrences produce different interactions, never complete the series.
const recurring=await saveEvent({...eventBase,title:'Weekly local call',recurrence:'FREQ=WEEKLY;COUNT=3'});
const repeatInput={interactionKind:'call',note:'Weekly recap',nextSteps:[]};await post('/api/planning/outcomes',{source:sourceOf(recurring),input:repeatInput});planning=await get('/api/planning?view=calendar');let repeat=planning.state.events.find(e=>e.id===recurring.id);assert(repeat.exceptions['2026-11-02T10:00:00'].completed);assert(!repeat.completed);await post('/api/planning/outcomes',{source:sourceOf(repeat,'2026-11-09T10:00:00'),input:repeatInput});records=(await get('/api/personal/records?domain=notes-docs')).items;assert.equal(records.filter(p=>p.className==='interaction').length,3);
// Invalid occurrence and invalid date cannot reserve a completion.
r=await context.request.post(base+'/api/planning/outcomes',{headers,data:{source:sourceOf(repeat,'2026-11-10T10:00'),input:repeatInput}});assert([400,409].includes(r.status()));
const noPeople=await saveEvent({...eventBase,title:'Local solo reflection',linkedRefs:[],interactionKind:'none'});r=await context.request.post(base+'/api/planning/outcomes',{headers,data:{source:sourceOf(noPeople),input:{interactionKind:'none',note:'',nextSteps:[{type:'goal',title:'Invalid date',dueAt:'2026-02-31'}]}}});assert.equal(r.status(),400);
await post('/api/planning/outcomes',{source:sourceOf(noPeople),input:{interactionKind:'none',note:'Solo event note',nextSteps:[]}});records=(await get('/api/personal/records?domain=notes-docs')).items;assert.equal(records.find(p=>p.title==='Local solo reflection').noteType,'event');
// Personal source projections complete the original record, without a second task.
planning=await get('/api/planning?view=calendar');const follow=planning.workEvents.find(e=>e.title==='Send the proposal'),decision=planning.workEvents.find(e=>e.title==='Choose the service');const workSource=e=>({family:e.workSource.family,id:e.workSource.id,occurrenceKey:e.start,expectedUpdatedAt:e.updatedAt});
await post('/api/planning/outcomes',{source:workSource(follow),input:{interactionKind:'none',note:'Sent today',nextSteps:[]}});
r=await context.request.post(base+'/api/planning/outcomes',{headers,data:{source:workSource(decision),input:{interactionKind:'none',note:'',nextSteps:[]}}});assert.equal(r.status(),400);
await post('/api/planning/outcomes',{source:workSource(decision),input:{interactionKind:'none',note:'Reason for the decision',decision:'Use the smaller service',nextSteps:[]}});ops=opsState();assert.equal(ops.followUps[0].followUpState,'complete');assert.equal(ops.decisions[0].decisionState,'decided');assert.equal(ops.decisions[0].finalDecision,'Use the smaller service');
// Full new status catalog round trips, retaining the original completion guard.
let goal=ops.goals[0];for(const goalState of ['waiting','blocked','paused','cancelled','active','planned','draft','complete']){goal=await patchOps('goals',goal,{goalState});assert.equal(goal.goalState,goalState);}goal=await patchOps('goals',goal,{goalState:'blocked'});
let d=await make('decisions',{title:'Local decision statuses',question:'What should we choose?',decisionState:'open'});for(const decisionState of ['considering','waiting','cancelled','open']){d=await patchOps('decisions',d,{decisionState,lifecycle:'active'});assert.equal(d.decisionState,decisionState);}
const guarded=await make('goals',{title:'Local guarded goal',outcome:'Ship safely',keyResults:[{title:'Verification',complete:false}]});r=await context.request.patch(base+'/api/personal/ops',{headers,data:{family:'goals',id:guarded.id,expectedUpdatedAt:guarded.updatedAt,patch:{goalState:'complete'}}});assert(!r.ok(),'Incomplete key results remain protected');
// Editing the Notes body edits the same canonical interaction, preserving participants/time.
r=await context.request.patch(base+'/api/personal/records',{headers,data:{id:interaction.id,body:'Edited shared recap'}});assert(r.ok(),await r.text());records=(await get('/api/personal/records?domain=notes-docs')).items;interaction=records.find(p=>p.id===interaction.id);assert.equal(interaction.body,'Edited shared recap');assert.equal(interaction.interaction.endTime,'12:00');
// A staged completion can resume after a simulated crash before its final receipt write.
const diskPath=path.join(data,'planning-records.json'),disk=JSON.parse(fs.readFileSync(diskPath,'utf8'));const pending=disk.outcomeReceipts.find(item=>item.id===receipts[0].receipt.id);delete pending.completedAt;delete pending.refs;fs.writeFileSync(diskPath,JSON.stringify(disk));await post('/api/planning/outcomes',{source,input});records=(await get('/api/personal/records?domain=notes-docs')).items;assert.equal(records.find(r=>r.id===interaction.id).body,'Edited shared recap');assert.equal(opsState().goals.length,2);
// Manual Notes links use canonical target labels/routes and preserve all linked work.
const noteRef={module:'notes',objectType:'note',objectId:interaction.id,label:interaction.title,route:'/admin/notes/'+interaction.id};
await post('/api/notes/links',{input:{noteRef,targetRef:{...personRef,label:'Forged label',route:'https://example.invalid'},relationship:'context'}});
const extraGoal=await make('goals',{title:'Manual linked goal',outcome:'Visible linked goal'});const extraRef={module:'personal_ops',objectType:'goal',objectId:extraGoal.id,label:extraGoal.title,route:'/admin/personal/goals'};await post('/api/notes/links',{input:{noteRef,targetRef:extraRef,relationship:'context'}});
let noteLinks=(await get('/api/notes/links?noteId='+interaction.id)).items;assert(noteLinks.some(l=>l.targetRef.objectId===person.id&&l.targetRef.label==='Local Alex'&&!l.targetRef.route.startsWith('http')));assert(noteLinks.some(l=>l.targetRef.objectId===extraGoal.id));
// Multi-day interactions retain the full calendar range instead of claiming a shorter visit.
const overnight=await saveEvent({...eventBase,title:'Long local visit',start:'2026-11-02T10:00',end:'2026-11-03T12:00'});await post('/api/planning/outcomes',{source:sourceOf(overnight),input:{interactionKind:'memory',note:'Travel together',nextSteps:[]}});records=(await get('/api/personal/records?domain=notes-docs')).items;const long=records.find(r=>r.title==='Long local visit');assert(!long.interaction.endTime);assert.match(long.body,/2026-11-03T12:00/);
const uiEvent=await saveEvent({...eventBase,title:'Local UI completion',start:'2026-11-02T14:00',end:'2026-11-02T15:00'});
page=await context.newPage();const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
const snap=async name=>{await page.waitForTimeout(300);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),name+' overflow');await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});};
for(const width of [1440,390]){
 await page.setViewportSize({width,height:1000});await page.goto(base+'/admin/notes/'+interaction.id);await expect(page.getByRole('heading',{name:'Local planning call',exact:true})).toBeVisible();for(const tab of ['Links','Properties','History']){await page.getByRole('tab',{name:new RegExp('^'+tab)}).click();await snap('notes-'+tab.toLowerCase()+'-'+width);}
 await page.goto(base+'/admin/notes');await expect(page.getByRole('region',{name:'Connected Personal work'})).toBeVisible();await snap('notes-directory-'+width);await page.getByRole('button',{name:'Open Local planning call',exact:true}).click();for(const tab of ['Links','Properties','History']){await page.getByRole('tab',{name:new RegExp('^'+tab)}).click();await snap('notes-card-'+tab.toLowerCase()+'-'+width);}
 await page.goto(base+'/admin/calendar?view=day&date=2026-11-02');await page.getByText('Local UI completion',{exact:true}).first().click();await page.getByRole('button',{name:'Complete',exact:true}).click();await expect(page.getByRole('dialog',{name:'Complete event'})).toBeVisible();await page.getByRole('button',{name:'Follow-up',exact:true}).click();await page.getByLabel('Next step 1',{exact:true}).fill('UI follow-up');await page.getByLabel('Completion notes').fill('UI recap');await snap('completion-'+width);if(width===390){await page.getByRole('button',{name:'Complete & save',exact:true}).click();await expect(page.getByRole('dialog',{name:'Complete event'})).toHaveCount(0);const uiRecords=(await get('/api/personal/records?domain=notes-docs')).items;assert(uiRecords.some(r=>r.title==='Local UI completion'&&r.interaction&&r.body.includes('UI recap')));}else await page.getByRole('button',{name:'Cancel',exact:true}).click();
}
// Notes types are selectable and survive reload without changing a shared interaction.
await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/admin/notes?view=event-notes');await expect(page.getByRole('button',{name:'Open Local solo reflection',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Open Local planning call',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Open Local solo reflection',exact:true}).click();await page.getByRole('tab',{name:'Note',exact:true}).click();await page.getByRole('link',{name:'Edit',exact:true}).click();await page.getByRole('combobox',{name:'Note type',exact:true}).click();await page.getByRole('option',{name:'Research',exact:true}).click();await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('button',{name:'Save',exact:true})).toBeDisabled();await page.reload();await expect(page.getByRole('combobox',{name:'Note type',exact:true})).toContainText('Research');
assert.deepEqual(pageErrors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,checks:['authorization','stale write','concurrent/retried completion deduplication','reopen and recomplete','per-occurrence logging','invalid dates','canonical Personal projection','status persistence and completion guards','shared interaction content','desktop/mobile Notes and completion UI'],data},null,2));console.log('PASS integrated Calendar / Personal / Notes workflows');
})().catch(async error=>{console.error(error);if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
