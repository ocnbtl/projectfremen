// All records and requests are isolated locally. No production browser requests.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {webkit,expect}=require('@playwright/test'),sharp=require('sharp');
const app=path.resolve(__dirname,'..'),out=path.join(app,'output','project-picture-rounding'),base='http://localhost:3248',secret='local-project-linked-pictures';fs.mkdirSync(out,{recursive:true});
const data=fs.mkdtempSync(path.join(os.tmpdir(),'project-links-'));
const server=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3248'],{cwd:app,env:{...process.env,ADMIN_PASSWORD:'test',ADMIN_SESSION_SECRET:secret,FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',RESEND_API_KEY:'',VERCEL:''},stdio:'ignore'});
let browser,page;
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await webkit.launch({executablePath:process.env.WEBKIT_EXECUTABLE});const context=await browser.newContext(),payload=`v1.${Date.now()+3600000}.qa`;
 await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'fixture-csrf',url:base}]);
 const headers={origin:base,'x-csrf-token':'fixture-csrf'},post=async(route,input)=>{const r=await context.request.post(base+route,{headers,data:input});assert(r.ok(),await r.text());return r.json();};
 let project=(await post('/api/projects',{operation:'create',family:'projects',input:{name:'Garden project',description:'A shared garden.',lifecycle:'active'}})).item;
 const photoPath='/api/projects/photos/'+project.id,ref={module:'projects',objectType:'project',objectId:project.id,label:project.name,route:'/admin/projects/'+project.id};
 const image=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="400" height="400" fill="#126d70"/><rect x="400" width="400" height="400" fill="#f2ad45"/></svg>')).png().toBuffer();
 const upload=await context.request.post(base+photoPath,{headers,multipart:{source:{name:'garden.png',mimeType:'image/png',buffer:image},crop:JSON.stringify({zoom:1.5,panX:-0.5,panY:0,outputSize:512})}});assert(upload.ok(),await upload.text());const photo=(await upload.json()).photo;
 const setPhoto=async stamp=>{const r=await context.request.patch(base+'/api/projects',{headers,data:{family:'projects',id:project.id,expectedUpdatedAt:project.updatedAt,patch:{photoUpdatedAt:stamp}}});assert(r.ok(),await r.text());project=(await r.json()).item;};await setPhoto(photo.updatedAt);
 await post('/api/personal/ops',{family:'goals',input:{title:'Plant the garden',outcome:'Create a welcoming courtyard.',domain:'Home',sourceRefs:[ref],linkedRefs:[]}});
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),tomorrow=new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 await post('/api/planning',{operation:'save',collection:'events',input:{title:'Garden planning',description:'Review planting together.',start:day,end:tomorrow,timeZone:'America/New_York',allDay:true,calendarId:'native',location:'',linkedRefs:[ref],recurrence:'',exceptions:{},reminderMinutes:0,kind:'event'}});
 const personResult=await post('/api/personal/records',{domain:'family',className:'person',title:'Local gardener',status:'active'}),person=personResult.items.find(x=>x.title==='Local gardener');
 const connection=await post('/api/projects',{operation:'create',family:'links',input:{projectId:project.id,source:{module:'people',objectType:'person',objectId:person.id,label:person.title,route:'/admin/people/'+person.id},relationship:'project_person'}});project=connection.project;
 const notice=await(await context.request.get(base+'/api/planning/notifications?zone=America/New_York')).json();assert.equal(notice.reminders.find(x=>x.title==='Garden planning').linkedRefs[0].preview.imageUrl,photoPath);
 const place=await post('/api/planning',{operation:'save',collection:'places',input:{name:'Garden courtyard',latitude:39,longitude:-84,address:'',notes:'',tags:[],linkedRefs:[ref]}});
 const planning=await(await context.request.get(base+'/api/planning')).json(),liveRef=planning.refs.find(r=>r.objectId===project.id);assert.equal(liveRef.preview.imageUrl,photoPath);assert.equal(liveRef.preview.imageUpdatedAt,photo.updatedAt);
 const picker=await(await context.request.get(base+'/api/native-links/previews?id='+project.id)).json();assert.equal(picker.items[0].imageUrl,photoPath);assert.equal(picker.items[0].updatedAt,photo.updatedAt);
 const savedPlace=planning.state.places.find(p=>p.name==='Garden courtyard'),related=await(await context.request.get(base+'/api/planning/related?module=map&type=place&id='+savedPlace.id)).json();assert.equal(related.items.find(x=>x.ref.objectId===project.id).ref.preview.imageUrl,photoPath);

 await post('/api/planning/tasks',{operation:'create',id:'task-'+crypto.randomUUID(),timeZone:'America/New_York',input:{title:'Prepare the garden',description:'Choose the planting layout.',kind:'task',start:'',end:'',allDay:true,calendarIds:['native'],linkedRefs:[ref]}});
 page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(/^https:\/\//,r=>r.abort());
 const selector='img[src*="/api/projects/photos/"]',checks=[];
 async function verify(locator,label){ await page.waitForTimeout(550);
  await expect(locator).toBeVisible();await expect.poll(()=>locator.evaluate(el=>el.complete&&el.naturalWidth===512)).toBe(true);
  const style=await locator.evaluate(el=>{const s=getComputedStyle(el),p=getComputedStyle(el.parentElement),b=el.getBoundingClientRect();return {radius:s.borderRadius,frame:p.borderRadius,fit:s.objectFit,background:s.backgroundColor,w:b.width,h:b.height};});
  assert.equal(style.radius,'22%',label+' image radius');assert.equal(style.fit,'contain',label+' crop preserved');assert.equal(style.background,'rgba(0, 0, 0, 0)',label+' transparent frame');assert(Math.abs(style.w-style.h)<1,label+' square image');
  // An opaque uploaded square must expose its surrounding surface at the corner.
  const pixels=await sharp(await locator.screenshot()).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const pixel=(x,y)=>[...pixels.data.subarray((y*pixels.info.width+x)*pixels.info.channels,(y*pixels.info.width+x)*pixels.info.channels+3)];
  assert.notDeepEqual(pixel(0,0),pixel(Math.floor(pixels.info.width/2),Math.floor(pixels.info.height/2)),label+' rendered rounded corner');
  checks.push({label,...style});
 }
 for(const width of [390,820,1440]){
  await page.setViewportSize({width,height:950});await page.goto(base+'/admin/projects');
  for(const view of ['comfortable','compact','grid']){
   const cycle=page.getByRole('button',{name:/^View:/});for(let i=0;i<3&&!(await cycle.getAttribute('aria-label')).toLowerCase().startsWith('view: '+view+'.');i++)await cycle.click();
   await page.waitForTimeout(500);await verify(page.locator(selector).first(),'projects '+view+' '+width);await page.screenshot({path:path.join(out,'projects-'+view+'-'+width+'.png'),animations:'disabled'});
  }
  await page.getByRole('button',{name:'Open Garden project',exact:true}).click();await verify(page.locator('.people-profile-photo-trigger img'),'project header '+width);await page.screenshot({path:path.join(out,'header-'+width+'.png'),animations:'disabled'});
  await page.goto(base+'/admin/personal');const task=page.getByRole('listitem').filter({has:page.getByText('Prepare the garden',{exact:true})});await verify(task.locator(selector),'task '+width);await task.getByRole('button',{name:'Preview Garden project',exact:true}).click();const preview=page.getByRole('dialog',{name:'Garden project',exact:true});await verify(preview.locator(selector),'task preview '+width);await page.getByRole('button',{name:'Close profile preview',exact:true}).click();
  await page.goto(base+'/admin/calendar');await page.getByRole('button',{name:'Garden planning',exact:true}).first().click();const event=page.getByRole('dialog',{name:'Garden planning',exact:true});await verify(event.locator(selector),'calendar '+width);await event.getByRole('button',{name:'Edit event',exact:true}).click();await verify(page.locator('.work-links '+selector),'calendar editor '+width);
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,checks},null,2));console.log('PASS: project pictures retain rounded transparent frames across Projects, Personal, Calendar and previews at 390, 820, 1440px.');
})().catch(async error=>{console.error(error);await page?.screenshot({path:path.join(out,'failure.png'),animations:'disabled'}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
