const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),assert=require('assert/strict');
const {spawn}=require('child_process');const app=path.resolve(__dirname,'..');const {webkit,expect}=require(path.join(app,'node_modules/@playwright/test'));
const data=fs.mkdtempSync(path.join(os.tmpdir(),'finance-ui-'));const output=path.join(app,'output/finance-overview-refinement');fs.mkdirSync(output,{recursive:true});
const today=new Date().toISOString().slice(0,10);const common={createdAt:today+'T12:00:00Z',updatedAt:today+'T12:00:00Z',createdBy:'fixture',currency:'USD',entityScope:'personal'};
const state={schemaVersion:1,updatedAt:null,accounts:['Everyday Checking','Emergency Savings','Travel Savings','Household Checking'].map((name,i)=>({...common,id:'account-'+i,name,kind:i%2?'Savings':'Checking',institution:'Fixture Bank',mask:'100'+i,currentBalance:1234.56*(i+1),balanceAsOf:today,balanceSource:'manual'})),transactions:Array.from({length:6},(_,i)=>({...common,id:'transaction-'+i,occurredOn:today,merchant:['Market & pantry','Monthly salary','Bookshop','Transit pass','Dinner with friends','Utility payment'][i],accountId:'account-'+(i%4),category:i===1?'Salary':i%2?'Utilities':'Food',amount:i===1?4200:24.95*(i+1),direction:i===1?'income':'expense',memo:'Fixture only',status:i===0?'pending':'cleared',reviewed:i>1,reimbursable:false,source:{kind:'manual'}})),bills:Array.from({length:4},(_,i)=>({...common,id:'bill-'+i,name:['Internet plan','Rent','Music subscription','Insurance'][i],amount:[59.99,1400,10.99,85][i],dueDate:today,status:'due',accountId:'account-'+i,category:i===1?'Housing':'Subscriptions',recurring:'monthly',autopay:i===2,autopayConfirmed:false})),budgets:[],rules:[],closePeriods:[],savingsMovements:[],transfers:[],auditEvents:[],importBatches:[],importPreviews:[],idempotency:[]};

