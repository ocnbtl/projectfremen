// Local-only regression: isolated synthetic data, no external browser requests.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const assert = require('assert/strict');
const { spawn } = require('child_process');
const app = path.resolve(__dirname, '..');
const { webkit, expect } = require(path.join(app, 'node_modules/@playwright/test'));
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-toolbar-'));
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


const output=path.join(app,'output/actions-refinement');fs.mkdirSync(output,{recursive:true});let browser;
(async()=>{await serverReady;browser=await webkit.launch({executablePath:process.env.WEBKIT_EXECUTABLE});const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),payload='v1.'+(Date.now()+3600000)+'.qa';await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'fixture-csrf',url:base}]);await context.route(/^https:\/\//,r=>r.abort());const page=await context.newPage();
for(const module of ['people','projects','notes','personal','reviews','resources','media','finance']){
 await page.goto(base+'/admin/'+module);const trigger=page.locator('.workspace-actions-trigger');await expect(trigger).toBeVisible();await trigger.click();const menu=page.locator('.workspace-actions-menu:visible');await expect(menu).toBeVisible();await page.waitForTimeout(300);
 console.log(module+': '+await menu.innerText());await page.screenshot({path:path.join(output,module+'-actions.png')});
 const rows=menu.locator('.workspace-topnav__actions button:visible');for(const row of await rows.all()){
  assert((await row.innerText()).trim(),module+' has an unlabeled action');
  if(await row.isEnabled())assert(await row.evaluate(el=>{const c=getComputedStyle(el.querySelector('span:last-child')||el).color.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return 1.05/(.2126*c[0]+.7152*c[1]+.0722*c[2]+.05)>=4.5;}),module+' text contrast');assert(await row.locator('svg').count(),module+' missing action icon: '+await row.innerText());
  assert(await row.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),module+' action obscured');
 }
 const bounds=await menu.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=390,module+' menu overflows');
 if(module==='resources'){assert.equal(await menu.getByRole('button',{name:'Check resource duplicates'}).count(),0);await expect(page.locator('.workspace-topnav').getByRole('button',{name:'Check resource duplicates'})).toBeVisible();}
 if(['projects','resources','reviews','personal'].includes(module)){
  const names={projects:'Add project',resources:'Add Resource',reviews:'Weekly review',personal:'Goal'};await menu.getByRole('button',{name:names[module],exact:true}).click();if(module==='projects')await expect(page.getByRole('button',{name:'Create project',exact:true})).toBeVisible();else await expect(page.locator('[role="dialog"]:visible').filter({hasNot:page.locator('.workspace-topnav__actions')}).first()).toBeVisible();
 }else if(module==='media'){await menu.getByRole('button',{name:'Upload options'}).click();await expect(page.getByText('Read embedded JPEG locations on upload')).toBeVisible();await page.keyboard.press('Escape');}
 await page.keyboard.press('Escape');
}
await page.goto(base+'/admin/people');await page.locator('.workspace-actions-trigger').click();await page.getByRole('button',{name:'Log interaction',exact:true}).click();const dialog=page.locator('.people-interaction-dialog');await expect(dialog).toBeVisible();await page.waitForTimeout(300);
for(const width of [375,390,430]){await page.setViewportSize({width,height:844});await page.screenshot({path:path.join(output,'interaction-'+width+'.png')});const date=await dialog.locator('.people-interaction-date').boundingBox(),start=await dialog.getByRole('textbox',{name:'Start Time',exact:true}).boundingBox(),end=await dialog.getByRole('textbox',{name:'End Time',exact:true}).boundingBox();console.log('timing',width,{date,start,end});assert(Math.abs(date.y+date.height/2-start.y-start.height/2)<5,'Date and time must align');assert(end.x+end.width<=width,'Time fits');}
await dialog.getByRole('textbox',{name:'Start Time',exact:true}).fill('10:00 AM');await dialog.getByRole('textbox',{name:'Start Time',exact:true}).press('Tab');await dialog.getByRole('textbox',{name:'End Time',exact:true}).fill('12:30 PM');await dialog.getByRole('textbox',{name:'End Time',exact:true}).press('Tab');await expect(dialog.getByRole('textbox',{name:'Start Time',exact:true})).toHaveValue('10:00 am');
await page.getByRole('button',{name:'Choose start time',exact:true}).click();await expect(page.locator('.people-time-wheel')).toBeVisible();await page.keyboard.press('Escape');await expect(dialog).toBeVisible();console.log('PASS action labels, icons, overlay hit targets, duplicate placement, mobile date/time and independent end-time edits.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
