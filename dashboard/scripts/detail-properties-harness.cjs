// Local-only regression: isolated synthetic data, no external browser requests.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const assert = require('assert/strict');
const { spawn } = require('child_process');
const app = path.resolve(__dirname, '..');
const { chromium, expect } = require(path.join(app, 'node_modules/@playwright/test'));
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'detail-properties-'));
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
const output = path.join(app, 'output/detail-properties');
fs.mkdirSync(output, { recursive: true });
let browser, page;
(async()=>{await serverReady;browser=await chromium.launch();const context=await browser.newContext({timezoneId:'America/New_York'}),payload=`v1.${Date.now()+3600000}.qa`;await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'fixture-csrf',url:base}]);await context.route(/^https:\/\//,r=>r.abort());const headers={origin:base,'x-csrf-token':'fixture-csrf'},post=async(route,data)=>{const r=await context.request.post(base+route,{headers,data});assert(r.ok(),await r.text());return r.json();};


const create=async input=>(await post('/api/personal/records',{domain:'family',status:'active',...input})).items.find(item=>item.title===input.title);
const place=(await post('/api/planning',{operation:'save',collection:'places',input:{name:'Cedar Studio',address:'123 Example Street, Cincinnati, OH 45202',latitude:39.1,longitude:-84.5}})).item;
const org=await create({className:'org',title:'Cedar Studio',profile:{organizationType:'Business',industry:'Technology',context:'A local fixture organization.',locations:[{id:'org-place',label:'Office',placeId:place.id,address:place.address}]}});
const person=await create({className:'person',title:'Alex Example',subjects:['Friend'],profile:{nickname:'Al',comesFrom:'Seattle, WA',context:'Designer and community volunteer.',notes:'Met through a shared project.',occupations:[{id:'job-1',title:'Design Director',status:'current',employer:org.title,organizationId:org.id}],education:[{id:'edu-1',institution:'Example University',degree:'BA',fieldOfStudy:'Design'}],locations:[{id:'loc-1',label:'Home',location:'Cincinnati, OH',address:'456 Sample Lane'},{id:'loc-2',label:'Work',placeId:place.id,address:place.address}],email:'alex@example.test',website:'https://example.test'}});
const note=await create({domain:'notes-docs',className:'idea',title:'Garden notes',body:'## A welcoming courtyard\n\nPlant native flowers and invite the neighborhood.'});
await post('/api/projects',{operation:'create',family:'projects',input:{name:'Community garden',description:'Turn an unused courtyard into a welcoming garden.',lifecycle:'active',objectives:[{text:'Agree a planting plan'},{text:'Invite the neighborhood'}]}});
await post('/api/reviews/runs',{input:{cadence:'weekly',title:'Weekly reflection',periodStart:'2026-10-19',periodEnd:'2026-10-25'}});
page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));const baseline=!!process.env.DETAIL_BASELINE;
async function snap(name,width){await page.waitForTimeout(350);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' overflow');await page.screenshot({path:path.join(output,`${baseline?'before':'after'}-${name}-${width}.png`)});}
for(const width of [1440,820,390]){
 await page.setViewportSize({width,height:1000});await page.goto(base+'/admin/people/'+person.id+'/edit?tab=properties');await expect(page.getByLabel('Comes from',{exact:true})).toBeVisible();await snap('people',width);
 await page.locator('[data-people-location-editor]').scrollIntoViewIfNeeded();await snap('places',width);if(!baseline){assert.equal(await page.getByLabel('Comes from',{exact:true}).evaluate(el=>getComputedStyle(el).borderTopWidth),'0px','Origin must have only the outer field border');}
 await page.getByRole('combobox',{name:'Place 1 label',exact:true}).click();await expect(page.getByRole('dialog',{name:'Place label'})).toBeVisible();await snap('place-label',width);await page.keyboard.press('Escape');
 await page.getByRole('combobox',{name:'Saved place 1',exact:true}).click();await page.getByRole('option',{name:/Cedar Studio/}).waitFor();await snap('place-picker',width);await page.keyboard.press('Escape');
 for(const [name,route,title]of [['projects','/admin/projects','Community garden'],['notes','/admin/notes','Garden notes'],['reviews','/admin/reviews','Weekly reflection']]){await page.goto(base+route);await page.getByRole('button',{name:'Open '+title,exact:true}).click();await page.waitForTimeout(450);await snap(name,width);if(!baseline){const canvas=await page.locator('.workspace-detail-page:not([hidden])').evaluate(el=>({background:getComputedStyle(el).backgroundColor,inner:getComputedStyle(el.querySelector('.inspector-rail')).backgroundColor})).catch(()=>null);if(canvas)assert(['rgba(0, 0, 0, 0)','rgb(246, 248, 247)'].includes(canvas.inner),name+' has a white enclosing panel');if(width!==820){const tabs=name==='projects'?['Activity','Links','Properties']:name==='notes'?['Links','Properties','History']:['Checklist','Evidence','Decisions','Follow-ups','Properties'];for(const tab of tabs){await page.getByRole('tab',{name:new RegExp('^'+tab)}).click();await snap(name+'-'+tab.toLowerCase(),width);}}}}
}
if(!baseline){
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/admin/people/'+person.id+'/edit?tab=properties');await page.getByRole('button',{name:'Change address'}).first().click();await page.getByLabel('Comes from',{exact:true}).fill('Portland, OR');await page.getByLabel('Place 1 street address',{exact:true}).fill('789 Updated Lane');await page.getByRole('combobox',{name:'Place 1 label',exact:true}).click();await page.getByRole('button',{name:'Secondary home',exact:true}).click();
 await page.locator('button[form="people-profile-properties-form"]').click();await page.waitForTimeout(700);await page.reload();await page.getByRole('tab',{name:'Properties',exact:true}).click();await expect(page.getByLabel('Comes from',{exact:true})).toHaveValue('Portland, OR');await page.getByRole('button',{name:'Change address'}).first().click();await expect(page.getByLabel('Place 1 street address',{exact:true})).toHaveValue(/^789 Updated Lane/);await expect(page.getByRole('combobox',{name:'Place 1 label',exact:true})).toContainText('Secondary home');
 await page.getByRole('combobox',{name:'Saved place 1',exact:true}).click();await page.getByRole('option',{name:/Cedar Studio/}).click();await expect(page.getByLabel('Place 1 street address',{exact:true})).toHaveCount(0);await page.locator('button[form="people-profile-properties-form"]').click();await page.waitForTimeout(700);await page.reload();await page.getByRole('tab',{name:'Properties',exact:true}).click();await expect(page.getByRole('combobox',{name:'Saved place 1',exact:true})).toContainText('Cedar Studio');await page.getByRole('button',{name:'Change address'}).first().click();await expect(page.getByLabel('Place 1 street address',{exact:true})).toHaveValue(place.address);
 await page.goto(base+'/admin/people/'+org.id+'/edit?tab=properties');await page.setViewportSize({width:390,height:1000});await page.locator('[data-people-location-editor]').scrollIntoViewIfNeeded();await snap('organization',390);await expect(page.getByLabel('Comes from',{exact:true})).toHaveCount(0);
}
assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,baseline?'baseline.json':'result.json'),JSON.stringify({passed:true,errors,viewports:[1440,820,390],baseline},null,2));console.log('PASS: local detail surfaces, responsive property/place controls'+(baseline?' (baseline).':', edit/save/reload, label changes, saved-place selection and address editing.'));
})().catch(async e=>{console.error(e);await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