state.transactions=Array.from({length:65},(_,i)=>({...state.transactions[i%6],id:'transaction-'+i,merchant:['Google','Retell AI','Vercel','Discord','Elevate Smoke Shop'][i%5],direction:i%13===12?'income':'expense',category:i%13===12?'Salary':i%3===0?'Food and drink restaurants':i%3===1?'General services other general services':'Unbudgeted purchases',occurredOn:new Date(Date.now()-(i<5?0:i%20)*86400000).toISOString().slice(0,10),status:'cleared',amount:i%13===12?800:10+i,reviewed:true}));
const additionalBrands=[['7 Brew Coffee','https://7brew.com','7-brew.png'],['Allstate','https://www.allstate.com','allstate.svg'],['Canva','https://www.canva.com','canva.svg'],["Jimmy John’s",'https://www.jimmyjohns.com','jimmy-johns.png']];
additionalBrands.forEach(([merchant],index)=>{state.transactions[index+5].merchant=merchant;});
state.budgets=[{...common,id:'budget-food',category:'Dining & takeout',categoryGroup:'Dining & takeout',limit:300,period:today.slice(0,7)},{...common,id:'budget-software',category:'General services other general services',limit:250,period:today.slice(0,7)}];
fs.writeFileSync(path.join(data,'finance.json'),JSON.stringify(state));const before=fs.readFileSync(path.join(data,'finance.json'),'utf8');
const port=String(20000+crypto.randomInt(30000)),base='http://localhost:'+port,secret=crypto.randomBytes(24).toString('hex');
const server=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',port],{cwd:app,env:{...process.env,ADMIN_PASSWORD:'test',ADMIN_SESSION_SECRET:secret,FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',RESEND_API_KEY:'',VERCEL:'',PLAID_SECRET:'',COINBASE_API_KEY:''},stdio:['ignore','pipe','pipe']});
const ready=new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(new Error('Local server timeout')),15000);timer.unref();server.stdout.on('data',b=>{text+=b;if(text.includes('Ready in')){clearTimeout(timer);resolve();}});server.stderr.on('data',()=>{});server.once('error',reject);server.once('exit',code=>reject(new Error('Local server exit '+code)));});let browser;
(async()=>{
 await ready;browser=await webkit.launch({executablePath:process.env.WEBKIT_EXECUTABLE});const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}});
 const payload='v1.'+(Date.now()+3600000)+'.qa',csrf=crypto.randomBytes(24).toString('hex');await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:csrf,url:base}]);await context.route(/^https:\/\//,r=>r.abort());
 const page=await context.newPage();globalThis.qaPage=page;page.setDefaultTimeout(10000);const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/finance')&&r.method()!=='GET')writes.push(r.url());});
 const headers={'x-csrf-token':csrf};
 for(const [i,[name,website]] of [['Google','https://about.google/'],['Retell AI','https://www.retellai.com/'],['Vercel','https://vercel.com/'],['Discord','https://discord.com/'],...additionalBrands].entries()){
  const response=await context.request.post(base+'/api/personal/records',{headers,data:{domain:'notes-docs',className:'org',title:name,profile:{fullName:name,organizationType:'Business',industry:'Technology',website},body:'Synthetic local logo fixture'}});assert.equal(response.status(),200);const org=(await response.json()).items.find(r=>r.title===name);
  const linked=await context.request.post(base+'/api/native-links',{headers,data:{source:{module:'finance',objectType:'transaction',objectId:'transaction-'+(i<4?i:i+1),label:name,route:'/admin/finance/transactions?selected=transaction-'+(i<4?i:i+1)},target:{module:'people',objectType:'organization',objectId:org.id,label:name,route:'/admin/people/'+org.id},relationship:'merchant'}});assert.equal(linked.status(),201);
 }
 const snap=async name=>{await page.waitForTimeout(400);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow '+name);await page.screenshot({path:path.join(output,name+'.png')});};
 await page.goto(base+'/admin/finance?view=overview');await expect(page.getByRole('heading',{name:'Income & spending'})).toBeVisible();await page.waitForTimeout(2500);
 await expect(page.locator('.finance-focus-queue>article>button:first-child')).toHaveCount(65);
 for(const file of ['google.png','retell.svg','vercel.svg','discord.svg']){const img=page.locator('.finance-focus-queue img[src="/finance-logos/'+file+'"]').first();await expect(img).toBeVisible();assert(await img.evaluate(i=>i.complete&&i.naturalWidth>0),'Loaded '+file);assert.equal(await img.evaluate(i=>getComputedStyle(i.parentElement).backgroundColor),'rgba(0, 0, 0, 0)');}
 for(const [,,file] of additionalBrands){const img=page.locator('.finance-focus-queue img[src="/finance-logos/'+file+'"]').first();await img.locator('xpath=ancestor::button[1]').evaluate(b=>b.scrollIntoView({block:'center'}));await expect.poll(()=>img.evaluate(i=>i.complete&&i.naturalWidth>0),{message:'Visible merchant mark '+file}).toBe(true);}
 assert.equal(await page.locator('.finance-focus-queue>article>button:first-child').filter({hasText:'Elevate Smoke Shop'}).first().locator('[data-brand-mark=true]').count(),0);
 await expect(page.locator('.finance-spending-breakdown')).toContainText('Shared budget');await expect(page.locator('.finance-spending-breakdown')).toContainText('No budget set');
 const a=await page.locator('.finance-recent-transactions').boundingBox(),b=await page.locator('.finance-spending-breakdown').boundingBox();console.log('panel bounds',a,b);assert(Math.abs(a.y+a.height-b.y-b.height)<3,'Recent panel bottom aligns with spending');
 const queue=page.locator('.finance-focus-queue');assert(await queue.evaluate(q=>q.scrollHeight>q.clientHeight),'Recent activity scrolls');
 const periodToggle=page.getByRole('button',{name:'Period table',exact:true});
 await expect(periodToggle).toHaveAttribute('aria-expanded','false');await periodToggle.click();await expect(periodToggle).toHaveAttribute('aria-expanded','true');await expect(page.locator('.finance-chart-table table')).toBeVisible();await periodToggle.click();await expect(page.locator('.finance-chart-table table')).toBeHidden();
 const inspector=page.locator('#finance-inspector');
 await page.getByRole('button',{name:'View income transactions'}).click();await expect(inspector.getByRole('button',{name:'Filter to income'})).toHaveAttribute('aria-pressed','true');
 await expect(inspector.locator('[data-direction=income]')).toHaveCount(5);await expect(inspector.locator('[data-direction=expense]')).toHaveCount(0);
 await inspector.getByRole('button',{name:'Filter to spending'}).click();await expect(inspector.locator('[data-direction=income]')).toHaveCount(0);await expect(inspector.locator('[data-direction=expense]')).toHaveCount(40);
 await inspector.locator('button:has([data-direction=expense])').first().click();await inspector.getByRole('button',{name:'Back to transactions'}).click();await expect(inspector.getByRole('button',{name:'Filter to spending'})).toHaveAttribute('aria-pressed','true');
 await inspector.getByRole('button',{name:'Filter to spending'}).click();await expect(inspector).toContainText('65 transactions');await page.getByRole('button',{name:'Return to Finance list'}).click();
 await expect(queue.locator('[data-direction=expense]')).toHaveCount(60);
 await snap('overview-desktop');await queue.evaluate(q=>q.scrollTop=q.scrollHeight);assert(await queue.evaluate(q=>q.scrollTop>0));await queue.evaluate(q=>q.scrollTop=0);
 await page.getByRole('button',{name:'7 days',exact:true}).click();await expect(page.getByRole('button',{name:'7 days',exact:true})).toHaveAttribute('aria-pressed','true');await page.waitForTimeout(350);
 const dates=await page.getByRole('button',{name:'Edit chart date range'}).textContent();await page.getByRole('button',{name:'Custom',exact:true}).click();await expect(page.getByRole('button',{name:'From date',exact:true})).toBeVisible();assert.equal(await page.getByRole('button',{name:'Edit chart date range'}).textContent(),dates,'Custom preserves displayed range');await expect(page.getByRole('button',{name:'From date',exact:true})).toHaveCount(1);
 await page.getByRole('button',{name:'From date',exact:true}).click();await page.getByLabel('Type from date',{exact:true}).fill(today);await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'From date',exact:true})).toBeVisible();await snap('date-range-desktop');await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('button',{name:'Edit chart date range'}).click();await expect(page.getByRole('button',{name:'From date'})).toBeVisible();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'90 days',exact:true}).click();await page.waitForTimeout(400);await page.locator('.finance-spending-breakdown').scrollIntoViewIfNeeded();await page.getByRole('combobox',{name:'Sort spending categories'}).click();await page.getByRole('option',{name:'Category A–Z',exact:true}).click();await snap('categories-desktop');
 await page.getByRole('button',{name:'View transactions in this range'}).click();await expect(page.locator('#finance-inspector')).toContainText('Transactions in range');await snap('range-details-desktop');await page.locator('#finance-inspector button').filter({hasText:'Google'}).first().click();await expect(page.getByRole('button',{name:'Open transaction',exact:true})).toBeVisible();await snap('selected-transaction');await page.getByRole('button',{name:'Return to Finance list'}).click();await expect(page.getByRole('heading',{name:'Income & spending'})).toBeVisible();
 for(const width of [3440,820,390,320]){await page.setViewportSize({width,height:width>1000?1100:844});await page.waitForTimeout(500);await snap('overview-'+width);await page.locator('.finance-spending-breakdown').scrollIntoViewIfNeeded();await snap('categories-'+width);const collisions=await page.locator('.finance-spending-breakdown li>button').evaluateAll(bs=>bs.filter(b=>{const s=b.querySelectorAll(':scope>span'),a=s[1].getBoundingClientRect(),r=document.createRange();r.selectNodeContents(s[0].querySelector('strong'));return [...r.getClientRects()].some(r=>r.right>a.left-3);}).map(b=>b.textContent));assert.deepEqual(collisions,[],'Category overlap '+width);}
 await page.getByRole('button',{name:'Filter chart',exact:true}).click();
 for (const [label,option] of [['Chart account','All accounts'],['Chart category','All categories'],['Chart budget','All budgets'],['Chart transaction direction','Income & spending'],['Chart transaction status','Posted only']]) {
   await page.getByRole('combobox',{name:label,exact:true}).click();const item=page.getByRole('option',{name:option,exact:true});
   await expect(item).toBeVisible();const rect=await item.boundingBox();assert(rect.x>=0&&rect.x+rect.width<=321,'Visible option at narrow width: '+label);await item.click();await expect(page.locator('.app-select-menu')).toHaveCount(0);
 }
 await page.getByRole('combobox',{name:'Chart account',exact:true}).click();await page.getByRole('option',{name:'Emergency Savings',exact:true}).click();
 await expect(page.locator('.finance-filter-caption')).toContainText('Emergency Savings');await page.getByRole('button',{name:'Reset chart filters'}).click();await expect(queue.locator('article')).toHaveCount(65);
 await snap('chart-filter-mobile');
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Custom',exact:true}).click();await expect(page.getByRole('button',{name:'From date',exact:true})).toBeVisible();await snap('date-range-mobile');await page.getByRole('button',{name:'From date',exact:true}).click();await expect(page.getByLabel('Type from date',{exact:true})).toBeVisible();await snap('nested-date-mobile');await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'View transactions in this range'}).click();await snap('range-details-mobile');await page.getByRole('button',{name:'Return to Finance list'}).click();
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'30 days',exact:true}).click();await expect(page.getByRole('button',{name:'30 days',exact:true})).toHaveAttribute('aria-pressed','true');await snap('reduced-motion');
 await page.getByRole('searchbox').first().fill('No matching merchant fixture');await expect(page.getByText('No matching transactions',{exact:true})).toBeVisible();await snap('empty-state');
 await page.setViewportSize({width:1440,height:900});await page.mouse.move(0,0);await page.goto(base+'/admin/finance/accounts');await page.waitForLoadState('networkidle');await expect(page.getByRole('button',{name:/accounts view:/i})).toBeVisible();
 const accountCard=page.locator('[data-finance-account-id="account-0"]');await accountCard.hover({position:{x:35,y:25}});await expect(page.getByRole('tooltip')).toContainText('Latest transaction');await expect(page.getByRole('tooltip')).toContainText('Everyday Checking');
 await page.keyboard.press('Escape');await expect(page.getByRole('tooltip')).toBeHidden();await page.mouse.move(0,0);await page.keyboard.press('Tab');await accountCard.focus();await expect(page.getByRole('tooltip')).toContainText('Balance source');await page.keyboard.press('Escape');await expect(page.getByRole('tooltip')).toBeHidden();await accountCard.click();
 for(const tab of ['Overview','Transactions','Reconcile','Transfers']){
   const control=page.getByRole('tab',{name:tab,exact:true});await control.click();await expect(control).toHaveAttribute('aria-selected','true');
   const panel=page.locator('#finance-object-tabs-panel-'+tab.toLowerCase());await expect(panel).toBeVisible();
   if(tab==='Transactions'){await expect(panel).toContainText('Google');await expect(panel.locator('img[src="/finance-logos/google.png"]').first()).toBeVisible();}
   if(tab==='Transfers'){await expect(panel.getByRole('button',{name:'Record transfer'})).toBeVisible();}
   await snap('account-'+tab.toLowerCase());
 }
 await page.setViewportSize({width:390,height:844});await page.getByRole('tab',{name:'Transactions',exact:true}).click();await snap('account-ledger-mobile');
 // Exercise real touch events with an authenticated, local-only phone context.
 const phone=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',storageState:await context.storageState()});
 await phone.route(/^https:\/\//,r=>r.abort());
 const mobile=await phone.newPage();globalThis.qaPage=mobile;mobile.on('pageerror',e=>errors.push(e.message));mobile.on('request',r=>{if(r.url().includes('/api/finance')&&r.method()!=='GET')writes.push(r.url());});
 await mobile.goto(base+'/admin/finance/transactions?query=Google');await mobile.waitForLoadState('networkidle');await mobile.waitForURL(url=>url.searchParams.has('selected'));
 const tx=state.transactions.find(t=>t.id==='transaction-40'),acct=state.accounts.find(a=>a.id===tx.accountId);
 const row=mobile.locator('[data-finance-transaction-id="'+tx.id+'"]'),trigger=row.getByRole('button',{name:'Preview account: '+acct.name,exact:true});
 await trigger.scrollIntoViewIfNeeded();const beforeY=await trigger.evaluate(el=>el.getBoundingClientRect().top),beforeURL=mobile.url();
 await trigger.tap();const preview=mobile.getByRole('dialog',{name:acct.name,exact:true});
 await expect(preview).toBeVisible();await expect(preview).toContainText('Current balance');await expect(preview).toContainText(acct.currentBalance.toLocaleString('en-US',{style:'currency',currency:'USD'}));
 await expect(preview.locator('li')).toHaveCount(3);const recent=state.transactions.filter(t=>t.accountId===acct.id).sort((a,b)=>b.occurredOn.localeCompare(a.occurredOn)||a.id.localeCompare(b.id)).slice(0,3);for(const [i,t] of recent.entries())await expect(preview.locator('li').nth(i)).toContainText(t.merchant);
 const action=preview.getByRole('link',{name:'View full account'});await expect(action).toHaveAttribute('href','/admin/finance/accounts?selected='+acct.id);
 const bounds=await action.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=390&&bounds.height>=44,'Account action fits phone');
 await mobile.screenshot({path:path.join(output,'transaction-account-preview-phone.png')});
 const previewRequests=[];
 const watchPreview=r=>{if(new URL(r.url()).pathname.startsWith('/api/'))previewRequests.push(r.method()+' '+new URL(r.url()).pathname);};
 mobile.on('request',watchPreview);
 for(const [index,activity] of recent.entries()){
   const button=preview.locator('li').nth(index).getByRole('button');
   await button.scrollIntoViewIfNeeded();
   const previewScroll=await preview.evaluate(el=>el.scrollTop);
   if(index===1){await button.focus();await mobile.keyboard.press('Enter');}
   else await button.tap();
   const transactionPreview=mobile.getByRole('dialog',{name:activity.merchant,exact:true});
   const back=transactionPreview.getByRole('button',{name:'Back to account',exact:true});
   await expect(back).toBeFocused();
   await expect(back.locator('svg')).toHaveAttribute('data-icon-role','back');
   const signed=(activity.direction==='expense'?'-':'+')+activity.amount.toLocaleString('en-US',{style:'currency',currency:'USD'});
   for(const value of [signed,activity.category,activity.memo,acct.name,activity.status==='cleared'?'Posted':'Pending'])await expect(transactionPreview).toContainText(value);
   assert.equal(mobile.url(),beforeURL,'Transaction detail preserves route and selected record');
   if(index===0)await mobile.screenshot({path:path.join(output,'transaction-account-activity-phone.png'),animations:'disabled'});
   if(index===1)await mobile.keyboard.press('Escape');
   else await back.tap();
   await expect(preview).toBeVisible();await expect(button).toBeFocused();
   assert(Math.abs(await preview.evaluate(el=>el.scrollTop)-previewScroll)<=2,'Back preserves account activity scroll');
 }
 mobile.off('request',watchPreview);assert.deepEqual(previewRequests,[],'Preview navigation uses loaded records');
 await preview.getByRole('button',{name:'Close account preview'}).tap();await expect(preview).toBeHidden();assert.equal(mobile.url(),beforeURL);await expect(mobile.getByRole('searchbox').first()).toHaveValue('Google');
 await expect(trigger).toBeFocused();assert(Math.abs(beforeY-await trigger.evaluate(el=>el.getBoundingClientRect().top))<=2,'Closing preview preserves transaction scroll');
 await row.getByRole('button',{name:/^Inspect /}).tap();const detail=mobile.locator('#finance-inspector');
 const inspectorTrigger=detail.getByRole('button',{name:'Preview account: '+acct.name}).last();
 await mobile.emulateMedia({reducedMotion:'reduce'});
 await inspectorTrigger.tap();await expect(preview).toBeVisible();
 await preview.locator('li').last().getByRole('button').tap();
 const nested=mobile.getByRole('dialog',{name:recent[2].merchant,exact:true});
 await expect(nested.getByRole('button',{name:'Back to account'})).toBeFocused();
 assert.equal(await nested.locator('dl').evaluate(list=>getComputedStyle(list.parentElement).animationName),'none','Reduced-motion detail is immediate');
 await mobile.keyboard.press('Escape');await expect(preview.locator('li').last().getByRole('button')).toBeFocused();
 await mobile.keyboard.press('Escape');await expect(preview).toBeHidden();await expect(detail).toBeVisible();await expect(inspectorTrigger).toBeFocused();
 await detail.getByRole('button',{name:'Preview account: '+acct.name}).last().tap();await action.tap();await expect(mobile.locator('#finance-inspector').getByRole('heading',{name:acct.name,exact:true})).toBeVisible();assert.equal(new URL(mobile.url()).searchParams.get('selected'),acct.id);
 await phone.close();globalThis.qaPage=page;
 assert.deepEqual(errors.filter(e=>!e.includes('ResizeObserver loop')),[]);assert.deepEqual(writes,[]);assert.equal(fs.readFileSync(path.join(data,'finance.json'),'utf8'),before,'Financial data unchanged');console.log('PASS overview, budgets, transparent official marks, no-logo fallback, recent scroll/alignment, shared custom date editor, sorting, drilldown/return, 320/390/820/1440/3440 widths, reduced motion and empty state; no Finance writes.');
})().catch(async e=>{await globalThis.qaPage?.screenshot({path:path.join(output,'failure.png')});console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
