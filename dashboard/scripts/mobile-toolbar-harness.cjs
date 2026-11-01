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

const output=path.join(app,'output/mobile-toolbar');fs.mkdirSync(output,{recursive:true});
let browser;
(async()=>{
 await serverReady;browser=await webkit.launch({executablePath:process.env.WEBKIT_EXECUTABLE});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const payload='v1.'+(Date.now()+3600000)+'.qa';
 await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base}]);
 await context.route(/^https:\/\//,route=>route.abort());
 const page=await context.newPage();const results=[];

 for(const width of (process.env.TOOLBAR_WIDTHS||"320,375,390,430,820,1440").split(",").map(Number)){
  await page.setViewportSize({width,height:900});
  for(const module of ['people','projects','notes','personal','reviews','resources','media','finance']){
   await page.goto(base+'/admin/'+module);const nav=page.locator('.workspace-topnav').first();await expect(nav).toBeVisible();if(width<=900)await expect(nav.locator(".workspace-actions-trigger")).toBeVisible();await page.waitForTimeout(250);
   const search=nav.locator('.app-search-field').first();await expect(search).toBeVisible();
   const common=nav.locator('button').filter({has:page.locator('[data-icon-role="filter"],[data-icon-role="sort"]')});
   const views=nav.locator('.directory-view-cycle');
   const searchBox=await search.boundingBox();
   await page.screenshot({path:path.join(output,"latest.png")});
   if(width<=700){
    assert(await search.locator("input").evaluate(el=>{const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");ctx.font=getComputedStyle(el).font;return el.clientWidth>=ctx.measureText("Search").width;}),module+" Search placeholder fits at "+width);
    for(const control of [...await common.all(),...await views.all()]){
     const box=await control.boundingBox();if(box&&Math.abs(box.y+box.height/2-searchBox.y-searchBox.height/2)>=3)console.log({searchBox,box,label:await control.getAttribute('aria-label')});assert(box&&Math.abs(box.y+box.height/2-searchBox.y-searchBox.height/2)<3,module+' common controls aligned at '+width);
    }
    const geometry=await nav.evaluate(el=>Array.from(el.querySelectorAll('button,input,h1,a')).filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height).map(e=>({label:e.getAttribute('aria-label')||e.textContent?.trim(),x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})));
    for(const box of geometry)assert(box.x>=0&&box.x+box.w<=width+1,module+' toolbar stays inside viewport at '+width+': '+box.label);
    assert((await nav.boundingBox()).height<=120,module+' toolbar uses two rows at '+width);
    results.push({module,width,geometry});
   }
   if(width===390){
    await search.locator('input').fill('Local check');await expect(search.locator('input')).toHaveValue('Local check');await search.locator('input').fill('');
    for(const control of await common.all()){
     await control.click();await page.waitForTimeout(270);
     const panel=page.locator('.app-select-menu:visible,.people-filters-popover:visible,.people-sort-popover:visible,[role="dialog"]:visible,[role="menu"]:visible').last();
     await expect(panel).toBeVisible();const box=await panel.boundingBox();assert(box.x>=-1&&box.x+box.width<=width+1,module+' menu fits');
     await page.keyboard.press('Escape');
    }
    if(await views.count()){const old=await views.getAttribute('aria-label');await views.click();await page.waitForTimeout(300);assert.notEqual(await views.getAttribute('aria-label'),old,module+' view cycles');}
    const browse=nav.locator('.workspace-browse-trigger');
    if(await browse.count()){
     await browse.click();const menu=page.locator('.workspace-nav-menu:not(.workspace-actions-menu):visible').last();await expect(menu).toBeVisible();
     assert.equal(await menu.evaluate(el=>getComputedStyle(el).animationName),'workspace-menu-unfurl');
     await page.waitForTimeout(260);await page.screenshot({path:path.join(output,module+'-menu.png')});
     await page.keyboard.press('Escape');await expect(browse).toBeFocused();
    }
    const action=nav.locator('.workspace-actions-trigger');await action.click();await expect(page.locator('.workspace-actions-menu:visible')).toBeVisible();await page.keyboard.press('Escape');
   }
   if(width===390||module==='resources')await page.screenshot({path:path.join(output,module+'-'+width+'.png')});
  }
  console.log('PASS WebKit toolbar geometry and interactions: '+width+'px');
 }
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/admin/notes');await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.workspace-browse-trigger').click();
 assert.equal(await page.locator('.workspace-nav-menu:not(.workspace-actions-menu):visible').evaluate(el=>getComputedStyle(el).animationName),'none');
 console.log('PASS reduced-motion preference');
 fs.writeFileSync(path.join(output,'geometry.json'),JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
