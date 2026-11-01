// Local-only regression: isolated synthetic data, no external browser requests.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const assert = require('assert/strict');
const { spawn } = require('child_process');
const app = path.resolve(__dirname, '..');
const { chromium, expect } = require(path.join(app, 'node_modules/@playwright/test'));
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'personal-card-status-'));
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
const output = path.join(app, 'output/personal-card-autosave');
fs.mkdirSync(output, { recursive: true });
let browser, page;
(async()=>{await serverReady;browser=await chromium.launch();const context=await browser.newContext({timezoneId:'America/New_York'}),payload=`v1.${Date.now()+3600000}.qa`;await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'fixture-csrf',url:base}]);await context.route(/^https:\/\//,r=>r.abort());const headers={origin:base,'x-csrf-token':'fixture-csrf'},post=async(route,data)=>{const r=await context.request.post(base+route,{headers,data});assert(r.ok(),await r.text());return r.json();};
const fixtures={};const make=async(family,input)=>{const r=await post('/api/personal/ops',{family,input});fixtures[input.title]={family,item:r.item};return r.item;};
await make('obligations',{title:'Inline obligation',obligationState:'open',consequence:'Keep this description',completionCriteria:[{id:'verified',label:'Ready to complete',satisfied:true}]});
await make('obligations',{title:'Inline restricted',obligationState:'open',consequence:'Needs criteria'});
await make('goals',{title:'Inline goal',outcome:'Keep this outcome',lifecycle:'active'});
await make('goals',{title:'Inline guarded goal',outcome:'Unfinished',lifecycle:'active',keyResults:[{title:'Not finished',complete:false}]});
await make('decisions',{title:'Inline decision',question:'What next?',decisionState:'open',finalDecision:'Keep decision text'});
await make('decisions',{title:'Inline guarded decision',question:'Undecided',decisionState:'open'});
await make('followUps',{title:'Inline follow-up',followUpType:'other',context:'Keep context',followUpState:'open'});
await post('/api/entity-goals',{slug:'unigentamos',goals:[{text:'Inline legacy',done:false},{text:'Untouched legacy sibling',done:false}]});page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const writes=[];page.on('request',r=>{if(r.method()==='PATCH'&&r.url().includes('/api/personal/ops'))writes.push(r.postDataJSON());});
const read=async title=>{const {family,item}=fixtures[title];const r=await context.request.get(base+'/api/personal/ops?family='+family+'&id='+item.id);assert(r.ok());return (await r.json()).item;};
const goto=async view=>{await page.goto(base+'/admin/personal/'+view+'?query=Inline&sort=title');await expect(page.getByRole('combobox',{name:/^Change status for Inline/}).first()).toBeVisible();};
const choose=async(title,value)=>{const control=page.getByRole('combobox',{name:'Change status for '+title,exact:true});await control.click();await page.getByRole('listbox',{name:'Change status for '+title,exact:true}).getByRole('option',{name:value,exact:true}).click();await expect(control).toBeEnabled();await expect(page.getByRole('listbox',{name:'Change status for '+title,exact:true})).toHaveCount(0);await expect(control).toContainText(value);assert(!new URL(page.url()).searchParams.has('selected'),'Status opened details');};
const results=[];
for(const width of [390,820,1440]){
 await page.setViewportSize({width,height:1000});await goto('obligations');const control=page.getByRole('combobox',{name:'Change status for Inline obligation',exact:true});
 const before=await read('Inline obligation');const url=page.url();let held;const gate=new Promise(r=>held=r);let intercepted=false;
 const delay=async route=>{if(route.request().method()==='PATCH'){intercepted=true;await gate;}await route.continue();};await page.route('**/api/personal/ops',delay);
 await control.click();await page.getByRole('option',{name:'Complete',exact:true}).click();await expect(control).toBeDisabled();await expect(control).toHaveAttribute('data-value','complete');await expect(page.getByRole('status').filter({hasText:'Saving…'})).toBeVisible();held();await expect(control).toBeEnabled();await page.unroute('**/api/personal/ops',delay);assert(intercepted);const after=await read('Inline obligation');assert.equal(after.obligationState,'complete');assert.equal(after.consequence,before.consequence);assert.equal(after.createdAt,before.createdAt);assert.equal(page.url(),url);
 await page.screenshot({path:path.join(output,'saved-'+width+'.png'),animations:'disabled'});
 await choose('Inline obligation','Complete');assert.equal((await read('Inline obligation')).lifecycle,'complete');await choose('Inline obligation','Active');assert.equal((await read('Inline obligation')).lifecycle,'active');
 await page.reload();await expect(control).toHaveAttribute('data-value','open');
 const restricted=page.getByRole('combobox',{name:'Change status for Inline restricted',exact:true});await restricted.click();await expect(page.getByRole('option',{name:/^Complete/})).toBeDisabled();await page.screenshot({path:path.join(output,'requirements-'+width+'.png'),animations:'disabled'});await page.keyboard.press('Escape');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');results.push({width,autosave:true,reopen:true,guard:true});
}
await goto('goals');const keyboardControl=page.getByRole('combobox',{name:'Change status for Inline goal',exact:true});await keyboardControl.focus();await page.keyboard.press('ArrowDown');await expect(page.getByRole('option')).toHaveCount(2);await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await expect(keyboardControl).toHaveAttribute('data-value','complete');await expect(keyboardControl).toBeEnabled();await choose('Inline goal','Active');await choose('Inline goal','Complete');await choose('Inline goal','Active');await page.getByRole('combobox',{name:'Change status for Inline guarded goal',exact:true}).click();await expect(page.getByRole('option',{name:/^Complete/})).toBeDisabled();await page.keyboard.press('Escape');
await choose('Inline legacy','Complete');assert.equal((await (await context.request.get(base+'/api/entity-goals?slug=unigentamos')).json()).goals[0].done,true);await choose('Inline legacy','Active');const legacy=(await (await context.request.get(base+'/api/entity-goals?slug=unigentamos')).json()).goals;assert.equal(legacy[0].done,false);assert.deepEqual(legacy[1],{text:'Untouched legacy sibling',done:false});
await goto('decisions');await choose('Inline decision','Complete');await choose('Inline decision','Active');assert.equal((await read('Inline decision')).lifecycle,'active');await page.getByRole('combobox',{name:'Change status for Inline guarded decision',exact:true}).click();await expect(page.getByRole('option',{name:/^Complete/})).toBeDisabled();await expect(page.getByRole('option')).toHaveCount(2);await page.keyboard.press('Escape');
await goto('follow-ups');await choose('Inline follow-up','Complete');await choose('Inline follow-up','Active');assert.equal((await read('Inline follow-up')).context,'Keep context');
// A failed save must roll back the optimistic display, with no duplicate write.
await goto('obligations');let failed=0;const fail=async route=>{if(route.request().method()==='PATCH'){failed++;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:'Local simulated failure',code:'unknown'})});}else await route.continue();};await page.route('**/api/personal/ops',fail);const control=page.getByRole('combobox',{name:'Change status for Inline obligation',exact:true});await control.click();await page.getByRole('option',{name:'Complete',exact:true}).click();await expect(page.locator('[class*=cardStatusError][role=alert]')).toContainText('Local simulated failure');await expect(control).toHaveAttribute('data-value','open');assert.equal(failed,1);assert.equal((await read('Inline obligation')).obligationState,'open');await page.unroute('**/api/personal/ops',fail);await choose('Inline obligation','Complete');await expect(page.locator('[class*=cardStatusError][role=alert]')).toHaveCount(0);
// A newer edit from another client must not be overwritten.
const countBeforeCancel=writes.length;await control.click();await page.keyboard.press('Escape');assert.equal(writes.length,countBeforeCancel);await control.click();await page.getByRole('option',{name:'Complete',exact:true}).click();assert.equal(writes.length,countBeforeCancel);
const fresh=await read('Inline obligation');const external=await context.request.patch(base+'/api/personal/ops',{headers,data:{family:'obligations',id:fresh.id,expectedUpdatedAt:fresh.updatedAt,patch:{consequence:'Newer external edit'}}});assert(external.ok(),await external.text());await control.click();await page.getByRole('option',{name:'Active',exact:true}).click();await expect(page.locator('[class*=cardStatusError][role=alert]')).toBeVisible();await expect(control).toHaveAttribute('data-value','complete');assert.equal((await read('Inline obligation')).consequence,'Newer external edit');assert.equal((await read('Inline obligation')).obligationState,'complete');await page.screenshot({path:path.join(output,'conflict.png'),animations:'disabled'});
assert(writes.every(write=>write.expectedUpdatedAt&&Object.keys(write.patch).every(key=>['lifecycle','obligationState','decisionState','followUpState'].includes(key))));assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,results,patches:writes.length,errors},null,2));console.log('PASS: responsive inline autosave, one write per selection, persistence/reopening for all four types, completion guards, optimistic failure rollback, stale-version protection, no details navigation or browser errors.');
})().catch(async e=>{console.error(e);if(page)await page.screenshot({path:path.join(output,'failure.png')});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
