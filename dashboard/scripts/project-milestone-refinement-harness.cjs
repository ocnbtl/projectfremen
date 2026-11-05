// Local-only regression: isolated synthetic data, no external browser requests.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const assert = require('assert/strict');
const { spawn } = require('child_process');
const app = path.resolve(__dirname, '..');
const { chromium, expect } = require(path.join(app, 'node_modules/@playwright/test'));
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'project-cards-'));
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
const output = path.join(os.tmpdir(), 'fremen-milestone-refinement');
fs.mkdirSync(output, { recursive: true });
let browser, page;
(async()=>{await serverReady;browser=await chromium.launch();const context=await browser.newContext({timezoneId:'America/New_York'}),payload=`v1.${Date.now()+3600000}.qa`;await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'fixture-csrf',url:base}]);await context.route(/^https:\/\//,r=>r.abort());const headers={origin:base,'x-csrf-token':'fixture-csrf'},post=async(route,data)=>{const r=await context.request.post(base+route,{headers,data});assert(r.ok(),await r.text());return r.json();};


const create=async(family,input)=>(await post('/api/projects',{operation:'create',family,input})).item;
const read=async(family,id)=>(await (await context.request.get(base+`/api/projects?family=${family}&id=${id}`)).json()).item;
const patch=async(family,item,changes)=>{const r=await context.request.patch(base+'/api/projects',{headers,data:{family,id:item.id,expectedUpdatedAt:item.updatedAt,patch:changes}});assert(r.ok(),await r.text());return (await r.json()).item;};
let project=await create('projects',{name:'Milestone workflow',lifecycle:'active',description:'Local-only fixture.',objectives:[{text:'Finish the prototype',targetAt:'2020-01-01'}]});
const longTitle='Our first customer celebrates a successful launch with the entire team';
let milestone=await create('milestones',{projectId:project.id,title:longTitle,dueAt:'2020-01-01'});
let undated=await create('milestones',{projectId:project.id,title:'An unexpected achievement'});assert.equal(undated.dueAt,'');assert.deepEqual(undated.completionCriteria,[]);
undated=await patch('milestones',undated,{state:'complete'});assert(undated.completedAt);assert.equal(undated.completionNote,undefined);
let criteria=await create('milestones',{projectId:project.id,title:'Criteria remain optional',completionCriteria:['Preserved definition'],owner:'Original owner'});criteria=await patch('milestones',criteria,{state:'complete',completionNote:'Useful reflection'});assert.deepEqual(criteria.completionCriteria,['Preserved definition']);
page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/admin/projects');await page.getByRole('searchbox').fill(project.name);const card=page.locator('.resource-directory-card:visible');await expect(card).toHaveCount(1);await expect(card).toContainText('1 overdue objective');await expect(card).not.toContainText('overdue milestone');
const detail=base+'/admin/projects/'+project.id;
await page.goto(detail+'?tab=activity');await page.getByRole('button',{name:'Add milestone',exact:true}).click();let form=page.getByRole('form',{name:'Add milestone',exact:true});await expect(form).toBeVisible();await form.getByLabel('Milestone title').fill('Created with only a title');await expect(form.getByRole('button',{name:'Optional details'})).toHaveAttribute('aria-expanded','false');await form.getByRole('button',{name:'Add milestone',exact:true}).click();await expect(form).toHaveCount(0);
let panel=page.getByRole('region',{name:'Created with only a title',exact:true});await expect(panel).toBeVisible();await expect(panel).not.toContainText('Add completion criteria');await panel.getByRole('button',{name:'Mark reached',exact:true}).click();const confirm=page.getByRole('dialog',{name:'Mark this milestone reached?',exact:true});await expect(confirm.getByRole('button',{name:'Mark reached',exact:true})).toBeEnabled();await confirm.getByRole('button',{name:'Mark reached',exact:true}).click();await expect(confirm).toHaveCount(0);await expect(panel).toContainText('Reached');
const state=()=>context.request.get(base+'/api/projects').then(r=>r.json()).then(r=>r.state);let native=(await state()).milestones.find(m=>m.title==='Created with only a title');assert(native.completedAt);assert.equal(native.completionNote,undefined);assert.deepEqual(native.completionCriteria,[]);
await page.goto(detail+'?tab=activity&item='+milestone.id);panel=page.getByRole('region',{name:longTitle,exact:true});await panel.getByRole('button',{name:'Edit milestone',exact:true}).click();form=page.getByRole('form',{name:'Edit milestone',exact:true});await form.getByLabel('Milestone title').fill('First happy customer');await form.getByLabel('Owner').fill('Ocean');await form.getByLabel('Target date').fill('2026-12-01');await form.getByRole('button',{name:'Optional details'}).click();await form.getByLabel('Success criteria').fill('Customer confirms the result');await form.getByRole('button',{name:'Save changes'}).click();await expect(form).toHaveCount(0);await expect(page.getByRole('region',{name:'First happy customer',exact:true})).toBeVisible();milestone=await read('milestones',milestone.id);assert.equal(milestone.owner,'Ocean');assert.equal(milestone.dueAt,'2026-12-01');assert.deepEqual(milestone.completionCriteria,['Customer confirms the result']);
await page.reload();panel=page.getByRole('region',{name:'First happy customer',exact:true});await panel.getByRole('button',{name:'Edit milestone',exact:true}).click();form=page.getByRole('form',{name:'Edit milestone',exact:true});await form.getByLabel('Owner').fill('');await form.getByLabel('Target date').fill('');await form.getByLabel('Success criteria').fill('');await form.getByRole('button',{name:'Save changes'}).click();await expect(form).toHaveCount(0);milestone=await read('milestones',milestone.id);assert.equal(milestone.owner,undefined);assert.equal(milestone.dueAt,'');assert.deepEqual(milestone.completionCriteria,[]);
// Captured versions protect edits from another session; no stale overwrite.
await panel.getByRole('button',{name:'Edit milestone',exact:true}).click();form=page.getByRole('form',{name:'Edit milestone',exact:true});await form.getByLabel('Milestone title').fill('Stale editor title');milestone=await patch('milestones',milestone,{description:'Saved by another session'});await form.getByRole('button',{name:'Save changes'}).click();await expect(form.getByRole('alert')).toContainText(/changed|updated|stale|version/i);assert.equal((await read('milestones',milestone.id)).title,'First happy customer');await form.getByRole('button',{name:'Close Edit milestone'}).click();await page.getByRole('button',{name:'Discard changes',exact:true}).click();await expect(form).toHaveCount(0);
// Stable source links and responsive inspection/forms; no external services enabled.
for(const width of [1440,820,390,320]){
 await page.setViewportSize({width,height:1000});await page.goto(detail+'?tab=activity&item='+milestone.id);panel=page.getByRole('region',{name:'First happy customer',exact:true});
 await panel.getByRole('button',{name:'Linked work',exact:true}).focus();await page.keyboard.press('Enter');await expect(panel.getByRole('link',{name:'Add follow-up'})).toBeVisible();await expect(panel.getByRole('link',{name:'Add decision'})).toBeVisible();assert((await panel.getByRole('link',{name:'Add follow-up'}).getAttribute('href')).includes(encodeURIComponent(milestone.id)));
 await panel.getByRole('button',{name:'Record details',exact:true}).click();await expect(panel.getByText(milestone.id,{exact:true})).toBeVisible();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Inspection overflow '+width);await panel.screenshot({path:path.join(output,'inspection-'+width+'.png')});
 await panel.getByRole('button',{name:'Close inspection'}).click();const filters=page.getByRole('group',{name:'Filter project activity'});await filters.getByRole('button',{name:'Milestones',exact:true}).click();await expect(filters.getByRole('button',{name:'Milestones',exact:true})).toHaveAttribute('aria-pressed','true');await page.waitForTimeout(300);await filters.getByRole('button',{name:'All',exact:true}).click();await page.waitForTimeout(300);await page.screenshot({path:path.join(output,'activity-'+width+'.png')});
 await page.getByRole('button',{name:'Add milestone',exact:true}).click();form=page.getByRole('form',{name:'Add milestone',exact:true});await form.getByRole('button',{name:'Optional details'}).click();await expect(form.getByLabel('Success criteria')).toBeVisible();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Form overflow '+width);await form.screenshot({path:path.join(output,'form-'+width+'.png')});await form.getByRole('button',{name:'Close Add milestone'}).click();
}
// Milestone past dates never become project attention; overdue objectives clear when reached.
project=await patch('projects',await read('projects',project.id),{objectives:[{...project.objectives[0],completed:true}]});await page.goto(base+'/admin/projects');await page.getByRole('searchbox').fill(project.name);await expect(card).not.toContainText('overdue');
// Read-only parent and archived milestone protection remain on the API and UI.
project=await patch('projects',project,{lifecycle:'archived',archiveReason:'Local fixture only',archiveConfirmed:true});await page.goto(detail+'?tab=activity&item='+milestone.id);panel=page.getByRole('region',{name:'First happy customer',exact:true});await expect(panel.getByRole('button',{name:'Edit milestone',exact:true})).toHaveCount(0);await expect(panel.getByRole('button',{name:'Mark reached',exact:true})).toHaveCount(0);const denied=await context.request.patch(base+'/api/projects',{headers,data:{family:'milestones',id:milestone.id,expectedUpdatedAt:milestone.updatedAt,patch:{title:'Must not save'}}});assert.equal(denied.status(),409);assert.equal((await read('milestones',milestone.id)).title,'First happy customer');
assert.deepEqual(errors,[]);console.log('PASS: optional milestone fields, reached without criteria/note, create/edit/reload/clear, preserved criteria, stale and read-only guards, objective-only overdue, responsive forms/inspection/linked work/activity.');console.log('Screenshots: '+output);
})().catch(async e=>{console.error(e);await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});