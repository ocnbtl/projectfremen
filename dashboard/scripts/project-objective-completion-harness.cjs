// Local-only regression: isolated synthetic data, no external browser requests.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const assert = require('assert/strict');
const { spawn } = require('child_process');
const app = path.resolve(__dirname, '..');
const { chromium, expect } = require(path.join(app, 'node_modules/@playwright/test'));
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'project-objectives-'));
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
const output = path.join(os.tmpdir(), 'fremen-project-objective-completion-qa');
fs.mkdirSync(output, { recursive: true });
let browser,page;
(async()=>{
 await serverReady;browser=await chromium.launch();const context=await browser.newContext(),payload=`v1.${Date.now()+3600000}.qa`;
 await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'fixture-csrf',url:base}]);
 await context.route(/^https?:\/\//,r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const headers={origin:base,'x-csrf-token':'fixture-csrf'},post=async(route,data)=>{const r=await context.request.post(base+route,{headers,data});assert(r.ok(),await r.text());return r.json();};
 const create=async input=>(await post('/api/projects',{operation:'create',family:'projects',input})).item;

 const target=await create({name:'Complete card target',lifecycle:'active',description:'Keep this description',objectives:[{text:'First overdue',targetAt:'2020-01-01'},{text:'Second overdue',targetAt:'2020-02-01'},{text:'Future sibling',targetAt:'2099-01-01'}]});
 const linked=await create({name:'Complete linked goal',lifecycle:'active'});
 const goal=(await post('/api/personal/ops',{family:'goals',input:{title:'Linked personal goal',outcome:'A result',domain:'Home',sourceRefs:[{module:'projects',objectType:'project',objectId:linked.id,label:linked.name,route:'/admin/projects/'+linked.id}]}})).item;
 const finished=await create({name:'Complete locked project',lifecycle:'active',objectives:[{text:'Locked objective'}]});
 const fixtureFile=path.join(data,'projects.json'),fixture=JSON.parse(fs.readFileSync(fixtureFile,'utf8'));fixture.projects.find(r=>r.id===finished.id).lifecycle='complete';fs.writeFileSync(fixtureFile,JSON.stringify(fixture));
 const read=async()=> (await (await context.request.get(base+'/api/projects?family=projects&id='+target.id)).json()).item;
 page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/admin/projects?q=Complete');
 const card=page.getByRole('listitem').filter({has:page.getByRole('button',{name:'Open Complete card target',exact:true})});
 const toggle=(text,done=false)=>card.getByRole('checkbox',{name:(done?'Reopen':'Complete')+' objective: '+text,exact:true});
 await expect(card).toContainText('2 overdue objectives');const initial=await read(),url=page.url();
 await toggle('First overdue').scrollIntoViewIfNeeded();const before=await card.boundingBox(),order=await page.locator('.resource-card-title').allTextContents();
 let release;const delayed=new Promise(resolve=>release=resolve);let writes=0;
 await page.route('**/api/projects',async route=>{if(route.request().method()==='PATCH'){writes++;await delayed;}await route.continue();});
 await toggle('First overdue').click();await expect(toggle('First overdue',true)).toHaveAttribute('aria-checked','true');await expect(toggle('First overdue',true)).toBeDisabled();await expect(card).toContainText('1 overdue objective');await expect(card).not.toContainText('2 overdue');assert.equal((await read()).objectives[0].completedAt,undefined,'server has not saved yet');await expect(page.getByRole('dialog')).toHaveCount(0);assert.equal(page.url(),url);release();await expect(toggle('First overdue',true)).toBeEnabled();assert.equal(writes,1);await page.unroute('**/api/projects');
 let saved=await read();assert(saved.objectives[0].completedAt);assert.deepEqual(saved.objectives.slice(1),initial.objectives.slice(1));assert.equal(saved.description,initial.description);assert.deepEqual(await page.locator('.resource-card-title').allTextContents(),order);assert(Math.abs((await card.boundingBox()).y-before.y)<3);assert.equal((await card.boundingBox()).height,before.height);
 await toggle('Second overdue').press('Space');await expect(toggle('Second overdue',true)).toBeEnabled();await expect(card.locator('.resource-card-signal')).not.toContainText('overdue');await page.reload();await expect(toggle('First overdue',true)).toHaveAttribute('aria-checked','true');await expect(card.locator('.resource-card-signal')).not.toContainText('overdue');
 await toggle('First overdue',true).click();await expect(toggle('First overdue')).toBeEnabled();await expect(card).toContainText('1 overdue objective');assert.equal((await read()).objectives[0].completedAt,undefined);
 // Failed saves roll back both the check and warning.
 await page.route('**/api/projects',r=>r.request().method()==='PATCH'?r.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Local save failure',error:'Local save failure'})}):r.continue());
 await toggle('First overdue').click();await expect(toggle('First overdue')).toBeEnabled();await expect(card).toContainText('1 overdue objective');await expect(page.getByRole('alert').first()).toBeVisible();assert.equal((await read()).objectives[0].completedAt,undefined);await page.unroute('**/api/projects');
 // Stale snapshot cannot erase another session's objective text or dates.
 saved=await read();const changed=await context.request.patch(base+'/api/projects',{headers,data:{family:'projects',id:target.id,expectedUpdatedAt:saved.updatedAt,patch:{objectives:saved.objectives.map((o,i)=>({...o,text:i===2?'Preserved concurrent sibling':o.text}))}}});assert(changed.ok(),await changed.text());
 await toggle('First overdue').click();await expect(toggle('First overdue')).toBeEnabled();await expect(page.getByRole('alert').first()).toBeVisible();await expect(card).toContainText('Preserved concurrent sibling');assert.equal((await read()).objectives[0].completedAt,undefined);
 // The same control in all views and mobile sizes; no navigation or resizing.
 for(const width of [1440,390,320]) {await page.setViewportSize({width,height:900});for(let view=0;view<3;view++){
  await toggle('First overdue').scrollIntoViewIfNeeded();const height=(await card.boundingBox()).height;await toggle('First overdue').click();await expect(toggle('First overdue',true)).toBeEnabled();await expect(card.locator('.resource-card-signal')).not.toContainText('overdue');assert.equal((await card.boundingBox()).height,height);assert.equal(page.url().split('?')[0],base+'/admin/projects');await expect(page.getByRole('dialog')).toHaveCount(0);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await card.screenshot({path:path.join(output,`card-${width}-${view}.png`)});
  await toggle('First overdue',true).click();await expect(toggle('First overdue')).toBeEnabled();await expect(card).toContainText('1 overdue objective');await page.getByRole('button',{name:/^View: .*Switch to/}).first().click();
 }}
 // Existing linked goals update their original record, never a duplicate objective.
 const goalToggle=()=>page.getByRole('checkbox',{name:'Complete objective: Linked personal goal',exact:true});await goalToggle().click();await expect(page.getByRole('checkbox',{name:'Reopen objective: Linked personal goal'})).toBeEnabled();let g=(await(await context.request.get(base+'/api/personal/ops?family=goals&id='+goal.id)).json()).item;assert.equal(g.goalState,'complete');assert.equal((await(await context.request.get(base+'/api/projects?family=projects&id='+linked.id)).json()).item.objectives.length,0);
 await page.reload();await page.getByRole('checkbox',{name:'Reopen objective: Linked personal goal'}).click();await expect(goalToggle()).toBeEnabled();await expect(page.getByRole('checkbox',{name:'Complete objective: Locked objective'})).toBeDisabled();
 await page.emulateMedia({reducedMotion:'reduce'});await toggle('First overdue').click();await expect(toggle('First overdue',true)).toBeEnabled();await expect(card.locator('.resource-card-signal')).not.toContainText('overdue');await page.getByRole('button',{name:'Edit objective: First overdue',exact:true}).click();await expect(page.getByRole('dialog',{name:'Objective',exact:true})).toBeVisible();
 assert.deepEqual(errors,[]);console.log('PASS: immediate warning/count updates before save; completion/reopen/reload; no navigation or card resize; sibling preservation; failed/stale rollback; linked goal sync; read-only; keyboard; reduced motion; three views at 1440/390/320.');
})().catch(async e=>{console.error(e);await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
