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



const output=path.join(app,'output/actions-motion');fs.mkdirSync(output,{recursive:true});let browser;
(async()=>{
 await serverReady;
 browser=await webkit.launch({executablePath:process.env.WEBKIT_EXECUTABLE});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const payload='v1.'+(Date.now()+3600000)+'.qa';
 await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'fixture-csrf',url:base}]);
 await context.route(/^https:\/\//,route=>route.abort());
 const page=await context.newPage();page.setDefaultTimeout(10000);
 await page.addInitScript(()=>{window.actionAnimations=[];document.addEventListener('animationstart',event=>{if(event.target.matches('.workspace-actions-menu'))window.actionAnimations.push(event.animationName);},true);});
 for(const module of ['people','projects','notes','personal','reviews','resources','media','finance']){
  await page.goto(base+'/admin/'+module);
  const trigger=page.locator('.workspace-actions-trigger'),menu=page.locator('.workspace-actions-menu');
  await expect(trigger).toBeVisible();await expect(menu).toBeHidden();
  await trigger.click();await expect(menu).toBeVisible();await page.waitForTimeout(280);
  assert(await menu.evaluate(el=>el.contains(document.activeElement)),module+' initial keyboard focus');
  const before=await menu.locator('button:visible').first().evaluate(el=>({height:el.offsetHeight,width:el.offsetWidth,background:getComputedStyle(el).backgroundColor}));
  await page.keyboard.press('Escape');await page.waitForTimeout(35);
  const closing=await menu.evaluate(el=>({exiting:el.dataset.exiting,inert:el.inert,hidden:el.getAttribute('aria-hidden'),display:getComputedStyle(el).display,animation:getComputedStyle(el).animationName}));
  assert.equal(closing.exiting,'true',module+' retains exit phase');assert(closing.inert);assert.equal(closing.hidden,'true');assert.notEqual(closing.display,'none');assert.equal(closing.animation,'workspace-menu-fold');
  const during=await menu.locator('button').filter({visible:true}).first().evaluate(el=>({height:el.offsetHeight,width:el.offsetWidth,background:getComputedStyle(el).backgroundColor}));
  assert.deepEqual(during,before,module+' rows remain stable during exit');
  await expect(menu).toBeHidden();await expect(trigger).toBeFocused();
  const animations=await page.evaluate(()=>window.actionAnimations);assert(animations.includes('workspace-menu-unfurl'));assert(animations.includes('workspace-menu-fold'));
  await page.evaluate(()=>{const trigger=document.querySelector('.workspace-actions-trigger');trigger.click();setTimeout(()=>trigger.click(),45);setTimeout(()=>trigger.click(),90);});
  await page.waitForTimeout(400);await expect(menu).toBeVisible();await expect(menu).toHaveAttribute('data-state','open');
  await page.screenshot({path:path.join(output,module+'.png')});
  await page.mouse.click(2,300);await expect(menu).toBeHidden();
  await page.emulateMedia({reducedMotion:'reduce'});await trigger.click();assert.equal(await menu.evaluate(el=>getComputedStyle(el).animationName),'none');await page.keyboard.press('Escape');await expect(menu).toBeHidden();await expect(trigger).toBeFocused();await page.emulateMedia({reducedMotion:'no-preference'});
  console.log('PASS '+module+': animated entry/exit, stable rows, focus, rapid reversal, outside dismissal, reduced motion');
 }
 await page.goto(base+'/admin/media');
 for(const viewport of [{width:320,height:568},{width:375,height:667},{width:430,height:932},{width:844,height:390}]){
  await page.setViewportSize(viewport);await page.locator('.workspace-actions-trigger').click();await page.waitForTimeout(280);
  const parent=page.locator('.workspace-actions-menu');await expect(parent.locator('input[type=file]')).toBeHidden();await parent.getByRole('button',{name:'Upload options',exact:true}).click();
  const child=page.locator('.workspace-actions-submenu');await expect(child).toBeVisible();await page.waitForTimeout(250);
  const bounds=await child.boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width+1&&bounds.y+bounds.height<=viewport.height+1,'Nested menu fits '+JSON.stringify(viewport));
  assert.equal(await child.evaluate(el=>Boolean(el.parentElement.closest('.workspace-actions-menu'))),false,'Nested menu is outside parent clipping');
  const checkbox=child.locator('input[type="checkbox"]');await expect(checkbox).toBeVisible();assert(await checkbox.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;}),'Nested checkbox not obscured');
  await checkbox.check();await expect(checkbox).toBeChecked();await expect(parent).toHaveAttribute('data-state','open');
  await page.screenshot({path:path.join(output,'nested-'+viewport.width+'.png')});
  await page.keyboard.press('Escape');await expect(child).toBeHidden();await expect(parent).toHaveAttribute('data-state','open');await expect(parent.getByRole('button',{name:'Upload options',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');await expect(parent).toBeHidden();
 }
 await page.goto(base+'/admin/personal');await page.setViewportSize({width:375,height:667});
 // Exercise the real shared selector inside the action host without changing shipped UI.
 await page.addStyleTag({content:'.workspace-actions-menu .workspace-create-select {display:block!important}'});
 await page.locator('.workspace-actions-trigger').click();await page.waitForTimeout(280);
 await page.getByRole('combobox',{name:'Create personal item'}).click();
 const choices=page.locator('.app-choice-menu[data-actions-submenu]');await expect(choices).toBeVisible();
 assert.equal(await choices.evaluate(el=>Boolean(el.parentElement.closest('.workspace-actions-menu'))),false);
 const choiceBounds=await choices.boundingBox();assert(choiceBounds.x>=0&&choiceBounds.x+choiceBounds.width<=375&&choiceBounds.y>=0&&choiceBounds.y+choiceBounds.height<=667);
 await page.keyboard.press('Escape');await expect(choices).toBeHidden();await expect(page.locator('.workspace-actions-menu')).toHaveAttribute('data-state','open');
 await page.getByRole('combobox',{name:'Create personal item'}).click();await choices.getByRole('option',{name:'Goal',exact:true}).click();
 const form=page.locator('[role="dialog"]:visible').filter({hasNot:page.locator('.workspace-topnav__actions')}).first();await expect(form).toBeVisible();await page.waitForTimeout(250);await expect(form).toBeVisible();
 const field=form.locator('input:not([type]),input[type="text"]').first();await field.fill('Local unsaved draft');await page.waitForTimeout(250);await expect(field).toHaveValue('Local unsaved draft');
 console.log('PASS real nested selector portal, keyboard dismissal and form/draft preservation');
 console.log('PASS nested menu bounds, visible hit targets, selection and keyboard dismissal at four mobile sizes');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
