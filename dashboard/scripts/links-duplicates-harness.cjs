// Local-only regression: isolated synthetic data, no external browser requests.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const assert = require('assert/strict');
const { spawn } = require('child_process');
const app = path.resolve(__dirname, '..');
const { webkit, expect } = require(path.join(app, 'node_modules/@playwright/test'));
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'links-duplicates-'));
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

const output=path.join(app,'output/links-duplicates');fs.mkdirSync(output,{recursive:true});let browser;
(async()=>{
 await serverReady;browser=await webkit.launch({executablePath:process.env.WEBKIT_EXECUTABLE});
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}});
 const payload='v1.'+(Date.now()+3600000)+'.qa';await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'fixture-csrf',url:base}]);await context.route(/^https:\/\//,r=>r.abort());
 const headers={origin:base,'x-csrf-token':'fixture-csrf'},post=async(route,data)=>{const response=await context.request.post(base+route,{headers,data});assert(response.ok(),await response.text());return response.json();};
 const create=async(title,className,extra={})=>{const result=await post('/api/personal/records',{domain:'notes-docs',title,className,status:'active',...extra});return result.items.find(item=>item.title===title);};
 const org=await create('QA Cedar Studio','org'),school=await create('QA Cedar College','org');
 const alice=await create('QA Alice','person',{profile:{occupations:[{id:'job',title:'Designer',employer:org.title,organizationId:org.id,status:'current'}],education:[{id:'school',institution:school.title,organizationId:school.id}]}});
 const bob=await create('QA Bob','person',{profile:{associatedPeople:[alice.title]}});
 const a=await create('QA Circle icon','resource',{url:'https://icons.example/library#circle',relations:{related:[alice.id]}});
 const b=await create('QA Square icon','resource',{url:'https://icons.example/library#square'});
 const personRef={module:'people',objectType:'person',objectId:alice.id,label:alice.title,route:'/admin/people/'+alice.id};
 const orgRef={module:'people',objectType:'organization',objectId:org.id,label:org.title,route:'/admin/people/'+org.id};
 await post('/api/native-links',{source:orgRef,target:personRef,relationship:'colleague'});
 const resourceRef={module:'resources',objectType:'resource',objectId:a.id,label:a.title,route:'/admin/resources/'+a.id};
 await post('/api/native-links',{source:personRef,target:resourceRef,relationship:'reference'});
 const project=(await post('/api/projects',{operation:'create',family:'projects',input:{name:'QA Linked project',lifecycle:'active'}})).item;
 await post('/api/projects',{operation:'create',family:'links',input:{projectId:project.id,source:personRef,relationship:'project_person',relationshipStrength:'normal'}});
 const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/admin/people/'+alice.id+'?tab=links');const hub=page.getByRole('region',{name:'QA Alice links'});await expect(hub).toBeVisible();
 for(const [category,name] of [['organizations',org.title],['organizations',school.title],['people',bob.title],['resources',a.title],['projects',project.name]])await expect(hub.getByRole('region',{name:'Linked '+category,exact:true}).getByText(name,{exact:true})).toHaveCount(1);
 await page.screenshot({path:path.join(output,'people-links-desktop.png')});
 await hub.getByLabel('Search linked objects').fill('Cedar');await expect(hub.getByText(bob.title,{exact:true})).toHaveCount(0);await hub.getByLabel('Search linked objects').fill('');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(output,'people-links-mobile.png')});
 await hub.getByRole('button',{name:new RegExp("^"+org.title)}).click();await expect(page).toHaveURL(new RegExp(org.id));await page.goto(base+'/admin/people/'+org.id+'?tab=links');await expect(page.getByRole('region',{name:org.title+' links'}).getByText(alice.title,{exact:true})).toHaveCount(1);
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/admin/resources?view=duplicate-urls');let review=page.getByRole('region',{name:'Resource duplicate review'});await expect(review).toHaveAttribute('data-ready','true');await expect(review.getByRole('button',{name:'Keep separate',exact:true})).toBeVisible();const indicator=page.getByRole('button',{name:'Check resource duplicates'});await expect(indicator).toHaveAttribute('data-warning','true');await page.screenshot({path:path.join(output,'duplicates-desktop.png')});
 await review.getByRole('button',{name:'Keep separate',exact:true}).click();await expect(review.getByRole('heading',{name:'No duplicates to review'})).toBeVisible();await expect(indicator).not.toHaveAttribute('data-warning','true');
 await page.reload();review=page.getByRole('region',{name:'Resource duplicate review'});await expect(review).toHaveAttribute('data-ready','true');await expect(review.getByRole('heading',{name:'No duplicates to review'})).toBeVisible();await review.getByRole('button',{name:/Kept separate/}).click();await expect(review.getByText(a.title,{exact:true})).toBeVisible();await review.getByRole('button',{name:'Review again',exact:true}).click();await review.getByRole('button',{name:/Needs review/}).click();await expect(review.getByRole('button',{name:'Keep separate',exact:true})).toBeVisible();
 // A failed write stays actionable and never reports a successful review.
 await page.route('**/api/personal/records',route=>route.request().method()==='PATCH'?route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({ok:false,error:'This record changed after it was opened. Refresh before saving.'})}):route.continue());await review.getByRole('button',{name:'Keep separate',exact:true}).click();await expect(review.getByRole('alert')).toContainText('changed after');await expect(review.getByRole('button',{name:'Keep separate',exact:true})).toBeEnabled();await page.unroute('**/api/personal/records');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(output,'duplicates-mobile.png')});await review.getByRole('button',{name:'Archive duplicate '+b.title,exact:true}).click();const dialog=page.getByRole('dialog',{name:'Archive duplicate?'});await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Archive resource',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(review.getByRole('heading',{name:'No duplicates to review'})).toBeVisible();
 const records=(await(await context.request.get(base+'/api/personal/records')).json()).items;assert.equal(records.length,6);assert(records.find(item=>item.id===b.id).archivedAt);assert.deepEqual(records.find(item=>item.id===a.id).relations.related,[alice.id]);assert.equal((await(await context.request.get(base+'/api/native-links')).json()).items.length,2);
 // Restore keeps the record and makes its unresolved match visible again.
 const archived=records.find(item=>item.id===b.id);const restored=await context.request.patch(base+'/api/personal/records',{headers,data:{id:b.id,action:'restore',expectedUpdatedAt:archived.updatedAt}});assert(restored.ok(),await restored.text());await page.reload();await expect(page.getByRole('button',{name:'Keep separate',exact:true})).toBeVisible();
 assert.deepEqual(errors,[]);console.log('PASS People forward/reverse employment, education, people, project and resource links; deduplication; search; mobile; persistent/reversible duplicate reviews; conflict feedback; archive/restore without deletion or lost links.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});




