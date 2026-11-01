// Local-only regression: isolated synthetic data, no external browser requests.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const assert = require('assert/strict');
const { spawn } = require('child_process');
const app = path.resolve(__dirname, '..');
const { chromium, expect } = require(path.join(app, 'node_modules/@playwright/test'));
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'controls-refinement-'));
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
const output = path.join(app, 'output/controls-refinement');
fs.mkdirSync(output, { recursive: true });
let browser, page;
(async()=>{await serverReady;browser=await chromium.launch();const context=await browser.newContext({timezoneId:'America/New_York'}),payload=`v1.${Date.now()+3600000}.qa`;await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'fixture-csrf',url:base}]);await context.route(/^https:\/\//,r=>r.abort());const headers={origin:base,'x-csrf-token':'fixture-csrf'},post=async(route,data)=>{const r=await context.request.post(base+route,{headers,data});assert(r.ok(),await r.text());return r.json();};

const cases=[];
for(const [family,view,input] of [
 ['goals','goals',{title:'Fixture goal',outcome:'A useful outcome',lifecycle:'active'}],
 ['decisions','decisions',{title:'Fixture decision',question:'Which path?',finalDecision:'Chosen path',decisionState:'open'}],
 ['obligations','obligations',{title:'Fixture obligation',consequence:'A clear commitment',completionCriteria:[{id:'one',label:'Ready',satisfied:true}]}],
 ['followUps','follow-ups',{title:'Fixture follow-up',context:'Reconnect next week',followUpType:'other'}],
 ['routines','routines',{title:'Fixture routine',summary:'A weekly reset',lifecycle:'draft',cadenceRule:{frequency:'weekly',timezone:'America/New_York'}}]
]){const result=await post('/api/personal/ops',{[family==='routines'?'secondaryFamily':'family']:family,input});cases.push({view,title:input.title,id:result.item.id});}
for(const [title,type] of [['Reference tool','tool'],['Same URL reference','website'],['Reading list','book']])await post('/api/personal/records',{domain:'notes-docs',className:'resource',title,status:'active',body:'A fixture resource.',url:type==='book'?'https://fixture.example/book':'https://fixture.example/shared',resourceProfile:{version:1,resourceType:type,metadata:{},lifecycle:'active'}});
for(const cadence of ['weekly','monthly'])await post('/api/reviews/runs',{input:{cadence,title:cadence+' fixture',periodStart:'2026-10-01',periodEnd:cadence==='weekly'?'2026-10-07':'2026-10-31',dueAt:'2026-11-01',ownerId:'admin',current:true}});
const day='2026-11-04';await post('/api/planning',{operation:'save',collection:'events',input:{title:'Move fixture',start:day+'T09:00',end:day+'T10:00',timeZone:'America/New_York',allDay:false,calendarId:'native',description:'Preserve this',location:'',linkedRefs:[],recurrence:'',exceptions:{},reminderMinutes:null,kind:'event'}});
page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));const results=[];
async function screenshot(name,width){await page.waitForTimeout(300);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' overflow');await page.screenshot({path:path.join(output,name+'-'+width+'.png'),animations:'disabled'});}
for(const width of [1440,820,390]){
 await page.setViewportSize({width,height:1000});
 for(const item of cases){await page.goto(base+'/admin/personal/'+item.view);if(item.view==='routines')await page.getByText(item.title,{exact:true}).first().click();else await page.getByRole('button',{name:'Open '+item.title,exact:true}).click();await expect(page.locator('[class*=inspectorHeader]').filter({hasText:item.title})).toBeVisible();await screenshot('personal-'+item.view,width);for(const tab of (item.view==='routines'?['Cadence','Properties']:['Details','Links','Properties'])){await page.getByRole('tab',{name:tab,exact:true}).click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'detail tab overflow '+item.view+' '+tab);}if(width===390){await screenshot('properties-'+item.view,width);const launcher=page.getByRole('button',{name:'Open AI assistant',exact:true});assert(await launcher.evaluate(button=>{const r=button.getBoundingClientRect();return button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'Assistant covered by detail footer');}}
 await page.goto(base+'/admin/resources');const types=page.getByRole('group',{name:'Resource types'});await expect(types).toBeVisible();assert.equal(await types.getByRole('button').count(),13);const chipBoxes=await types.getByRole('button').evaluateAll(buttons=>buttons.map(button=>button.getBoundingClientRect().width));assert(chipBoxes.every(width=>width<200),'type chips stretched');await expect(types.getByRole('button',{name:'All types',exact:true})).toHaveAttribute('aria-pressed','true');
 await types.getByRole('button',{name:'Tool',exact:true}).click();await expect(types.getByRole('button',{name:'Tool',exact:true})).toHaveAttribute('aria-pressed','false');await expect(page.getByText('Reference tool',{exact:true})).toHaveCount(0);await types.getByRole('button',{name:'All types',exact:true}).click();await expect(page.getByText('Reference tool',{exact:true}).first()).toBeVisible();
 await screenshot('resources',width);if(!(await page.getByRole('button',{name:'Check resource duplicates',exact:true}).isVisible()))await page.getByRole('button',{name:'Resources actions',exact:true}).click();await page.getByRole('button',{name:'Check resource duplicates',exact:true}).click();await page.keyboard.press('Escape');const duplicate=page.getByRole('region',{name:'Resource duplicate review'});await expect(duplicate).toBeVisible();await expect(duplicate).toContainText('Reference tool');await expect(duplicate).toContainText('Same URL reference');await screenshot('duplicates',width);
 await page.goto(base+'/admin/reviews');await expect(page.getByRole('button',{name:'Cadence',exact:true})).toHaveCount(0);await page.getByRole('button',{name:/^Filter( \(|$)/}).click();const filters=page.locator('[aria-label="Filters"]');await filters.getByRole('button',{name:'Monthly',exact:true}).click();await expect(page.getByRole('button',{name:'Open monthly fixture',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Open weekly fixture',exact:true})).toHaveCount(0);await screenshot('reviews-filters',width);await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Open AI assistant',exact:true}).click();await expect(page.locator('.shared-ai-dock__panel')).toBeVisible();await expect(page.getByRole('button',{name:'Send message',exact:true})).toBeDisabled();await screenshot('assistant',width);await page.locator('.shared-ai-dock__panel').getByRole('button',{name:'Close AI assistant',exact:true}).click();results.push({width,personalDetails:5,resourceTypes:12,duplicates:true,reviews:true,assistant:true});
}
await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/admin/calendar?date='+day+'&view=day');const source=page.getByRole('button',{name:/^Move fixture ·/}).first();await expect(source).toBeVisible();
const readEvent=async()=>{const response=await context.request.get(base+'/api/planning');assert(response.ok());return(await response.json()).state.events.find(e=>e.title==='Move fixture');};const original=await readEvent();
async function move(){const dt=await page.evaluateHandle(()=>new DataTransfer());await source.dispatchEvent('dragstart',{dataTransfer:dt});const target=page.locator('[class*=fittedColumn]').first(),slot=target.locator('[data-hour="13"]'),box=await slot.boundingBox();await target.dispatchEvent('drop',{dataTransfer:dt,clientX:box.x+10,clientY:box.y+2});await source.dispatchEvent('dragend',{dataTransfer:dt});await expect(page.getByRole('complementary',{name:'Event move saved'})).toBeVisible();}
await move();assert.notEqual((await readEvent()).start,original.start);await screenshot('calendar-undo',1440);await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByRole('complementary',{name:'Event move saved'})).toHaveCount(0);assert.equal((await readEvent()).start,original.start);
await move();await page.getByRole('button',{name:'Dismiss move notification',exact:true}).click();await expect(page.getByRole('complementary',{name:'Event move saved'})).toHaveCount(0);await page.keyboard.press('Control+z');await expect.poll(async()=>(await readEvent()).start).toBe(original.start);assert.equal((await readEvent()).description,original.description);
await page.setViewportSize({width:390,height:844});await move();await screenshot('calendar-undo',390);const toast=await page.getByRole('complementary',{name:'Event move saved'}).boundingBox();assert(toast.x>=0&&toast.x+toast.width<=391&&toast.y<400);await page.getByRole('button',{name:'Undo',exact:true}).click();await expect.poll(async()=>(await readEvent()).start).toBe(original.start);
assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,results,calendar:{undo:true,dismissPreservesKeyboardUndo:true,mobile:true},errors},null,2));console.log('PASS: responsive Personal details, resource type toggles and duplicate review, review period filtering, disconnected assistant, Calendar move/undo/dismiss/keyboard undo; no browser errors.');
})().catch(async e=>{console.error(e);if(page)await page.screenshot({path:path.join(output,'failure.png')});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
