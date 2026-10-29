// Isolated browser regression: no production stores, requests, or credentials.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const assert = require('node:assert/strict'), {spawn} = require('node:child_process'), {chromium, expect} = require('@playwright/test');
const app = path.resolve(__dirname, '..'), base = 'http://localhost:3243', secret = 'local-calendar-end-edit';
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-end-edit-'));
const server = spawn(process.execPath, [path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3243'], {cwd:app, env:{...process.env,ADMIN_PASSWORD:'fixture',ADMIN_SESSION_SECRET:secret,FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',RESEND_API_KEY:'',VERCEL:''},stdio:'ignore'});
let browser;
(async () => {
  for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser = await chromium.launch();
  for(const width of [1440,390]) {
    const context = await browser.newContext({viewport:{width,height:900}}), payload = `v1.${Date.now()+3600000}.fixture`;
    await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'end-edit-fixture',url:base}]);
    await context.route('https://**/*', route=>route.abort());
    const page = await context.newPage(), errors=[];
    page.on('pageerror', error=>errors.push(error.message));
    await page.goto(base+'/admin/calendar?date=2026-10-31');
    await page.getByRole('button',{name:'Add event',exact:true}).click();
    const field = name=>page.getByRole('textbox',{name,exact:true});
    const edit = async (name,value)=>{await field(name).fill(value);await page.getByLabel('Title',{exact:true}).click();};
    const start = async ()=>Promise.all(['month','day','year','hour','minute','period'].map(part=>field('Starts '+part).inputValue()));
    const title = 'Timing regression '+width;
    await page.getByLabel('Title',{exact:true}).fill(title);
    await edit('Starts day','28');await edit('Starts hour','4');await edit('Starts minute','00');await edit('Starts period','pm');
    await expect(field('Ends day')).toHaveValue('28');await expect(field('Ends hour')).toHaveValue('5');await expect(field('Ends period')).toHaveValue('pm');
    const chosenStart=await start();
    await edit('Ends hour','6');assert.deepEqual(await start(),chosenStart,'Two-hour duration preserves the start');
    await edit('Ends day','29');await edit('Ends minute','30');assert.deepEqual(await start(),chosenStart,'End date and minute preserve the start');
    await page.getByRole('button',{name:'Save event',exact:true}).click();
    await page.getByRole('dialog',{name:'New event',exact:true}).waitFor({state:'hidden'});
    const saved=async()=>{const r=await context.request.get(base+'/api/planning');assert(r.ok());return (await r.json()).state.events.find(item=>item.title===title);};
    let event=await saved();assert.equal(event.start,'2026-10-28T16:00');assert.equal(event.end,'2026-10-29T18:30');
    await page.goto(base+'/admin/calendar?date=2026-10-28');
    await page.getByRole('button',{name:new RegExp('^'+title+' ·')}).first().click();
    await page.getByRole('button',{name:'Edit event',exact:true}).click();
    await edit('Ends day','30');await edit('Ends hour','7');assert.deepEqual(await start(),chosenStart,'Existing event end edits preserve its start');
    await page.getByRole('button',{name:'Save event',exact:true}).click();await page.getByRole('dialog',{name:'Edit event',exact:true}).waitFor({state:'hidden'});
    event=await saved();assert.equal(event.start,'2026-10-28T16:00');assert.equal(event.end,'2026-10-30T19:30');
    await page.getByRole('button',{name:'Add event',exact:true}).click();await page.getByLabel('Title',{exact:true}).fill('Invalid range fixture');
    await edit('Starts day','28');await edit('Starts hour','4');await edit('Starts period','pm');const invalidStart=await start();
    await edit('Ends day','27');await page.getByRole('button',{name:'Save event',exact:true}).click();await page.getByRole('dialog',{name:'New event',exact:true}).getByText('The end must be after the start',{exact:true}).waitFor();assert.deepEqual(await start(),invalidStart,'Validation reports invalid end without moving the start');
    await edit('Starts day','31');await edit('Starts hour','11');await edit('Starts minute','30');await edit('Starts period','pm');
    await expect(field('Ends month')).toHaveValue('11');await expect(field('Ends day')).toHaveValue('01');await expect(field('Ends hour')).toHaveValue('12');await expect(field('Ends minute')).toHaveValue('30');await expect(field('Ends period')).toHaveValue('am');
    assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS: new/existing events, independent end date/time, persistence, invalid range validation, start default and midnight rollover at desktop/mobile widths. Local synthetic data only.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
