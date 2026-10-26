const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{chromium}=require('@playwright/test');
const app=path.resolve(__dirname,'..'),base='http://localhost:3237',secret='organization-map-fixture',data=fs.mkdtempSync(path.join(os.tmpdir(),'organization-map-'));
const out=process.env.CONTROL_QA_OUTPUT||data;
const server=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3237'],{cwd:app,env:{...process.env,ADMIN_PASSWORD:'fixture',ADMIN_SESSION_SECRET:secret,FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',RESEND_API_KEY:'',VERCEL:''},stdio:'ignore'});
const place=(id,name,tags)=>({id,name,tags,address:'Test address',notes:'',latitude:39,longitude:-84,linkedRefs:[],createdAt:'2026-10-26',updatedAt:'2026-10-26'});
const snapshot={ok:true,state:{schemaVersion:1,places:[place('airport','CVG',['Travel']),place('nature','Nature Center',['Organization']),place('area','Tokyo',['Area'])],calendars:[],events:[],connections:[],savedViews:[],reminders:[]},placeOrganizations:{airport:[{label:'Airport authority',organizationType:'Government',industry:'Transportation',hasProfileLocation:true}],nature:[{label:'Nature Center',organizationType:'Nonprofit',industry:'Environment',hasProfileLocation:true}],area:[{label:'Honda',organizationType:'Business',industry:'Manufacturing',hasProfileLocation:true}]},refs:[],trips:[],dated:[],sourceErrors:[],capabilities:{morgen:false,routing:false}};
let browser;
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true});
 for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport}),p=`v1.${Date.now()+600000}.${crypto.randomBytes(12).toString('base64url')}`;
  await context.addCookies([{name:'admin_session',value:p+'.'+crypto.createHmac('sha256',secret).update(p).digest('base64url'),url:base}]);
  await context.route('**/api/planning',r=>r.fulfill({json:snapshot}));
  await context.route('**/api/planning/places',r=>r.fulfill({json:{ok:true,result:{remaining:0,conflicts:0}}}));
  const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/admin/map',{waitUntil:'domcontentloaded'});
  const filter=page.getByRole('button',{name:'Filter',exact:true});await filter.click();
  const choose=async(label,value)=>{await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:value,exact:true}).click();};
  await choose('Organization type','Government');await choose('Industry','Transportation');
  assert.equal(await filter.getAttribute('aria-pressed'),'true');
  await page.screenshot({path:path.join(out,'organization-map-filter-'+name+'.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Saved places',exact:true}).click();
  const directory=page.getByRole('dialog',{name:'Saved places'});
  await directory.getByText('1 place',{exact:true}).waitFor();assert(await directory.getByText('CVG',{exact:true}).isVisible());assert.equal(await directory.getByText('Tokyo',{exact:true}).count(),0);
  await page.keyboard.press('Escape');await filter.click();await page.getByRole('button',{name:'Reset filters',exact:true}).click();
  assert.equal(await page.getByRole('combobox',{name:'Organization type',exact:true}).getAttribute('data-value'),'');assert.equal(await page.getByRole('combobox',{name:'Industry',exact:true}).getAttribute('data-value'),'');
  await page.getByRole('combobox',{name:'Industry',exact:true}).click();assert.equal(await page.getByRole('option',{name:'Manufacturing',exact:true}).count(),0,'Tokyo must not inherit Honda classification');await page.keyboard.press('Escape');
  await choose('Sort','Industry');await page.keyboard.press('Escape');await page.getByRole('button',{name:'Saved places',exact:true}).click();await directory.getByText('3 places',{exact:true}).waitFor();
  await page.screenshot({path:path.join(out,'organization-map-places-'+name+'.png')});assert.deepEqual(errors,[]);console.log(name+': searchable facets, combined filtering, reset, sorting and area isolation PASS');await context.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill();});
