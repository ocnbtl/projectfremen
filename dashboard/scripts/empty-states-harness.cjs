// Local-only regression: isolated synthetic data, no external browser requests.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const assert = require('assert/strict');
const { spawn } = require('child_process');
const app = path.resolve(__dirname, '..');
const { webkit, expect } = require(path.join(app, 'node_modules/@playwright/test'));
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'personal-pages-'));
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




const output=path.join(app,'output/empty-states');fs.mkdirSync(output,{recursive:true});let browser;

(async()=>{
 await serverReady;browser=await webkit.launch({executablePath:process.env.WEBKIT_EXECUTABLE});
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}});
 const payload='v1.'+(Date.now()+3600000)+'.qa';await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base}]);await context.route(/^https:\/\//,r=>r.abort());
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/admin/personal?types=routine');await expect(page.getByRole('button',{name:'Add section',exact:true})).toBeEnabled();
 const empty=page.locator('.system-state');await expect(empty.getByRole('heading',{name:'No routines yet'})).toBeVisible();const add=empty.getByRole('button',{name:'Add Routine',exact:true});await expect(add).toBeVisible();assert((await add.boundingBox()).width<240);assert((await empty.boundingBox()).width<=722);await page.screenshot({path:path.join(output,'routines-desktop.png')});
 await add.click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page).toHaveURL(base+'/admin/personal/routines');
 await page.goto(base+'/admin/personal?query=missing&area=Health&linked=people&timing=overdue&types=goal');await expect(page.getByRole('button',{name:'Add section',exact:true})).toBeEnabled();await expect(empty.getByRole('heading',{name:'No matching goals'})).toBeVisible();await empty.getByRole('button',{name:'Clear filters'}).click();await expect(page).toHaveURL(base+'/admin/personal');await expect(page.getByRole('heading',{name:'No matching goals'})).toHaveCount(0);
 await page.goto(base+'/admin/personal?types=routine');await expect(page.getByRole('button',{name:'Add section',exact:true})).toBeEnabled();await page.setViewportSize({width:390,height:844});await expect(empty.getByRole('heading',{name:'No routines yet'})).toBeVisible();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await empty.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'routines-mobile.png')});await empty.getByRole('button',{name:'Show all'}).click();await expect(page).toHaveURL(base+'/admin/personal');
 await page.goto(base+'/admin/resources?query=missing');await expect(page.getByRole('navigation',{name:'Resources navigation'}).getByRole('searchbox')).toBeVisible();await expect(empty).toBeVisible();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(output,'resources-mobile.png')});
 assert.deepEqual(errors,[]);console.log('PASS responsive shared empty states, contextual Routine action, clear all filter dimensions, Show all, compact action sizing, no browser errors.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
