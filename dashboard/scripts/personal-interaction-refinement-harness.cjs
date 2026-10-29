// Local synthetic records only. Production services and outbound browser requests are disabled.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const app=path.resolve(__dirname,'..'),out=path.join(app,'output','personal-interaction-refinement'),base='http://localhost:3246',secret='isolated-personal-interaction';fs.mkdirSync(out,{recursive:true});
const {chromium,expect}=require('@playwright/test'),data=fs.mkdtempSync(path.join(os.tmpdir(),'personal-interaction-'));
const server=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3246'],{cwd:app,env:{...process.env,ADMIN_PASSWORD:'test',ADMIN_SESSION_SECRET:secret,FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',RESEND_API_KEY:'',VERCEL:''},stdio:'ignore'});
let browser,page;
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();const context=await browser.newContext(),payload=`v1.${Date.now()+3600000}.qa`;
 await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'fixture-csrf',url:base}]);
 const headers={origin:base,'x-csrf-token':'fixture-csrf'},post=async(route,input)=>{const r=await context.request.post(base+route,{headers,data:input});assert(r.ok(),await r.text());return r.json();};
 const photo='/api/people/photos/personal-'+crypto.randomUUID(),create=async(className,title)=>{const r=await post('/api/personal/records',{domain:'family',className,title,status:'active',body:'Synthetic profile for local verification.',profile:{photoUrl:photo,photoUpdatedAt:'2026-10-29T12:00:00Z'}});return r.items.find(item=>item.title===title);};
 const person=await create('person','Alex Example'),org=await create('org','Example Studio');
 for(const kind of ['person','org'])for(let i=0;i<5;i++)await create(kind,`${kind==='person'?'Person':'Studio'} ${i}`);
 const refs=[{module:'people',objectType:'person',objectId:person.id,label:person.title,route:'/admin/people?person='+person.id},{module:'people',objectType:'organization',objectId:org.id,label:org.title,route:'/admin/people?organization='+org.id}];
 await post('/api/personal/ops',{family:'goals',input:{title:'Practice a new language',outcome:'Hold a conversation with confidence.',domain:'Learning',sourceRefs:refs,linkedRefs:refs,dueAt:'2026-12-01T12:00:00Z'}});
 await post('/api/personal/ops',{family:'decisions',input:{title:'Choose a course',question:'Which schedule fits?',linkedRefs:[refs[1]]}});
 await post('/api/personal/life',{collection:'lists',input:{title:'Reading list',kind:'watchlist',description:'Fiction and reference books',columns:[{id:'name',label:'Title',type:'text'}],rows:[],items:[]}});
 await post('/api/personal/life',{collection:'buildItems',input:{name:'Trail boots',category:'Footwear',status:'researching',targetDate:'2026-11-01',budget:'150',notes:'Compare fit and materials.'}});
 await post('/api/personal/life',{collection:'vehicles',input:{name:'Daily car',make:'Honda',model:'Civic',year:'2022',trim:'',status:'current',vinNote:'',notes:'Local fixture',modifications:[]}});
 for(const [kind,date,notes] of [['walk','2026-10-28T18:00:00Z','Evening park'],['feed','2026-10-28T12:00:00Z','Breakfast'],['walk','2026-10-27T16:00:00Z','River path']])await post('/api/personal/dog',{input:{kind,occurredAt:date,peed:kind==='walk',pooped:false,notes}});
 page=await context.newPage();const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/'))requests.push(r.url());});
 await page.route('https://**/*',r=>r.abort());await page.route('**/api/people/photos/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#306b87"/></svg>'}));
 const shot=async(name,width)=>{await page.waitForTimeout(220);assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),name+' page overflow '+width);await page.screenshot({path:path.join(out,`${name}-${width}.png`)});};
 if(!process.env.PERSONAL_FORMS_ONLY) for(const width of [1440,2560,820,390,320]){
  await page.setViewportSize({width,height:width<600?900:1000});await page.goto(base+'/admin/personal');
  const goal=page.locator('article').filter({has:page.getByRole('button',{name:'Open Practice a new language',exact:true})});await goal.waitFor();
  assert.equal(await goal.locator('[data-profile-preview]').count(),2);assert.equal(await goal.locator('time svg').count(),2);
  assert.equal(await page.getByRole('link',{name:'Travel',exact:true}).count(),0);
  const before=page.url();await goal.getByRole('button',{name:'Preview Alex Example',exact:true}).click();await page.getByRole('link',{name:'Open profile',exact:true}).waitFor();assert.equal(page.url(),before);await shot('profile-preview',width);await page.keyboard.press('Escape');await expect(goal.getByRole('button',{name:'Preview Alex Example',exact:true})).toBeFocused();
  assert(!requests.some(url=>url.includes('/api/planning/related')),'preview should not fetch per card');
  const rects=await goal.evaluate(el=>Object.fromEntries(['personalCardTop','personalCardOpen','personalCardMeta'].map(key=>[key,el.querySelector(`[class*="${key}"]`).getBoundingClientRect().top])));assert(rects.personalCardTop<rects.personalCardOpen&&rects.personalCardOpen<rects.personalCardMeta);await shot('personal',width);
  if(width===2560)continue;
  for(const route of ['lists','personal-build','car','passwords','dog','style-guide']){
   await page.goto(base+'/admin/personal/'+route);await page.locator('.workspace-topnav').waitFor();await page.getByRole('searchbox').first().waitFor();await shot(route,width);
   if(['lists','personal-build','car'].includes(route)){
    if(width<=900)await page.getByRole('button',{name:'Personal actions',exact:true}).click();
    await page.getByRole('button',{name:route==='lists'?'New list':route==='car'?'Add vehicle':'Add item',exact:true}).click();await page.getByRole('dialog').waitFor();await shot(route+'-editor',width);assert(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.getByRole('button',{name:'Close editor',exact:true}).click();
   }
   if(route==='dog'){assert.equal(await page.locator('[class*="careDay"]').count(),2);await page.getByRole('searchbox').fill('River');assert.equal(await page.locator('[class*="careDay"]').count(),1);await page.getByText('River path',{exact:true}).waitFor();}
   if(route==='style-guide'){await page.getByRole('searchbox').fill('typography');await expect(page.locator('#typography')).toBeVisible();await expect(page.locator('#colors')).toBeHidden();}
  }
  await page.goto(base+'/admin/people');if(width<=900)await page.getByRole('button',{name:'People actions',exact:true}).click();await page.getByRole('button',{name:'Log interaction',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Log interaction',exact:true});await dialog.waitFor();
  const start=dialog.getByRole('textbox',{name:'Start Time',exact:true}),end=dialog.getByRole('textbox',{name:'End Time',exact:true});
  await start.fill('2:15 pm');await start.press('Tab');await expect(end).toHaveValue('3:15 pm');await end.fill('5:45 pm');await end.press('Tab');await expect(start).toHaveValue('2:15 pm');await expect(end).toHaveValue('5:45 pm');await end.fill('2:30 pm');await end.press('Tab');await expect(start).toHaveValue('2:15 pm');
  await dialog.getByRole('searchbox',{name:'Search people',exact:true}).fill('Alex');assert.equal(await dialog.locator('.people-participant-box').first().locator('.people-participant-scroll label').count(),1);
  assert(await dialog.getByRole('radio',{name:'Unspecified',exact:true}).evaluate(el=>el.scrollWidth<=el.clientWidth));await shot('interaction',width);await dialog.locator('.people-participant-box').nth(1).getByRole('searchbox').fill('Example');await dialog.locator('.people-participant-scroll label').filter({hasText:'Example Studio'}).locator('input').check();await dialog.getByRole('button',{name:'Choose end time',exact:true}).click();await page.getByRole('group',{name:'End Time hour',exact:true}).waitFor();await page.keyboard.press('Escape');await dialog.getByRole('button',{name:'Close interaction composer',exact:true}).click();
 }
 // Exercise the revised dialogs against isolated persistence, preserving seeded records.
 await page.setViewportSize({width:390,height:900});
 for(const [route,button,fields] of [['lists','New list',{Title:'Garden supplies'}],['car','Add vehicle',{'Build name':'Weekend car',Year:'2024',Make:'Example',Model:'Tourer'}],['personal-build','Add item',{Item:'Rain jacket',Category:'Outerwear'}]]){
  await page.goto(base+'/admin/personal/'+route);await page.getByRole('button',{name:'Personal actions',exact:true}).click();await page.getByRole('button',{name:button,exact:true}).click();const form=page.getByRole('dialog');
  for(const [name,value] of Object.entries(fields))await form.getByRole('textbox',{name,exact:true}).fill(value);
  await form.getByRole('button',{name:'Save',exact:true}).click();await form.waitFor({state:'hidden'});await page.reload();
 }
 const life=await(await context.request.get(base+'/api/personal/life')).json();
 assert(life.state.lists.some(item=>item.title==='Garden supplies'));assert(life.state.lists.some(item=>item.title==='Reading list'));
 assert(life.state.vehicles.some(item=>item.name==='Weekend car'&&item.make==='Example'));assert(life.state.vehicles.some(item=>item.name==='Daily car'&&item.make==='Honda'));
 assert(life.state.buildItems.some(item=>item.name==='Rain jacket'));assert(life.state.buildItems.some(item=>item.name==='Trail boots'));
 for(const kind of ['hired','service','introduction','interview']){
  const result=await post('/api/personal/records',{domain:'notes-docs',className:'interaction',title:'Type check '+kind,status:'completed',interaction:{kind,occurredOn:'2026-10-29',participantIds:[person.id],startTime:'09:00',endTime:'11:00',updatesLastContact:false}});
  assert.equal(result.items.find(item=>item.title==='Type check '+kind).interaction.kind,kind);
 }
 // Save a deliberately longer interaction, then verify the native stored range and new kind.
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/admin/people');await page.getByRole('button',{name:'Log interaction',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Log interaction'});
 await dialog.getByLabel('Title',{exact:true}).fill('Hire a local specialist');await dialog.getByRole('combobox').click();await page.getByRole('option',{name:'Hired',exact:true}).click();
 await dialog.getByRole('textbox',{name:'Start Time',exact:true}).fill('10 am');await dialog.getByRole('textbox',{name:'Start Time',exact:true}).press('Tab');await dialog.getByRole('textbox',{name:'End Time',exact:true}).fill('1:30 pm');await dialog.getByRole('textbox',{name:'End Time',exact:true}).press('Tab');
 await dialog.locator('.people-participant-scroll label').filter({hasText:'Alex Example'}).locator('input').check();await dialog.getByRole('button',{name:'Save interaction',exact:true}).click();await dialog.waitFor({state:'hidden'});
 const saved=await(await context.request.get(base+'/api/personal/records')).json(),entry=saved.items.find(item=>item.title==='Hire a local specialist');assert.equal(entry.interaction.startTime,'10:00');assert.equal(entry.interaction.endTime,'13:30');assert.equal(entry.interaction.kind,'hired');
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,process.env.PERSONAL_FORMS_ONLY?'results-forms.json':'results.json'),JSON.stringify({passed:true,mode:process.env.PERSONAL_FORMS_ONLY?'persistence':'responsive and persistence',widths:process.env.PERSONAL_FORMS_ONLY?[390,1440]:[320,390,820,1440,2560],checks:['profile preview preserves route and focus','linked references and dates above title','types and status at bottom','Travel entry removed without record deletion','search on utility pages','Dog day groups and filtering','editor responsive layouts','Approach bounds','standalone searchable participant cards','start suggestion and independent longer/shorter end','new Hired type persisted','no page errors']},null,2));console.log('PASS: Personal and interaction refinements, isolated local records only.');
})().catch(async e=>{console.error(e);await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
