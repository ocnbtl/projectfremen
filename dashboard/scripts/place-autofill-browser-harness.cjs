/* Local build, synthetic records and mocked lookup responses. No live app tests. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {webkit,expect}=require('@playwright/test');
const app=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'place-autofill-')),out=path.join(app,'output/place-autofill');fs.mkdirSync(out,{recursive:true});
const now=new Date().toISOString(),initial={schemaVersion:1,calendars:[{id:'native',name:'Fixture calendar',color:'#59518B',visible:true,groups:[],createdAt:now,updatedAt:now}],events:[],places:[],connections:[],savedViews:[]};
fs.writeFileSync(path.join(data,'planning-records.json'),JSON.stringify(initial));fs.writeFileSync(path.join(data,'personal-records.json'),'[]');
const port=String(20000+crypto.randomInt(30000)),base='http://localhost:'+port,secret=crypto.randomBytes(24).toString('hex');
const server=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',port],{cwd:app,env:{...process.env,ADMIN_PASSWORD:'test',ADMIN_SESSION_SECRET:secret,FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',RESEND_API_KEY:'',VERCEL:'',PLAID_SECRET:'',COINBASE_API_KEY:''},stdio:['ignore','pipe','pipe']});
const ready=new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('Local startup timeout')),15000);timer.unref();server.stdout.on('data',b=>{text+=b;if(text.includes('Ready in')){clearTimeout(timer);resolve();}});server.stderr.on('data',()=>{});server.once('error',reject);});
const blank={street:'',city:'',region:'',postalCode:'',district:''};
const exuma={name:'Exuma',address:'Exuma, Bahamas',countryCode:'BS',addressParts:{...blank,city:'Exuma'},latitude:23.441,longitude:-75.8217313,kind:'city',precision:'area'};
const bahamas={name:'The Bahamas',address:'The Bahamas',countryCode:'BS',addressParts:blank,latitude:24.7736546,longitude:-78.0000547,kind:'archipelago',precision:'area'};
const tokyo={name:'Tokyo',address:'Tokyo, Japan',countryCode:'JP',addressParts:{...blank,city:'Tokyo'},latitude:35.68,longitude:139.76,kind:'city',precision:'area'};
let browser,page;
(async()=>{
 await ready;browser=await webkit.launch({executablePath:process.env.WEBKIT_EXECUTABLE});const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}});
 const payload='v1.'+(Date.now()+3600000)+'.qa',csrf=crypto.randomBytes(24).toString('hex');
 await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:csrf,url:base}]);
 const calls=[],errors=[];let delayed;
 await context.route('**/*',async route=>{
  const req=route.request();if(new URL(req.url()).origin!==base)return route.abort();
  if(req.url()===base+'/api/map'&&req.method()==='POST'){
   const body=req.postDataJSON();calls.push(body);
   if(body.operation==='place_autofill'){
    assert(!body.countryCode,'Full place search must be worldwide');
    if(body.query==='Slow lookup'){delayed=route;return;}
    if(body.query==='Lookup error')return route.fulfill({status:503,json:{ok:false,error:'Lookup temporarily unavailable.'}});
    return route.fulfill({json:{ok:true,data:body.query==='Exumas'?[exuma,{...tokyo,name:'Other match'}]:body.query==='Bahamas'?[bahamas]:body.query==='Tokyo'?[tokyo]:[]}});
   }
   return route.fulfill({json:{ok:true,data:[{name:'Airport fixture',address:'3087 Terminal Dr, Hebron, KY 41048',countryCode:'US',addressParts:{...blank,street:'3087 Terminal Dr',city:'Hebron',region:'KY',postalCode:'41048'},latitude:39.0499,longitude:-84.6651}]}});
  }
  return route.continue();
 });
 page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 const navigate=async route=>{await page.goto(base+route);await page.waitForTimeout(700);};
 const state=()=>JSON.parse(fs.readFileSync(path.join(data,'planning-records.json'),'utf8'));
 const snap=async name=>{assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflow');await page.screenshot({path:path.join(out,name+'.png')});};
 // Real auth/validation path, with invalid queries so no server provider requests occur.
 const anon=await context.request.post(base+'/api/map',{headers:{Cookie:''},data:{operation:'place_autofill',query:'Exumas'}});assert.equal(anon.status(),401);
 const noCsrf=await context.request.post(base+'/api/map',{data:{operation:'place_autofill',query:'Exumas'}});assert.equal(noCsrf.status(),403);
 const invalid=await context.request.post(base+'/api/map',{headers:{'x-csrf-token':csrf},data:{operation:'place_autofill',query:'x'}});assert.equal(invalid.status(),400);assert(invalid.headers()['cache-control'].includes('private'));
 await navigate('/admin/map');await page.getByRole('button',{name:'Save place',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'Add place',exact:true});await dialog.getByLabel('Name',{exact:true}).fill('Exumas');
 assert.equal(calls.length,0,'No searches while typing');await dialog.getByRole('button',{name:'Autofill place',exact:true}).click();
 let choices=page.getByRole('dialog',{name:'Matching places',exact:true});await expect(choices).toContainText('Area center');await snap('map-desktop-choices');
 assert.equal(state().places.length,0,'Lookup never saves a place');await choices.getByRole('button',{name:/^Exuma /}).click();
 await expect(dialog.getByLabel('Name',{exact:true})).toHaveValue('Exuma');await expect(dialog.getByLabel('Address',{exact:true})).toHaveValue('');await expect(dialog.getByLabel('City',{exact:true})).toHaveValue('Exuma');await expect(dialog.getByLabel('Latitude',{exact:true})).toHaveValue('23.441');await expect(dialog.getByRole('combobox',{name:'Address country',exact:true})).toContainText('BS');
 await dialog.getByRole('textbox',{name:'Notes',exact:true}).fill('Keep my private note');await dialog.getByRole('button',{name:'Save place',exact:true}).click();await expect(dialog).toHaveCount(0);
 assert.equal(state().places.length,1);assert.equal(state().places[0].countryCode,'BS');assert.equal(state().places[0].addressParts.street,'');
 await page.getByRole('button',{name:'Edit place',exact:true}).click();dialog=page.getByRole('dialog',{name:'Edit place',exact:true});
 await dialog.getByLabel('Name',{exact:true}).fill('Slow lookup');await dialog.getByRole('button',{name:'Autofill place',exact:true}).click();await expect.poll(()=>!!delayed).toBeTruthy();await dialog.getByLabel('Name',{exact:true}).fill('My newer draft');await delayed.fulfill({json:{ok:true,data:[tokyo]}}).catch(()=>{});await page.waitForTimeout(200);await expect(dialog.getByLabel('Name',{exact:true})).toHaveValue('My newer draft');await expect(dialog.getByLabel('Latitude',{exact:true})).toHaveValue('23.441');
 await dialog.getByLabel('Name',{exact:true}).fill('Lookup error');await dialog.getByRole('button',{name:'Autofill place',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('unavailable');await expect(dialog.getByRole('textbox',{name:'Notes',exact:true})).toHaveValue('Keep my private note');
 await dialog.getByLabel('Name',{exact:true}).fill('No results');await dialog.getByRole('button',{name:'Autofill place',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('No matches');
 await dialog.getByLabel('Name',{exact:true}).fill('Tokyo');await dialog.getByRole('button',{name:'Autofill place',exact:true}).click();await page.getByRole('dialog',{name:'Matching places',exact:true}).getByRole('button',{name:/^Tokyo /}).click();await expect(dialog.getByRole('combobox',{name:'Address country',exact:true})).toContainText('JP');await expect(dialog.getByRole('textbox',{name:'Notes',exact:true})).toHaveValue('Keep my private note');
 await dialog.getByRole('button',{name:'Close details',exact:true}).click();assert.equal(state().places[0].name,'Exuma','Cancel edit preserves saved place');
 await page.setViewportSize({width:390,height:844});await navigate('/admin/calendar');await page.getByRole('button',{name:'Add event',exact:true}).click();
 const event=page.getByRole('dialog',{name:'New event',exact:true});await event.getByRole('button',{name:'Create place',exact:true}).click();
 const create=page.getByRole('dialog',{name:'Create place',exact:true});await create.getByLabel('Place name',{exact:true}).fill('Bahamas');await create.getByRole('button',{name:'Autofill place',exact:true}).click();
 choices=page.getByRole('dialog',{name:'Matching places',exact:true});await expect(choices).toContainText('The Bahamas');
 const box=await choices.boundingBox();assert(box.x>=0&&box.x+box.width<=391,'Mobile lookup remains within viewport');await snap('calendar-mobile-choices');
 assert.equal(state().places.length,1);await choices.getByRole('button',{name:/^The Bahamas /}).click();await expect(create.getByLabel('Place name',{exact:true})).toHaveValue('The Bahamas');await expect(create.getByLabel('Address',{exact:true})).toHaveValue('');await expect(create.getByLabel('Latitude',{exact:true})).toHaveValue('24.7736546');await snap('calendar-mobile-filled');
 await create.getByRole('button',{name:'Create and link',exact:true}).click();await expect(create).toHaveCount(0);await expect(event.getByLabel('Address or meeting link',{exact:true})).toHaveValue('The Bahamas');
 assert.equal(state().places.length,2);assert.equal(state().places.find(p=>p.name==='The Bahamas').countryCode,'BS');assert.equal(state().events.length,0,'Creating a place never submits the event');
 await event.getByRole('button',{name:'Create place',exact:true}).click();await create.getByLabel('Place name',{exact:true}).fill('CVG custom name');
 await create.getByRole('combobox',{name:'Address country',exact:true}).click();await page.getByRole('option',{name:'Auto · worldwide',exact:true}).click();
 // Fill a US address normally and use coordinate-only action; the custom name stays.
 await create.getByLabel('Address',{exact:true}).fill('3087 Terminal Dr, Hebron, KY 41048');await expect(create.getByRole('combobox',{name:'Address country',exact:true})).toContainText('US');
 await create.getByRole('button',{name:'Autofill coordinates',exact:true}).click();await expect(create.getByLabel('Latitude',{exact:true})).toHaveValue('39.0499');await expect(create.getByLabel('Place name',{exact:true})).toHaveValue('CVG custom name');assert.equal(calls.at(-1).countryCode,'US');assert.equal(state().places.length,2);
 assert.deepEqual(errors,[]);console.log('PASS local WebKit: Map create/edit, worldwide name lookup, explicit choice, structured international fields, area labels, draft-only cancellation, stale/error/empty recovery, mobile Calendar create/link, coordinate-only name preservation, auth/CSRF and private responses.');
})().catch(async e=>{console.error(e);if(page){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'failure.txt'),await page.locator('body').innerText().catch(()=>''));}process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
