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
const output = path.join(os.tmpdir(), 'fremen-project-cards-qa');
fs.mkdirSync(output, { recursive: true });
let browser, page;
(async()=>{await serverReady;browser=await chromium.launch();const context=await browser.newContext({timezoneId:'America/New_York'}),payload=`v1.${Date.now()+3600000}.qa`;await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'fixture-csrf',url:base}]);await context.route(/^https:\/\//,r=>r.abort());const headers={origin:base,'x-csrf-token':'fixture-csrf'},post=async(route,data)=>{const r=await context.request.post(base+route,{headers,data});assert(r.ok(),await r.text());return r.json();};


const createProject=async input=>(await post('/api/projects',{operation:'create',family:'projects',input})).item;
const expected={draft:'edit',idea:'calendar-group-brain',planned:'calendar',developing:'build',active:'active',monitoring:'show',dormant:'dormant'};
const projects=[];
for(const [i,lifecycle] of Object.keys(expected).entries()) projects.push(await createProject({name:'Card '+lifecycle,description:i%2?'A useful project description with enough detail to fill two lines without changing the height of its neighbors.':'',lifecycle,objectives:i%2?['Deliver a useful outcome with a much longer description to check that wrapping never changes the height of the neighboring cards.','Second project objective','Third project objective','Fourth objective is available in detail'].map(text=>({text})):[]}));
const target=projects.find(x=>x.lifecycle==='active');
const linkedGoalProject=projects.find(x=>x.lifecycle==='draft');
await post('/api/personal/ops',{family:'goals',input:{title:'Linked goal objective',outcome:'Deliver the linked project outcome',domain:'Personal Admin',lifecycle:'active',sourceRefs:[{module:'projects',objectType:'project',objectId:linkedGoalProject.id,label:linkedGoalProject.name,route:'/admin/projects/'+linkedGoalProject.id}]}});
await post('/api/projects',{operation:'create',family:'milestones',input:{projectId:target.id,title:'Overdue fixture',dueAt:'2020-01-01',completionCriteria:['Delivery']}});
const person=(await post('/api/personal/records',{domain:'family',className:'person',title:'Fixture Person',status:'active'})).items.find(x=>x.title==='Fixture Person');
const note=(await post('/api/personal/records',{domain:'notes-docs',className:'idea',title:'Fixture Note',status:'active'})).items.find(x=>x.title==='Fixture Note');
for(const [module,objectType,record] of [['people','person',person],['notes','note',note]])await post('/api/projects',{operation:'create',family:'links',input:{projectId:target.id,source:{module,objectType,objectId:record.id,label:record.title,route:'/admin/'+module+'/'+record.id},relationship:'supporting_context'}});
// Give the fixture distinct historical timestamps; never touch the real data directory.
const projectFile=path.join(data,'projects.json');const stored=JSON.parse(fs.readFileSync(projectFile,'utf8'));stored.projects.find(x=>x.id===target.id).createdAt='2025-08-12T12:00:00.000Z';stored.projects.find(x=>x.id===target.id).updatedAt='2026-10-30T12:00:00.000Z';fs.writeFileSync(projectFile,JSON.stringify(stored));
page=await context.newPage();page.setDefaultTimeout(15000);const errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
const cards=()=>page.locator('.resource-directory-card:visible');
for(const width of [1800,1440,820,390,320]){
 await page.setViewportSize({width,height:1000});await page.goto(base+'/admin/projects');await page.getByRole('searchbox').fill('Card ');await expect(cards()).toHaveCount(7);
 for(let round=0;round<3;round++){
  await page.waitForTimeout(650);const view=await page.locator('[data-directory-view]:visible').getAttribute('data-directory-view');
  const heights=await cards().evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));assert(Math.max(...heights)-Math.min(...heights)<2,view+' uneven heights '+heights);
  const active=cards().filter({has:page.getByRole('button',{name:'Open Card active',exact:true})});
  await expect(active).toContainText('1 overdue milestone');await expect(active).toContainText('Created 08/12/25');await expect(active).toContainText('Edited 10/30/26');await expect(active).toContainText('2 objects');
  for(const [state,icon] of Object.entries(expected))await expect(cards().filter({has:page.getByRole('button',{name:'Open Card '+state,exact:true})}).locator('.resource-card-status svg')).toHaveAttribute('data-icon-role',icon);
  const geometry=await active.evaluate(el=>{const box=s=>el.querySelector(s).getBoundingClientRect();return {signal:box('.resource-card-signal').y,meta:box('.resource-card-details').y,title:box('.resource-card-title').y,desc:box('.resource-card-description').y,tags:box('.resource-card-tags').toJSON(),picture:box('.resource-card-picture').toJSON(),font:getComputedStyle(el.querySelector('.resource-card-title')).fontSize};});assert(geometry.title<geometry.meta&&geometry.meta<geometry.signal&&geometry.signal<geometry.desc,'Name, dates, warning, description order');assert.equal(geometry.font,view==='grid'&&width>=370&&width<=600?'13px':'15px','People-sized name');
  if(view==='grid')assert(geometry.tags.x>geometry.picture.x&&Math.abs(geometry.tags.y-geometry.picture.y)<2,'Grid control box is top right');
  await expect(active.locator('.resource-card-tags')).toContainText('Active');await expect(active.locator('.resource-card-tags')).toContainText('2 objects');await expect(active.locator('.resource-card-tags').getByRole('button',{name:'Star project',exact:true})).toBeVisible();
  const developing=cards().filter({has:page.getByRole('button',{name:'Open Card developing',exact:true})});await expect(developing.getByRole('list',{name:'Project objectives preview'}).locator('li')).toHaveCount(3);await expect(developing).toContainText('Third project objective');await expect(developing).not.toContainText('Fourth objective');const previewGeometry=await developing.getByRole('list',{name:'Project objectives preview'}).evaluate(el=>({last:el.lastElementChild.getBoundingClientRect().bottom,container:el.parentElement.getBoundingClientRect().bottom}));assert(previewGeometry.last<=previewGeometry.container+1,'All three objective rows fit without clipping');await expect(cards().filter({has:page.getByRole('button',{name:'Open Card draft',exact:true})}).getByRole('list',{name:'Project objectives preview'})).toContainText('Linked goal objective');
  if(view==='grid'){const columns=await page.locator('[data-directory-view]:visible').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);if(width===390)assert.equal(columns,2,'Distinct mobile grid');if(width===320)assert.equal(columns,1,'Narrow mobile grid fallback');}
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Viewport overflow');
  const overflow=await cards().evaluateAll(els=>els.flatMap(el=>[...el.querySelectorAll('.resource-card-details,.resource-card-tags')].filter(x=>x.scrollWidth>x.clientWidth+2).map(x=>x.className)));assert.deepEqual(overflow,[],'Card controls overflow');
  const heightLimit=(view==='compact'?(width<=600?206:192):view==='grid'?(width===390?281:width===320?302:288):(width<=600?246:232));assert(heights[0]<=heightLimit,'Card negative space is bounded: '+view+' '+heights[0]);
  await page.screenshot({path:path.join(output,view+'-'+width+'.png')});results.push({width,view,height:heights[0]});
  await page.getByRole('button',{name:/^View: .*Switch to/}).first().click();
 }
}
await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(650);const active=cards().filter({has:page.getByRole('button',{name:'Open Card active',exact:true})});await active.getByRole('button',{name:'Star project',exact:true}).click();await expect(active.getByRole('button',{name:'Remove star',exact:true})).toHaveAttribute('aria-pressed','true');await active.getByRole('button',{name:'Open Card active',exact:true}).click();await expect(page.getByRole('tab',{name:'Overview',exact:true})).toBeVisible();await page.goBack();await expect(page.getByRole('searchbox')).toHaveValue('Card');await expect(cards()).toHaveCount(7);
await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:/^View: .*Switch to/}).first().click();await expect(cards()).toHaveCount(7);assert.equal(await cards().first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
assert.deepEqual(errors,[]);console.log('Screenshots: '+output);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,results,errors},null,2));console.log('PASS: project cards across three views and five widths, equal heights, status icons, dates, combined object count, ordered dates and warning, first three objectives, shaded controls, star and detail navigation.');
})().catch(async e=>{console.error(e);await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});