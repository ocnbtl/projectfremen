// Local-only regression: isolated synthetic data, no external browser requests.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const assert = require('assert/strict');
const { spawn } = require('child_process');
const app = path.resolve(__dirname, '..');
const { chromium, expect } = require(path.join(app, 'node_modules/@playwright/test'));
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'directory-motion-'));
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
const output = path.join(app, 'output/directory-motion');
fs.mkdirSync(output, { recursive: true });
let browser, page;
(async()=>{await serverReady;browser=await chromium.launch();const context=await browser.newContext({timezoneId:'America/New_York'}),payload=`v1.${Date.now()+3600000}.qa`;await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'fixture-csrf',url:base}]);await context.route(/^https:\/\//,r=>r.abort());const headers={origin:base,'x-csrf-token':'fixture-csrf'},post=async(route,data)=>{const r=await context.request.post(base+route,{headers,data});assert(r.ok(),await r.text());return r.json();};

const picture='<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#296c88"/><circle cx="40" cy="30" r="18" fill="#e1f0f6"/></svg>';
await context.route('https://fixture.example/**',r=>r.fulfill({contentType:'image/svg+xml',body:picture}));await context.route('**/api/people/photos/**',r=>r.fulfill({contentType:'image/svg+xml',body:picture}));
for(let i=0;i<7;i++){
 const person=(await post('/api/personal/records',{domain:'family',className:'person',title:'Motion person '+i,status:'active',subjects:['Friend'],profile:{context:'A contact with a short description for layout checks.',occupation:i%2?'Designer':'',photoUrl:'/api/people/photos/personal-'+crypto.randomUUID()}})).items.find(x=>x.title==='Motion person '+i);
 await post('/api/personal/records',{domain:'family',className:'org',title:'Motion organization '+i,status:'active',profile:{context:'A local organization.',organizationType:'Business',photoUrl:'/api/people/photos/personal-'+crypto.randomUUID()}});
 await post('/api/personal/records',{domain:'notes-docs',className:'interaction',title:'Motion interaction '+i,status:'completed',interaction:{kind:'call',occurredOn:'2026-10-29',participantIds:[person.id],startTime:'09:00',endTime:'11:00',updatesLastContact:false}});
 await post('/api/personal/records',{domain:'notes-docs',className:'idea',title:'Motion note '+i,status:'active',body:'A note with enough detail to compare comfortable, compact, and grid presentation.'});
 await post('/api/personal/records',{domain:'notes-docs',className:'resource',title:'Motion resource '+i,status:'active',body:'A useful reference with a stable image.',url:'https://fixture.example/'+i,resourceProfile:{version:1,resourceType:'tool',metadata:{imageUrl:'https://fixture.example/picture.svg'},lifecycle:'active'}});
 await post('/api/projects',{operation:'create',family:'projects',input:{name:'Motion project '+i,description:'A shared project with an outcome and useful context.',lifecycle:'active'}});
 await post('/api/personal/ops',{family:'goals',input:{title:'Motion goal '+i,outcome:'A useful personal outcome to keep track of.',lifecycle:'active',cadence:'current'}});
 await post('/api/reviews/runs',{input:{cadence:'weekly',title:'Motion review '+i,periodStart:'2026-10-19',periodEnd:'2026-10-25'}});
 const buffer=Buffer.from(picture.replace('#296c88',i%2?'#995972':'#296c88')),id=crypto.randomUUID();await post('/api/media/files',{action:'chunk',id,index:0,data:buffer.toString('base64')});await post('/api/media/files',{action:'finish',name:'Motion image '+i+'.svg',mimeType:'image/svg+xml',file:{id,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),byteLength:buffer.length,chunkSize:1048576,totalChunks:1}});
}
page=await context.newPage();page.setDefaultTimeout(15000);const errors=[],writes=[],backgroundRequests=[],results=[];let phase='navigation';page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(['POST','PATCH','DELETE'].includes(r.method()))(phase==='view' ? writes : backgroundRequests).push({url:r.url(),method:r.method(),body:r.postData()});});
const routes=[['people','/admin/people'],['organizations','/admin/people?sidebar=organizations'],['interactions','/admin/people?sidebar=interactions'],['projects','/admin/projects'],['notes','/admin/notes'],['media','/admin/media'],['personal','/admin/personal/goals'],['reviews','/admin/reviews'],['resources','/admin/resources']];
const cards=()=>page.locator('[data-directory-motion-card]:visible');
async function recordTransition(name,width,round,reduced=false){
 const nodes=await cards().elementHandles();assert(nodes.length>=7,name+' missing fixtures');
 await page.evaluate(()=>{window.__cardFrames=[];window.__cardDone=false;let start=performance.now();const sample=()=>{window.__cardFrames.push({t:performance.now()-start,cards:[...document.querySelectorAll('[data-directory-motion-card]')].slice(0,7).map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,transform:el.style.transform||'none',computedTransform:getComputedStyle(el).transform};})});if(performance.now()-start<900)requestAnimationFrame(sample);else window.__cardDone=true;};requestAnimationFrame(sample);});
 const cycle=page.getByRole('button',{name:/^View: .*Switch to/}).first();phase='view';await cycle.click();await page.waitForTimeout(130);if(width===1800&&round===1)await page.screenshot({path:path.join(output,name+'-mid.png')});await page.waitForFunction(()=>window.__cardDone);
 const frames=await page.evaluate(()=>window.__cardFrames),first=frames[0].cards,last=frames.at(-1).cards;const changed=first.some((r,i)=>['x','y','w','h'].some(k=>Math.abs(r[k]-last[i][k])>2));const animated=frames.some(frame=>frame.cards.some(card=>card.transform!=='none'&&card.transform!=='matrix(1, 0, 0, 1, 0, 0)'));
 for(const node of nodes)assert(await node.evaluate(el=>el.isConnected),name+' remounted a card');
 if(changed&&!reduced)assert(animated,name+' snapped instead of animating '+width+' '+round);if(reduced)assert(!animated,name+' ignored reduced motion');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' overflow');
 phase='navigation';results.push({name,width,round,changed,animated,reduced,frames:frames.length});if(width===390||round===2)await page.screenshot({path:path.join(output,name+'-'+width+'-'+round+'.png')});
}
for(const width of [1800,820,390]){await page.setViewportSize({width,height:1000});for(const [name,route]of routes){await page.goto(base+route);await expect(cards().first()).toBeVisible();await expect(page.getByRole('button',{name:/^View: .*Switch to/}).first()).toBeVisible();await page.waitForTimeout(550);for(let round=0;round<3;round++)await recordTransition(name,width,round);}}
// Interrupt an in-flight transition; card identity and the final layout must survive.
await page.setViewportSize({width:1800,height:1000});for(const [name,route]of routes){await page.goto(base+route);await expect(cards().first()).toBeVisible();const cycle=page.getByRole('button',{name:/^View: .*Switch to/}).first();await page.waitForTimeout(550);phase='view';for(let i=0;i<5;i++){await cycle.click();await page.waitForTimeout(45);}await page.waitForTimeout(650);assert(await page.evaluate(()=>[...document.querySelectorAll('[data-directory-motion-card]')].every(el=>getComputedStyle(el).transform==='none')),'Unsettled transform '+name);phase='navigation';}
await page.goto(base+'/admin/personal/goals');const cycle=page.getByRole('button',{name:/^View: .*Switch to/}).first();phase='view';while(!(await cycle.getAttribute('aria-label')).includes('View: Grid.'))await cycle.click();await page.waitForTimeout(550);phase='navigation';await page.reload();await expect(cycle).toHaveAttribute('aria-label',/View: Grid/);await page.getByRole('combobox',{name:'Change status for Motion goal 0',exact:true}).click();await expect(page.getByRole('option',{name:'Active',exact:true})).toBeVisible();await page.keyboard.press('Escape');assert.equal(writes.length,0,'View changes sent mutation requests: '+JSON.stringify(writes));
await page.emulateMedia({reducedMotion:'reduce'});for(const [name,route]of routes){await page.goto(base+route);await expect(cards().first()).toBeVisible();await page.waitForTimeout(550);await recordTransition(name,1800,0,true);}
assert.deepEqual(errors,[]);assert.equal(writes.length,0);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,results,errors,writes,backgroundRequests},null,2));console.log('PASS: 9 directories, 3 views, desktop/tablet/phone frame sampling, stable card identity, rapid switching, reduced motion, Personal view persistence and status menu, no view-triggered writes or browser errors.');
})().catch(async e=>{console.error(e);if(page)await page.screenshot({path:path.join(output,'failure.png')});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
