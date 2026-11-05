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
const output = path.join(os.tmpdir(), 'fremen-project-personal-refinement');
fs.mkdirSync(output, { recursive: true });
let browser, page;
(async()=>{await serverReady;browser=await chromium.launch();const context=await browser.newContext({timezoneId:'America/New_York'}),payload=`v1.${Date.now()+3600000}.qa`;await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'fixture-csrf',url:base}]);await context.route(/^https:\/\//,r=>r.abort());const headers={origin:base,'x-csrf-token':'fixture-csrf'},post=async(route,data)=>{const r=await context.request.post(base+route,{headers,data});assert(r.ok(),await r.text());return r.json();};


const project=(await post('/api/projects',{operation:'create',family:'projects',input:{name:'Transparent active',lifecycle:'active',description:'Description stays in the main column.',objectives:[{text:'First outcome'},{text:'Second outcome'},{text:'Third outcome'}]}})).item;
await post('/api/projects',{operation:'create',family:'projects',input:{name:'Planned project',lifecycle:'planned'}});
const blocked=(await post('/api/projects',{operation:'create',family:'projects',input:{name:'Blocked project',lifecycle:'dormant'}})).item;
await post('/api/projects',{operation:'create',family:'blockers',input:{projectId:blocked.id,title:'Awaiting approval',condition:'Approval is required'}});
const sharp=require('sharp');const buffer=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><path d="M20 80L80 20L140 80L80 140Z" fill="#b56c2f"/></svg>')).png().toBuffer();
const upload=await context.request.post(base+'/api/projects/photos/'+project.id,{headers,multipart:{source:{name:'transparent.png',mimeType:'image/png',buffer},crop:JSON.stringify({zoom:1,panX:0,panY:0,outputSize:256})}});assert(upload.ok(),await upload.text());const photo=(await upload.json()).photo;
const updated=await context.request.patch(base+'/api/projects',{headers,data:{family:'projects',id:project.id,expectedUpdatedAt:project.updatedAt,patch:{photoUpdatedAt:photo.updatedAt}}});assert(updated.ok(),await updated.text());
await post('/api/personal/ops',{family:'goals',input:{title:'Local personal goal',outcome:'Keep the period toggle useful',domain:'Personal Admin',lifecycle:'active'}});
page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/admin/projects');
const views=page.getByRole('group',{name:'Project views'}),cards=page.locator('.resource-directory-card:visible').filter({has:page.getByRole('button',{name:/^Open (Transparent active|Planned project|Blocked project)$/})});
await expect(cards).toHaveCount(3);for(const button of await views.getByRole('button').all())await expect(button).toHaveAttribute('aria-pressed','false');
await expect(page.getByRole('button',{name:'Projects views',exact:true})).toHaveCount(0);
await views.getByRole('button',{name:/^Active/}).click();await expect(cards).toHaveCount(1);
await views.getByRole('button',{name:/^Planned/}).click();await expect(cards).toHaveCount(2);
await page.reload();await expect(cards).toHaveCount(2);await expect(views.getByRole('button',{name:/^Active/})).toHaveAttribute('aria-pressed','true');
await views.getByRole('button',{name:/^Active/}).click();await expect(cards).toHaveCount(1);await expect(cards).toContainText('Planned project');
await views.getByRole('button',{name:/^Planned/}).click();await expect(cards).toHaveCount(3);
await views.getByRole('button',{name:/^Blocked/}).click();await expect(cards).toHaveCount(1);await expect(cards).toContainText('Blocked project');
await page.getByRole('searchbox').fill('No such project');await expect(page.getByRole('button',{name:'Clear view',exact:true})).toBeVisible();await page.getByRole('button',{name:'Clear view',exact:true}).click();await expect(cards).toHaveCount(3);assert(!new URL(page.url()).searchParams.has('views'));
for(const width of [1800,1440,820,390,320]){
 await page.setViewportSize({width,height:1000});await page.goto(base+'/admin/projects');
 for(let round=0;round<3;round++){
  await page.waitForTimeout(450);const mode=await page.locator('[data-directory-view]:visible').getAttribute('data-directory-view');
  const card=cards.filter({has:page.getByRole('button',{name:'Open Transparent active',exact:true})});const img=card.locator('img');await expect(img).toBeVisible();
  const photoStyles=await img.evaluate(el=>[el,el.parentElement,el.closest('.resource-card-picture')].map(node=>{const s=getComputedStyle(node);return {border:s.borderTopWidth,shadow:s.boxShadow,background:s.backgroundColor};}));for(const style of photoStyles){assert.equal(style.border,'0px');assert.equal(style.shadow,'none');assert.equal(style.background,'rgba(0, 0, 0, 0)');}
  const geometry=await card.evaluate(el=>{const rect=s=>el.querySelector(s).getBoundingClientRect().toJSON();const dates=[...el.querySelector('.resource-card-details').children].map(n=>n.getBoundingClientRect().toJSON());return {dates,signal:rect('.resource-card-signal'),description:rect('.resource-card-description'),objectives:rect('ul'),card:el.getBoundingClientRect().toJSON()};});
  assert(Math.max(...geometry.dates.map(d=>d.bottom))<=geometry.signal.y+1,'Dates do not overlap warning '+mode+' '+width);
  if(mode!=='grid')assert(geometry.objectives.x>=geometry.description.right-1,'Objectives occupy right column');
  await expect(card.getByText('Objectives',{exact:true})).toHaveCount(0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No page overflow');
  if(width<=600){const bounds=await views.evaluate(el=>({end:el.lastElementChild.getBoundingClientRect().right,clip:el.parentElement.getBoundingClientRect().right}));assert(bounds.end<=bounds.clip+1,'All four mobile filters visible');}
  await page.screenshot({path:path.join(output,'projects-'+mode+'-'+width+'.png')});
  await page.getByRole('button',{name:/^View: .*Switch to/}).first().click();
 }
}
for(const width of [1440,820,390,320]){
 await page.setViewportSize({width,height:1000});await page.goto(base+'/admin/personal');
 const periods=page.getByRole('group',{name:'Personal time view'});await expect(periods.getByRole('button',{name:'Today',exact:true})).toHaveAttribute('aria-pressed','true');
 assert(await periods.evaluate(el=>Boolean(el.closest('.workspace-topnav'))),'Period control belongs to toolbar');
 const before=await periods.boundingBox();await periods.getByRole('button',{name:'This week',exact:true}).click();await expect(page.getByRole('region',{name:'Personal weekly agenda'})).toBeVisible();await expect(periods.getByRole('button',{name:'This week',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.waitForTimeout(400);const after=await periods.boundingBox();assert(Math.abs(before.width-after.width)<1&&Math.abs(before.y-after.y)<1,'Stable period control');
 await page.reload();await expect(page.getByRole('region',{name:'Personal weekly agenda'})).toBeVisible();
 await periods.getByRole('button',{name:'Today',exact:true}).click();await expect(page.getByRole('region',{name:'Personal weekly agenda'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Open Local personal goal'})).toBeVisible();
 await page.waitForTimeout(400); const animation=await periods.locator('[aria-hidden=true]').evaluate(async el=>{const button=el.parentElement.querySelectorAll('button')[1];button.click();const samples=[];for(let i=0;i<4;i++){await new Promise(resolve=>setTimeout(resolve,45));samples.push(new DOMMatrix(getComputedStyle(el).transform).m41);}return {samples,width:el.getBoundingClientRect().width};});console.log('Animation',width,animation);assert(animation.samples.some(x=>x>0&&x<animation.width-1),'Highlight moves smoothly through intermediate positions');
 await page.waitForTimeout(400);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Personal no overflow');await page.screenshot({path:path.join(output,'personal-week-'+width+'.png')});
 await periods.getByRole('button',{name:'Today',exact:true}).click();await periods.getByRole('button',{name:'This week',exact:true}).click();await periods.getByRole('button',{name:'Today',exact:true}).click();await page.waitForTimeout(400);await expect(periods.getByRole('button',{name:'Today',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('region',{name:'Personal weekly agenda'})).toHaveCount(0);await page.reload();await expect(periods.getByRole('button',{name:'Today',exact:true})).toHaveAttribute('aria-pressed','true');
}
await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.getByRole('group',{name:'Personal time view'}).locator('[aria-hidden=true]').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
assert.deepEqual(errors,[]);console.log('PASS: default and combined filters, reload/reset, transparent images, right-column objectives, no overlap/overflow, Personal period navigation, persistent smooth highlight, rapid switching and reduced motion.');console.log('Screenshots: '+output);
})().catch(async e=>{console.error(e);await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});