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
await make('obligations',{title:'Inline obligation',obligationState:'open',consequence:'Keep description',completionCriteria:[{id:'criterion',label:'Delivery checked',satisfied:true}]});
await make('obligations',{title:'Inline restricted',obligationState:'open',consequence:'Keep criteria',completionCriteria:[{id:'criterion',label:'Delivery checked',satisfied:false}],requiredEvidence:[{id:'evidence',label:'Receipt',required:true,state:'missing'}]});
await make('obligations',{title:'Inline empty obligation',obligationState:'open',consequence:'No criteria yet'});
await make('goals',{title:'Inline goal',outcome:'Keep outcome',lifecycle:'active'});
await make('goals',{title:'Inline guarded goal',outcome:'Unfinished',lifecycle:'active',keyResults:[{id:'key',title:'Finish the result',complete:false}]});
await make('decisions',{title:'Inline decision',question:'What next?',decisionState:'open',finalDecision:'Keep decision text'});
await make('decisions',{title:'Inline guarded decision',question:'Undecided',decisionState:'open'});
await make('followUps',{title:'Inline follow-up',followUpType:'other',context:'Keep context',followUpState:'open'});
await post('/api/entity-goals',{slug:'unigentamos',goals:[{text:'Inline legacy',done:false},{text:'Untouched legacy sibling',done:false}]});
page=await context.newPage();page.setDefaultTimeout(10000);const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='PATCH'&&r.url().includes('/api/personal/ops'))writes.push(r.postDataJSON());});
const control=title=>page.getByRole('combobox',{name:'Change status for '+title,exact:true});
const read=async title=>{const {family,item}=fixtures[title];return(await(await context.request.get(base+'/api/personal/ops?family='+family+'&id='+item.id)).json()).item;};
const goto=async view=>{await page.goto(base+'/admin/personal/'+view+'?query=Inline&sort=title');await expect(page.getByRole('combobox',{name:/^Change status for Inline/}).first()).toBeVisible();};
const choose=async(title,value)=>{await control(title).click();await page.getByRole('listbox',{name:'Change status for '+title,exact:true}).getByRole('option',{name:value,exact:true}).click();};
const saved=async(title,value)=>{await expect(control(title)).toBeEnabled();await expect(control(title)).toHaveAttribute('data-value',value);assert(!new URL(page.url()).searchParams.has('selected'));};
const direct=async(title,label,value=({'In progress':'active','On hold':'deferred','Replaced':'superseded','Carried over':'carried_forward'}[label]||label.toLowerCase().replaceAll(' ','_')))=>{await choose(title,label);await saved(title,value);};
const saveDialog=async()=>{await page.getByRole('button',{name:'Save status',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);};
const sets=[['goals','Inline goal',['Draft','Planned','In progress','Waiting','Blocked','On hold','Complete','Cancelled','Archived']],['obligations','Inline obligation',['Open','Waiting','Blocked','Complete','Archived']],['decisions','Inline decision',['Open','Considering','Waiting','On hold','Decided','Cancelled','Replaced','Archived']],['follow-ups','Inline follow-up',['Open','Scheduled','Waiting','On hold','Complete','Carried over','Archived']]];
for(const width of [390,820,1440]){
 await page.setViewportSize({width,height:1000});
 for(const [view,title,options]of sets){await goto(view);await control(title).click();assert.deepEqual(await page.getByRole('option').allTextContents(),options);await expect(page.getByRole('option',{name:options[0],exact:true})).toBeEnabled();await page.waitForTimeout(280);await expect(page.getByRole('listbox')).toBeVisible();await page.screenshot({path:path.join(output,view+'-options-'+width+'.png')});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.keyboard.press('Escape');}
 await goto('obligations');for(const next of ['Waiting','Blocked','Complete','Open'])await direct('Inline obligation',next);await page.reload();await saved('Inline obligation','open');
}
// The same palette/options must appear on cards, exact filters, and detail pages.
const palette={};
for(const width of [390,1440]){
 await page.setViewportSize({width,height:1000});
 for(const [view,title,options]of sets){
  await goto(view);await control(title).click();await page.waitForTimeout(250);
  const colors=await page.getByRole('option').evaluateAll(els=>Object.fromEntries(els.map(el=>{const chip=el.querySelector('[data-tone]'),style=getComputedStyle(chip);return[chip.textContent,{color:style.color,background:style.backgroundColor}]})));
  Object.assign(palette,colors);await page.keyboard.press('Escape');
  await page.getByRole('button',{name:/^Filter/}).first().click();const filter=page.getByRole('toolbar',{name:'Filter by status',exact:true});await expect(filter).toBeVisible();
  for(const option of options){const button=filter.getByRole('button',{name:option,exact:true});await expect(button).toBeVisible();const color=await button.evaluate(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor}));assert.deepEqual(color,colors[option],view+' filter palette '+option);}
  await page.waitForTimeout(300);await page.screenshot({path:path.join(output,view+'-filter-'+width+'.png')});await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Open '+title,exact:true}).click();await expect(page.locator('[data-detail-open="true"] > .inspector-rail')).toBeVisible();await control(title).click();await expect(page.getByRole('option')).toHaveCount(options.length);assert.deepEqual(await page.getByRole('option').allTextContents(),options);const detailColors=await page.getByRole('option').evaluateAll(els=>Object.fromEntries(els.map(el=>{const chip=el.querySelector('[data-tone]'),style=getComputedStyle(chip);return[chip.textContent,{color:style.color,background:style.backgroundColor}]})));assert.deepEqual(detailColors,colors,view+' detail palette');await page.waitForTimeout(250);await page.screenshot({path:path.join(output,view+'-detail-menu-'+width+'.png')});await page.keyboard.press('Escape');
 }
}
assert.equal(new Set(Object.values(palette).map(x=>x.background)).size,Object.keys(palette).length,'Statuses must have distinct colors');
await goto('obligations');await direct('Inline obligation','Waiting');await direct('Inline restricted','Blocked');
for(const [label,value,title]of [['Waiting','waiting','Inline obligation'],['Blocked','blocked','Inline restricted'],['Open','open','Inline empty obligation']]){await page.getByRole('button',{name:/^Filter/}).first().click();await page.getByRole('toolbar',{name:'Filter by status',exact:true}).getByRole('button',{name:label,exact:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('combobox',{name:/^Change status for Inline/})).toHaveCount(1);await expect(control(title)).toHaveAttribute('data-value',value);await page.reload();await expect(control(title)).toHaveAttribute('data-value',value);}
await goto('obligations');await direct('Inline obligation','Open');await direct('Inline restricted','Open');
// Edit-form dropdowns use the same labels, including Replaced, and keep references.
await goto('decisions');await page.getByRole('button',{name:'Open Inline decision',exact:true}).click();await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByRole('combobox',{name:'Decision state',exact:true}).click();assert.deepEqual(await page.getByRole('option').allTextContents(),['Open','Considering','Waiting','On hold','Decided','Cancelled','Replaced']);await page.getByRole('option',{name:'Replaced',exact:true}).click();await page.getByRole('combobox',{name:'Replacement decision',exact:true}).click();await page.getByRole('option',{name:'Inline guarded decision',exact:true}).click();await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);assert.equal((await read('Inline decision')).decisionState,'superseded');assert.equal((await read('Inline decision')).supersededBy.objectId,fixtures['Inline guarded decision'].item.id);
await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByRole('combobox',{name:'Decision state',exact:true}).click();await page.getByRole('option',{name:'Open',exact:true}).click();await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);assert.equal((await read('Inline decision')).decisionState,'open');assert.equal((await read('Inline decision')).lifecycle,'active');assert.equal((await read('Inline decision')).finalDecision,'Keep decision text');
await choose('Inline decision','Decided');await expect(control('Inline decision')).toHaveAttribute('data-value','decided');assert.equal((await read('Inline decision')).decisionState,'decided');await page.reload();await expect(control('Inline decision')).toHaveAttribute('data-value','decided');await choose('Inline decision','Open');await expect(control('Inline decision')).toHaveAttribute('data-value','open');
await goto('goals');for(const next of ['Draft','Planned','In progress','Complete','In progress'])await direct('Inline goal',next);
await choose('Inline guarded goal','Complete');await page.getByRole('button',{name:'Save status',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Confirm each');assert.equal((await read('Inline guarded goal')).lifecycle,'active');await page.getByRole('checkbox',{name:'Finish the result'}).check();await saveDialog();await saved('Inline guarded goal','complete');assert.equal((await read('Inline guarded goal')).keyResults[0].complete,true);
for(const next of ['Draft','Planned','In progress','Complete','In progress'])await direct('Inline legacy',next);await direct('Inline legacy','Planned');await page.reload();await saved('Inline legacy','planned');const legacy=(await(await context.request.get(base+'/api/entity-goals?slug=unigentamos')).json()).goals;assert.equal(legacy[0].status,'planned');assert.deepEqual(legacy[1],{text:'Untouched legacy sibling',done:false});
await goto('obligations');await page.setViewportSize({width:390,height:1000});await choose('Inline restricted','Complete');await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('listbox')).toHaveCount(0);await page.waitForTimeout(280);await page.screenshot({path:path.join(output,'completion-mobile.png')});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.getByRole('checkbox',{name:'Delivery checked',exact:true}).check();await page.getByRole('checkbox',{name:'Received: Receipt'}).check();await saveDialog();await saved('Inline restricted','complete');assert.equal((await read('Inline restricted')).requiredEvidence[0].state,'received');
await choose('Inline empty obligation','Complete');await page.getByRole('textbox',{name:'What was completed?'}).fill('Delivered the agreed work');await saveDialog();await saved('Inline empty obligation','complete');assert.equal((await read('Inline empty obligation')).completionCriteria[0].label,'Delivered the agreed work');
await goto('decisions');await direct('Inline decision','Decided');await direct('Inline decision','Open');await choose('Inline guarded decision','Decided');await page.getByRole('textbox',{name:'Decision',exact:true}).fill('Choose option B');await saveDialog();await saved('Inline guarded decision','decided');await direct('Inline guarded decision','Open');
await choose('Inline guarded decision','On hold');await page.getByRole('textbox',{name:'Reason',exact:true}).fill('Wait for the report');await page.getByLabel('Revisit date',{exact:true}).fill('2027-01-12');await saveDialog();await saved('Inline guarded decision','deferred');assert.equal((await read('Inline guarded decision')).deferReason,'Wait for the report');
await choose('Inline guarded decision','Replaced');await page.getByRole('combobox',{name:'Replacement decision',exact:true}).click();await page.getByRole('option',{name:'Inline decision',exact:true}).click();await saveDialog();await saved('Inline guarded decision','superseded');assert.equal((await read('Inline guarded decision')).supersededBy.objectId,fixtures['Inline decision'].item.id);
await goto('follow-ups');for(const next of ['Scheduled','Waiting','Carried over','Complete','Open'])await direct('Inline follow-up',next);await choose('Inline follow-up','On hold');await page.getByRole('textbox',{name:'Reason',exact:true}).fill('Await response');await page.getByLabel('New date',{exact:true}).fill('2027-02-04');await saveDialog();await saved('Inline follow-up','deferred');await direct('Inline follow-up','Open');assert.equal((await read('Inline follow-up')).context,'Keep context');
// Archive and restore preserve data, using the same explicit reason contract.
await goto('goals');await choose('Inline goal','Archived');await page.getByRole('textbox',{name:'Archive reason'}).fill('Local fixture archive');await saveDialog();assert.equal((await read('Inline goal')).lifecycle,'archived');await page.goto(base+'/admin/personal/goals?query=Inline&filter=archived');await choose('Inline goal','In progress');await expect.poll(async()=>(await read('Inline goal')).lifecycle).toBe('active');
// Save failures and competing edits must not silently change the card or overwrite data.
await goto('obligations');let failures=0;const fail=async route=>{if(route.request().method()==='PATCH'){failures++;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:'Local simulated failure',code:'unknown'})});}else await route.continue();};await page.route('**/api/personal/ops',fail);await choose('Inline obligation','Waiting');await expect(page.locator('[class*=cardStatusError][role=alert]')).toContainText('Local simulated failure');await saved('Inline obligation','open');assert.equal(failures,1);await page.unroute('**/api/personal/ops',fail);await direct('Inline obligation','Waiting');
const current=await read('Inline obligation');const update=await context.request.patch(base+'/api/personal/ops',{headers,data:{family:'obligations',id:current.id,expectedUpdatedAt:current.updatedAt,patch:{consequence:'Newer external edit'}}});assert(update.ok());await choose('Inline obligation','Blocked');await expect(page.locator('[class*=cardStatusError][role=alert]')).toBeVisible();await saved('Inline obligation','waiting');assert.equal((await read('Inline obligation')).consequence,'Newer external edit');
assert(writes.every(write=>write.expectedUpdatedAt));assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,widths:[390,820,1440],patches:writes.length,errors},null,2));console.log('PASS: full status sets, responsive menus, one-click changes, guarded transitions, legacy persistence, archive/restore, failure rollback and stale-write protection.');
})().catch(async e=>{console.error(e);await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});