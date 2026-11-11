const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),assert=require('assert/strict'),{spawn}=require('child_process');
const app=process.cwd(),base='http://localhost:3237',out=process.env.PROFILE_QA_OUTPUT||path.join(app,'output','profile-layout');fs.mkdirSync(out,{recursive:true});
const {chromium,webkit,expect}=require('@playwright/test');const secret='isolated-profile-layout',data=fs.mkdtempSync(path.join(os.tmpdir(),'fremen-profile-layout-'));let browser,page;
const server=spawn(process.execPath,[app+'/node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3237'],{cwd:app,env:{...process.env,ADMIN_PASSWORD:'test',ADMIN_SESSION_SECRET:secret,FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',RESEND_API_KEY:'',VERCEL:''},stdio:'ignore'});
(async()=>{for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await (process.env.WEBKIT_EXECUTABLE?webkit:chromium).launch({executablePath:process.env.WEBKIT_EXECUTABLE});const context=await browser.newContext({viewport:{width:1440,height:1000}}),payload=`v1.${Date.now()+3600000}.ui`;
 await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'local-test-token',url:base}]);
 const create=async input=>{const r=await context.request.post(base+'/api/personal/records',{headers:{'x-csrf-token':'local-test-token',origin:base},data:{domain:'family',status:'active',...input}});assert(r.ok(),await r.text());return (await r.json()).items.find(item=>item.title===input.title);};
 const org=await create({className:'org',title:'Cedar Studio',profile:{organizationType:'Business',industry:'Technology',context:'A local fixture organization.',headquarters:'Cincinnati, OH',foundedYear:'2005',teamSize:'10',primaryEmail:'hello@cedar.example',website:'https://cedar.example'}});
 const person=await create({className:'person',title:'Alex Example',subjects:['Friend'],profile:{nickname:'Al',primaryEmail:'alex@example.test',phoneNumber:'+15135550123',phoneCountryCode:'+1',instagram:'https://instagram.com/example',lifeDream:'Build a community art space.',birthday:'1994-06-18',lastContact:'2026-11-08',context:'A synthetic profile for checking readable fields and grouping.',notes:'Met through a shared project.',occupations:[{id:'job-1',title:'Design Director',status:'current',employer:org.title,organizationId:org.id},{id:'job-2',title:'Volunteer coordinator',status:'current',employer:'Community Arts'}],education:[{id:'edu-1',institution:'Example University',degree:'BA',fieldOfStudy:'Design'}],locations:[{id:'loc-1',label:'Home',location:'Cincinnati, OH',address:'123 Example Street'}],website:'https://example.test'}});
 for(let i=1;i<=6;i++){const response=await context.request.post(base+'/api/planning/tasks',{headers:{'x-csrf-token':'local-test-token',origin:base},data:{operation:'create',id:'task-'+crypto.randomUUID(),timeZone:'America/New_York',input:{title:'Profile task '+i,kind:'follow_up',description:'An isolated task fixture.',calendarIds:['native'],peopleIds:[person.id],start:'',end:'',allDay:true}}});assert(response.ok(),await response.text());}
 await create({className:'interaction',title:'Planning the art space',body:'Reviewed the next steps together.',interaction:{kind:'meeting',occurredOn:'2026-11-08',startTime:'14:00',endTime:'15:30',participantIds:[person.id,org.id],approach:'warm',updatesLastContact:false}});
 page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());const results=[];

 for(const width of [1440,390,320]) {
  await page.setViewportSize({width,height:850});
  for(const owner of [person,org]) {
   const target=owner.id===person.id?org:person;
   await page.goto(base+'/admin/people/'+owner.id);
   await expect(page.locator('.people-profile-title-line h2')).toContainText(owner.title);
   if(owner.id===person.id){const trigger=page.locator('.people-profile-subtitle').getByRole('button',{name:'Preview '+org.title,exact:true});await trigger.click();await expect(page.getByRole('dialog',{name:org.title,exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(trigger).toBeFocused();}
   const container=owner.id===person.id?page.getByRole('region',{name:'Work',exact:true}):page.getByRole('region',{name:'Organization people',exact:true});
   const triggers=container.getByRole('button',{name:'Preview '+target.title,exact:true});
   assert.equal(await triggers.count(),owner.id===person.id?2:1);
   for(let i=0;i<await triggers.count();i++) {
    const trigger=triggers.nth(i);await trigger.scrollIntoViewIfNeeded();const url=page.url(),scroll=await page.evaluate(()=>scrollY);
    await trigger.click();const preview=page.getByRole('dialog',{name:target.title,exact:true});await expect(preview).toBeVisible();await page.waitForTimeout(250);
    assert.equal(page.url(),url);await expect(page.locator('.people-profile-title-line h2')).toContainText(owner.title);
    await expect(preview).toContainText(target.id===org.id?'Cincinnati':'Design Director');
    const box=await preview.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=850,'Preview inside viewport');
    if(i===0)await page.screenshot({path:path.join(out,'preview-'+owner.className+'-'+width+'.png')});
    await preview.getByRole('button',{name:'Close profile preview'}).click();await expect(preview).toBeHidden();assert(Math.abs(await page.evaluate(()=>scrollY)-scroll)<3,'Scroll retained');await expect(trigger).toBeFocused();
   }
   await page.getByRole('tab',{name:'Links',exact:true}).click();await page.getByRole('searchbox',{name:'Search linked objects'}).fill(target.title);
   const linked=page.getByRole('region',{name:owner.title+' links',exact:true}).getByRole('button',{name:'Preview '+target.title,exact:true}).first();await linked.click();await expect(page.getByRole('dialog',{name:target.title,exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('searchbox',{name:'Search linked objects'})).toHaveValue(target.title);await expect(page.getByRole('tab',{name:'Links',exact:true})).toHaveAttribute('aria-selected','true');
   await linked.click();await page.getByRole('dialog',{name:target.title,exact:true}).getByRole('button',{name:'Open profile',exact:true}).click();await expect(page.locator('.people-profile-title-line h2')).toContainText(target.title);await expect(page.getByRole('dialog')).toHaveCount(0);
   results.push({width,owner:owner.className});
  }
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log('PASS previews for both profile types at 1440, 390, 320; avatar/name triggers; viewport bounds; close/Escape; focus, scroll, tab and search preserved; explicit Open profile.');
})().catch(async e=>{console.error(e);await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
