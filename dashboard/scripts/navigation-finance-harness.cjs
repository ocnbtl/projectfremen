const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),assert=require('assert/strict');
const {spawn}=require('child_process');const app=path.resolve(__dirname,'..');const {webkit,expect}=require(path.join(app,'node_modules/@playwright/test'));
const data=fs.mkdtempSync(path.join(os.tmpdir(),'finance-ui-'));const output=path.join(app,'output/navigation-finance');fs.mkdirSync(output,{recursive:true});
const today=new Date().toISOString().slice(0,10);const common={createdAt:today+'T12:00:00Z',updatedAt:today+'T12:00:00Z',createdBy:'fixture',currency:'USD',entityScope:'personal'};
const state={schemaVersion:1,updatedAt:null,accounts:['Everyday Checking','Emergency Savings','Travel Savings','Household Checking'].map((name,i)=>({...common,id:'account-'+i,name,kind:i%2?'Savings':'Checking',institution:'Fixture Bank',mask:'100'+i,currentBalance:1234.56*(i+1),balanceAsOf:today,balanceSource:'manual'})),transactions:Array.from({length:6},(_,i)=>({...common,id:'transaction-'+i,occurredOn:today,merchant:['Market & pantry','Monthly salary','Bookshop','Transit pass','Dinner with friends','Utility payment'][i],accountId:'account-'+(i%4),category:i===1?'Salary':i%2?'Utilities':'Food',amount:i===1?4200:24.95*(i+1),direction:i===1?'income':'expense',memo:'Fixture only',status:i===0?'pending':'cleared',reviewed:i>1,reimbursable:false,source:{kind:'manual'}})),bills:Array.from({length:4},(_,i)=>({...common,id:'bill-'+i,name:['Internet plan','Rent','Music subscription','Insurance'][i],amount:[59.99,1400,10.99,85][i],dueDate:today,status:'due',accountId:'account-'+i,category:i===1?'Housing':'Subscriptions',recurring:'monthly',autopay:i===2,autopayConfirmed:false})),budgets:[],rules:[],closePeriods:[],savingsMovements:[],transfers:[],auditEvents:[],importBatches:[],importPreviews:[],idempotency:[]};

state.transactions=Array.from({length:65},(_,i)=>({...state.transactions[i%6],id:'transaction-'+i,merchant:['Google','Retell AI','Vercel','Discord','Elevate Smoke Shop'][i%5],direction:i%13===12?'income':'expense',category:i%13===12?'Salary':i%3===0?'Food and drink restaurants':i%3===1?'General services other general services':'Unbudgeted purchases',occurredOn:new Date(Date.now()-(i<5?0:i%20)*86400000).toISOString().slice(0,10),status:'cleared',amount:i%13===12?800:10+i,reviewed:true}));
const additionalBrands=[['7 Brew Coffee','https://7brew.com','7-brew.png'],['Allstate','https://www.allstate.com','allstate.svg'],['Canva','https://www.canva.com','canva.svg'],["Jimmy Johnâ€™s",'https://www.jimmyjohns.com','jimmy-johns.png']];
additionalBrands.forEach(([merchant],index)=>{state.transactions[index+5].merchant=merchant;});
state.budgets=[{...common,id:'budget-food',category:'Dining & takeout',categoryGroup:'Dining & takeout',limit:300,period:today.slice(0,7)},{...common,id:'budget-software',category:'General services other general services',limit:250,period:today.slice(0,7)}];
fs.writeFileSync(path.join(data,'finance.json'),JSON.stringify(state));const before=fs.readFileSync(path.join(data,'finance.json'),'utf8');
const port=String(20000+crypto.randomInt(30000)),base='http://localhost:'+port,secret=crypto.randomBytes(24).toString('hex');
const server=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',port],{cwd:app,env:{...process.env,ADMIN_PASSWORD:'test',ADMIN_SESSION_SECRET:secret,FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',RESEND_API_KEY:'',VERCEL:'',PLAID_SECRET:'',COINBASE_API_KEY:''},stdio:['ignore','pipe','pipe']});
const ready=new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(new Error('Local server timeout')),15000);timer.unref();server.stdout.on('data',b=>{text+=b;if(text.includes('Ready in')){clearTimeout(timer);resolve();}});server.stderr.on('data',()=>{});server.once('error',reject);server.once('exit',code=>reject(new Error('Local server exit '+code)));});let browser;

(async()=>{
 await ready;browser=await webkit.launch({executablePath:process.env.WEBKIT_EXECUTABLE});const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const payload='v1.'+(Date.now()+3600000)+'.qa';await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base}]);await context.route(/^https:\/\//,r=>r.abort());
 const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/finance')&&r.method()!=='GET')writes.push(r.url());});
 for(const width of [320,390,820,1440,3440]){
  await page.setViewportSize({width,height:1000});await page.goto(base+'/admin/finance');await expect(page.locator('.finance-spending-breakdown li')).toHaveCount(3);await page.waitForTimeout(1200);
  const panel=page.locator('.finance-spending-breakdown');await panel.scrollIntoViewIfNeeded();
  const cards=panel.locator('li > button');
  for(const card of await cards.all())assert(await card.evaluate(e=>parseFloat(getComputedStyle(e).borderTopWidth)>=1&&parseFloat(getComputedStyle(e).borderRadius)>=10),'Category has a defined boundary');
  await expect(panel).toContainText('Shared budget');await expect(panel).toContainText('No budget set');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No page overflow '+width);
  await page.screenshot({path:path.join(output,'categories-'+width+'.png')});
  await cards.first().click();await expect(cards.first()).toHaveAttribute('aria-pressed','true');await expect(page.locator('#finance-inspector')).toBeVisible();
  await page.getByRole('button',{name:'Return to Finance list'}).click();
 }
 assert.deepEqual(errors.filter(e=>!e.includes('ResizeObserver loop')),[]);assert.deepEqual(writes,[]);assert.equal(fs.readFileSync(path.join(data,'finance.json'),'utf8'),before,'Financial data unchanged');
 console.log('PASS category separation, budget states, drilldown, responsive widths 320–3440; financial fixture unchanged and no Finance writes.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
