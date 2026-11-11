const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),assert=require('assert/strict'),{spawn}=require('child_process');
const app=process.cwd(),base='http://localhost:3237',out=process.env.PROFILE_QA_OUTPUT||path.join(app,'output','profile-layout');fs.mkdirSync(out,{recursive:true});
const {chromium,webkit,expect}=require('@playwright/test');const secret='isolated-profile-layout',data=fs.mkdtempSync(path.join(os.tmpdir(),'fremen-profile-layout-'));let browser,page;
const server=spawn(process.execPath,[app+'/node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3237'],{cwd:app,env:{...process.env,ADMIN_PASSWORD:'test',ADMIN_SESSION_SECRET:secret,FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',RESEND_API_KEY:'',VERCEL:''},stdio:'ignore'});
(async()=>{for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await (process.env.WEBKIT_EXECUTABLE?webkit:chromium).launch({executablePath:process.env.WEBKIT_EXECUTABLE});const context=await browser.newContext({viewport:{width:1440,height:1000}}),payload=`v1.${Date.now()+3600000}.ui`;
 await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'local-test-token',url:base}]);
 const create=async input=>{const r=await context.request.post(base+'/api/personal/records',{headers:{'x-csrf-token':'local-test-token',origin:base},data:{domain:'family',status:'active',...input}});assert(r.ok(),await r.text());return (await r.json()).items.find(item=>item.title===input.title);};
 const org=await create({className:'org',title:'Cedar Studio',profile:{organizationType:'Business',industry:'Technology',context:'A local fixture organization.',headquarters:'Cincinnati, OH',foundedYear:'2005',teamSize:'10',primaryEmail:'hello@cedar.example',website:'https://cedar.example'}});
 const photo=await require('sharp')({create:{width:64,height:64,channels:4,background:'#a34413'}}).png().toBuffer();const uploaded=await context.request.post(base+'/api/people/photos/'+org.id,{headers:{'x-csrf-token':'local-test-token',origin:base},multipart:{photo:{name:'fixture.png',mimeType:'image/png',buffer:photo}}});assert(uploaded.ok(),await uploaded.text());const photoInfo=(await uploaded.json()).photo;const assigned=await context.request.patch(base+'/api/personal/records',{headers:{'x-csrf-token':'local-test-token',origin:base},data:{id:org.id,expectedUpdatedAt:org.updatedAt,profile:{...org.profile,photoUrl:photoInfo.url,photoUpdatedAt:photoInfo.updatedAt}}});assert(assigned.ok(),await assigned.text());
 const person=await create({className:'person',title:'Alex Example',subjects:['Friend'],profile:{nickname:'Al',primaryEmail:'alex@example.test',phoneNumber:'+15135550123',phoneCountryCode:'+1',instagram:'https://instagram.com/example',lifeDream:'Build a community art space.',birthday:'1994-06-18',lastContact:'2026-11-08',context:'A synthetic profile for checking readable fields and grouping.',notes:'Met through a shared project.',occupations:[{id:'job-1',title:'Design Director',status:'current',employer:org.title,organizationId:org.id},{id:'job-2',title:'Volunteer coordinator',status:'current',employer:'Community Arts'}],education:[{id:'edu-1',institution:'Example University',degree:'BA',fieldOfStudy:'Design'}],locations:[{id:'loc-1',label:'Home',location:'Cincinnati, OH',address:'123 Example Street'}],website:'https://example.test'}});

 for(let i=0;i<18;i++){await create({className:'person',title:'Aaa '+String(i).padStart(2,'0'),profile:{context:'Local filler'}});await create({className:'org',title:'Aaa Studio '+String(i).padStart(2,'0'),profile:{context:'Local filler'}});}
 page=await context.newPage();const errors=[];let phase='navigation';page.on('pageerror',e=>errors.push({phase,message:e.message}));await page.route('https://**/*',r=>r.abort());const results=[];
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:850});
  for(const owner of [person,org]){
   const target=owner.id===person.id?org:person;
   for(const view of ['list','compact','grid']){
    const sidebar=owner.id===person.id?'all':'organizations';
    phase='navigation';await page.goto(base+'/admin/people?view='+view+'&sidebar='+sidebar+'&filter=active');
    const card=page.locator('[data-record-id="'+owner.id+'"]');await expect(card).toBeVisible();await page.waitForLoadState('networkidle');phase='preview';
    if(view==='compact'&&owner.id===person.id){assert.equal(await card.locator('.people-employer-picture').count(),0,'Compact keeps its existing occupation-free layout');continue;}
    const trigger=card.getByRole('button',{name:'Preview '+target.title,exact:true});await trigger.scrollIntoViewIfNeeded();await page.waitForTimeout(200);
    const url=page.url(),scroll=await page.evaluate(()=>scrollY);await trigger.click();const preview=page.getByRole('dialog',{name:target.title,exact:true});await expect(preview).toBeVisible();await page.waitForTimeout(250);assert.equal(page.url(),url,'Preview must not open card');
    const box=await preview.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=850,'Preview contained');await expect(card).toBeVisible();
    if(owner.id===person.id)await expect(preview.locator('img')).toBeVisible();
    await page.screenshot({path:path.join(out,'card-'+owner.className+'-'+view+'-'+width+'.png')});
    await preview.getByRole('button',{name:'Close profile preview'}).click();await expect(preview).toBeHidden();await expect(trigger).toBeFocused();assert.equal(page.url(),url);assert(Math.abs(await page.evaluate(()=>scrollY)-scroll)<3,'Scroll retained');
    const search=page.getByRole('searchbox',{name:'Search people',exact:true});await search.fill(owner.title);await expect(page.locator('.people-directory-row')).toHaveCount(1);await trigger.click();await page.keyboard.press('Escape');await expect(preview).toBeHidden();await expect(search).toHaveValue(owner.title);assert(new URL(page.url()).searchParams.get('filter')==='active','Filter retained');assert(new URL(page.url()).searchParams.get('view')===view||view==='list','View retained');
    phase='navigation';await trigger.click();await preview.getByRole('button',{name:'Open profile',exact:true}).click();await expect(page.locator('.people-profile-title-line h2')).toContainText(target.title);await page.waitForLoadState('networkidle');
    results.push({width,owner:owner.className,view,scroll});
   }
  }
 }
 assert.deepEqual(errors.filter(error=>error.phase==='preview'),[]);fs.writeFileSync(path.join(out,'navigation-diagnostics.json'),JSON.stringify(errors,null,2));fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log('PASS',results.length,'card preview cases: image load, click isolation, viewport containment, scroll/focus/search/filter/view retention, explicit navigation; compact People layout preserved.');
})().catch(async e=>{console.error(e);await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
