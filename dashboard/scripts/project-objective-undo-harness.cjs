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
const output = path.join(os.tmpdir(), 'fremen-project-objective-undo-qa');
fs.mkdirSync(output, { recursive: true });
let browser,page;
(async()=>{
 await serverReady;browser=await chromium.launch();const context=await browser.newContext(),payload=`v1.${Date.now()+3600000}.qa`;
 await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'fixture-csrf',url:base}]);
 await context.route(/^https?:\/\//,r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const headers={origin:base,'x-csrf-token':'fixture-csrf'},post=async(route,data)=>{const r=await context.request.post(base+route,{headers,data});assert(r.ok(),await r.text());return r.json();};
 const create=async input=>(await post('/api/projects',{operation:'create',family:'projects',input})).item;


 const target=await create({name:'Undo card project',lifecycle:'active',objectives:[{text:'An overdue objective',targetAt:'2020-01-01'},{text:'A separate objective',targetAt:'2099-01-01'}]});
 const linked=await create({name:'Undo linked goal',lifecycle:'active'});
 const goal=(await post('/api/personal/ops',{family:'goals',input:{title:'Planned linked goal',goalState:'planned',outcome:'Keep this outcome',domain:'Home',sourceRefs:[{module:'projects',objectType:'project',objectId:linked.id,label:linked.name,route:'/admin/projects/'+linked.id}]}})).item;
 const read=async()=> (await (await context.request.get(base+'/api/projects?family=projects&id='+target.id)).json()).item;
 const patch=async(item,patch)=>{const r=await context.request.patch(base+'/api/projects',{headers,data:{family:'projects',id:item.id,expectedUpdatedAt:item.updatedAt,patch}});assert(r.ok(),await r.text());return(await r.json()).item;};
 page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/admin/projects?q=Undo');
 const card=page.getByRole('listitem').filter({has:page.getByRole('button',{name:'Open Undo card project',exact:true})});
 const toggle=(text,complete=false)=>card.getByRole('checkbox',{name:(complete?'Reopen':'Complete')+' objective: '+text,exact:true});
 const toast=page.getByRole('complementary',{name:'Objective completion'}),undo=toast.getByRole('button',{name:'Undo',exact:true});
 const before=await read(),url=page.url();await toggle('An overdue objective').click();await expect(undo).toBeEnabled();await expect(card.locator('.resource-card-signal')).not.toContainText('overdue');await expect(toast).toContainText('An overdue objective');
 let release;const hold=new Promise(resolve=>release=resolve);let writes=0;await page.route('**/api/projects',async r=>{if(r.request().method()==='PATCH'){writes++;await hold;}await r.continue();});
 await undo.click();await expect(undo).toBeDisabled();await expect(card.locator('.resource-card-signal')).toContainText('1 overdue objective');assert((await read()).objectives[0].completedAt);release();await expect(toast).toHaveCount(0);await page.unroute('**/api/projects');assert.equal(writes,1);await expect(toggle('An overdue objective')).toBeFocused();let saved=await read();assert.equal(saved.objectives[0].completedAt,undefined);assert.deepEqual(saved.objectives[1],before.objectives[1]);assert.equal(page.url(),url);await page.reload();await expect(toggle('An overdue objective')).toHaveAttribute('aria-checked','false');
 // Unrelated changes made after completion survive Undo.
 await toggle('An overdue objective').click();await expect(undo).toBeEnabled();saved=await read();await patch(saved,{description:'Updated in another session',objectives:saved.objectives.map((o,i)=>({...o,text:i?'Unrelated edit preserved':o.text}))});await undo.click();await expect(toast).toHaveCount(0);saved=await read();assert.equal(saved.description,'Updated in another session');assert.equal(saved.objectives[1].text,'Unrelated edit preserved');assert.equal(saved.objectives[0].completedAt,undefined);
 // Failed undo remains retryable and rolls back the premature reopening.
 await toggle('An overdue objective').click();await expect(undo).toBeEnabled();await page.route('**/api/projects',r=>r.request().method()==='PATCH'?r.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Local undo failure',error:'Local undo failure'})}):r.continue());await undo.click();await expect(toast.getByRole('alert')).toBeVisible();await expect(undo).toBeEnabled();await expect(toggle('An overdue objective',true)).toHaveAttribute('aria-checked','true');assert((await read()).objectives[0].completedAt);await page.unroute('**/api/projects');await undo.click();await expect(toast).toHaveCount(0);assert.equal((await read()).objectives[0].completedAt,undefined);
 // An external reopen/re-completion is a different completion; never undo it.
 await toggle('An overdue objective').click();await expect(undo).toBeEnabled();saved=await read();saved=await patch(saved,{objectives:saved.objectives.map((o,i)=>i?o:{id:o.id,text:o.text,targetAt:o.targetAt,completed:false})});saved=await patch(saved,{objectives:saved.objectives.map((o,i)=>i?o:{id:o.id,text:o.text,targetAt:o.targetAt,completed:true})});const externalCompletion=saved.objectives[0].completedAt;await undo.click();await expect(toast.getByRole('alert')).toContainText('changed since completion');assert.equal((await read()).objectives[0].completedAt,externalCompletion);await toast.getByRole('button',{name:'Dismiss completion notification'}).click();await expect(toast).toHaveCount(0);await toggle('An overdue objective',true).click();await expect(toggle('An overdue objective')).toBeEnabled();
 // Keep only the latest completed objective; dismissing never reopens it.
 await toggle('An overdue objective').click();await expect(undo).toBeEnabled();await toggle('Unrelated edit preserved').click();await expect(toast).toContainText('Unrelated edit preserved');await undo.click();await expect(toast).toHaveCount(0);saved=await read();assert(saved.objectives[0].completedAt);assert.equal(saved.objectives[1].completedAt,undefined);await toggle('An overdue objective',true).click();await expect(toggle('An overdue objective')).toBeEnabled();await toggle('An overdue objective').click();await expect(undo).toBeEnabled();await toast.getByRole('button',{name:'Dismiss completion notification'}).click();await expect(toast).toHaveCount(0);assert((await read()).objectives[0].completedAt);await toggle('An overdue objective',true).click();await expect(toggle('An overdue objective')).toBeEnabled();
 // Linked goal Undo restores its prior Planned state, rather than guessing Active.
 await page.getByRole('checkbox',{name:'Complete objective: Planned linked goal'}).click();await expect(undo).toBeEnabled();await undo.click();await expect(toast).toHaveCount(0);const restored=(await(await context.request.get(base+'/api/personal/ops?family=goals&id='+goal.id)).json()).item;assert.equal(restored.goalState,'planned');assert.equal(restored.outcome,goal.outcome);
 // Compact toast and keyboard Undo across views, including reduced motion.
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});for(let view=0;view<3;view++){
  await toggle('An overdue objective').click();await expect(undo).toBeEnabled();await expect(toast).toHaveCSS('opacity','1');const bounds=await toast.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);assert(bounds.height<100);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(output,`undo-${width}-${view}.png`)});await undo.focus();await page.keyboard.press('Enter');await expect(toast).toHaveCount(0);await expect(toggle('An overdue objective')).toBeFocused();await page.getByRole('button',{name:/^View: .*Switch to/}).first().click();
 }}
 await page.emulateMedia({reducedMotion:'reduce'});await toggle('An overdue objective').click();await expect(undo).toBeEnabled();await undo.click();await expect(toast).toHaveCount(0);assert.deepEqual(errors,[]);console.log('PASS: compact Undo; immediate warning restoration; saved reload; keyboard focus; unrelated edits preserved; retry after failure; changed completion protected; latest action and dismissal; linked goal prior state restored; nine desktop/mobile layouts and reduced motion.');
})().catch(async e=>{console.error(e);await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
