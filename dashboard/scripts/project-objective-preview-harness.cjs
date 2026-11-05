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
const output = path.join(os.tmpdir(), 'fremen-project-objective-preview-qa');
fs.mkdirSync(output, { recursive: true });
let browser,page;
(async()=>{
 await serverReady;browser=await chromium.launch();const context=await browser.newContext(),payload=`v1.${Date.now()+3600000}.qa`;
 await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'fixture-csrf',url:base}]);
 await context.route(/^https?:\/\//,r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const headers={origin:base,'x-csrf-token':'fixture-csrf'},post=async(route,data)=>{const r=await context.request.post(base+route,{headers,data});assert(r.ok(),await r.text());return r.json();};
 const create=async input=>(await post('/api/projects',{operation:'create',family:'projects',input})).item;
 const target=await create({name:'Preview target',lifecycle:'active',objectives:[{text:'Publish guide',targetAt:'2027-01-15'},{text:'Preserve this sibling',completed:true}]});
 for(let i=0;i<14;i++)await create({name:'Preview neighbor '+i,lifecycle:'active',objectives:[{text:'Neighbor objective '+i}]});
 const linked=await create({name:'Preview linked goal',lifecycle:'active'});
 const finished=await create({name:'Preview finished project',lifecycle:'active',objectives:[{text:'Finished objective',completed:true}]});
 const fixtureFile=path.join(data,'projects.json'),fixture=JSON.parse(fs.readFileSync(fixtureFile,'utf8'));fixture.projects.find(row=>row.id===finished.id).lifecycle='complete';fs.writeFileSync(fixtureFile,JSON.stringify(fixture));
 await post('/api/personal/ops',{family:'goals',input:{title:'Goal from Personal',outcome:'A measurable result',domain:'Home',sourceRefs:[{module:'projects',objectType:'project',objectId:linked.id,label:linked.name,route:'/admin/projects/'+linked.id}]}});
 const readProject=async()=> (await (await context.request.get(base+'/api/projects?family=projects&id='+target.id)).json()).item;
 page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/admin/projects?q=Preview');
 const search=page.getByRole('searchbox');await search.fill('Preview');
 const open=()=>page.getByRole('button',{name:'Edit objective: Publish guide',exact:true});
 await open().scrollIntoViewIfNeeded();await open().focus();
 const before=await open().boundingBox(),url=page.url(),order=await page.locator('.resource-card-title').allTextContents();
 const scrolls=()=>page.evaluate(()=>({window:scrollY,panels:[...document.querySelectorAll('*')].filter(el=>el.scrollTop>0).map(el=>[el.className,el.scrollTop])}));
 const scrollBefore=await scrolls();await open().press('Enter');
 let dialog=page.getByRole('dialog',{name:'Objective',exact:true});await expect(dialog.getByRole('textbox',{name:'Objective text'})).toHaveValue('Publish guide');
 await dialog.getByRole('textbox',{name:'Objective text'}).fill('Published guide');await dialog.getByLabel('Target date',{exact:true}).fill('2027-02-12');await dialog.getByRole('button',{name:'Mark complete',exact:true}).click();
 const sibling=(await readProject()).objectives[1];
 await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await expect(dialog.getByRole('status')).toHaveText('Saved');
 const saved=await readProject();assert.equal(saved.objectives[0].text,'Published guide');assert(saved.objectives[0].completedAt);assert(saved.objectives[0].targetAt.startsWith('2027-02-12'));assert.deepEqual({...saved.objectives[1],updatedAt:sibling.updatedAt},sibling);
 await dialog.getByRole('button',{name:'Close',exact:true}).click();await expect(dialog).toHaveCount(0);
 assert.equal(page.url(),url);await expect(search).toHaveValue('Preview');assert.deepEqual(await page.locator('.resource-card-title').allTextContents(),order);assert.deepEqual(await scrolls(),scrollBefore);await expect(page.getByRole('button',{name:'Edit objective: Published guide',exact:true})).toBeFocused();
 const after=await page.getByRole('button',{name:'Edit objective: Published guide',exact:true}).boundingBox();assert(Math.abs(before.y-after.y)<3,'card position preserved');
 // Dirty dismissal never silently loses edits.
 await page.getByRole('button',{name:'Edit objective: Published guide',exact:true}).click();await expect(dialog.getByRole('textbox',{name:'Objective text'})).toHaveValue('Published guide');await dialog.getByRole('textbox',{name:'Objective text'}).fill('Unsaved draft');await page.keyboard.press('Escape');await expect(dialog.getByText('Keep your unsaved changes?')).toBeVisible();await dialog.getByRole('button',{name:'Keep editing'}).click();await expect(dialog.getByRole('textbox',{name:'Objective text'})).toHaveValue('Unsaved draft');
 // Stale writes fail without overwriting another session or erasing this draft.
 const concurrent=await readProject();const external=await context.request.patch(base+'/api/projects',{headers,data:{operation:'update',family:'projects',id:target.id,expectedUpdatedAt:concurrent.updatedAt,patch:{description:'Changed in another session'}}});assert(external.ok(),await external.text());
 await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();assert.equal((await readProject()).objectives[0].text,'Published guide');await expect(dialog.getByRole('textbox',{name:'Objective text'})).toHaveValue('Unsaved draft');await dialog.getByRole('button',{name:'Reload latest'}).click();await dialog.getByRole('button',{name:'Discard changes'}).click();await expect(dialog.getByRole('textbox',{name:'Objective text'})).toHaveValue('Published guide');await dialog.getByRole('button',{name:'Close',exact:true}).click();
 // Responsive preview editing and layout switching retain the directory.
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});for(let view=0;view<3;view++){
   const trigger=page.getByRole('button',{name:'Edit objective: Published guide',exact:true});await trigger.click();await expect(dialog.getByRole('textbox',{name:'Objective text'})).toHaveValue('Published guide');assert(await dialog.evaluate(el=>el.getBoundingClientRect().left>=0&&el.getBoundingClientRect().right<=innerWidth+1),'dialog fits');
   await expect(dialog).toHaveCSS("opacity","1");await page.screenshot({path:path.join(output,`preview-${width}-${view}.png`)});await dialog.getByRole('button',{name:'Close',exact:true}).click();await expect(trigger).toBeFocused();await page.getByRole('button',{name:/^View: .*Switch to/}).first().click();
 }}
 await page.setViewportSize({width:390,height:900});await page.getByRole('button',{name:'Edit objective: Goal from Personal',exact:true}).click();const goalDialog=page.getByRole('dialog',{name:'Linked goal',exact:true});await expect(goalDialog.getByRole('textbox',{name:'Objective text'})).toHaveValue('Goal from Personal');await goalDialog.getByRole('textbox',{name:'Objective text'}).fill('Updated linked goal');await goalDialog.getByRole('textbox',{name:'Desired outcome'}).fill('An improved outcome');await goalDialog.getByRole('button',{name:'Save changes',exact:true}).click();await expect(goalDialog.getByRole('status')).toHaveText('Saved');await goalDialog.getByRole('button',{name:'Close',exact:true}).click();await expect(page.getByRole('button',{name:'Edit objective: Updated linked goal',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('button',{name:'Edit objective: Updated linked goal',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Edit objective: Finished objective',exact:true}).click();await expect(dialog.getByRole('textbox',{name:'Objective text'})).toBeDisabled();await expect(dialog.getByRole('button',{name:'Save changes',exact:true})).toHaveCount(0);await dialog.getByRole('button',{name:'Close',exact:true}).click();
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Edit objective: Published guide',exact:true}).click();await expect(dialog).toHaveCSS('animation-name','none');await dialog.getByRole('button',{name:'Close',exact:true}).click();
 // Editing the only search match must not unmount the preview or its card.
 await search.fill('Updated linked goal');await page.getByRole('button',{name:'Edit objective: Updated linked goal',exact:true}).click();await expect(goalDialog.getByRole('textbox',{name:'Objective text'})).toHaveValue('Updated linked goal');await goalDialog.getByRole('textbox',{name:'Objective text'}).fill('Renamed linked goal');await goalDialog.getByRole('button',{name:'Save changes',exact:true}).click();await expect(goalDialog.getByRole('status')).toHaveText('Saved');await goalDialog.getByRole('button',{name:'Close',exact:true}).click();await expect(search).toHaveValue('Updated linked goal');await expect(page.getByRole('button',{name:'Edit objective: Renamed linked goal',exact:true})).toBeVisible();await search.fill('No matching fixture');await expect(page.getByText('No projects match this operating view')).toBeVisible();await search.fill('Updated linked goal');await expect(page.getByText('No projects match this operating view')).toBeVisible();
 assert.deepEqual(errors,[]);console.log('PASS: objective edit/date/completion persists; siblings preserved; linked goal edits persist; search/order/scroll/focus preserved; unsaved and stale-write protection; read-only and reduced motion; 9 responsive/view checks.');
})().catch(async e=>{console.error(e);await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
