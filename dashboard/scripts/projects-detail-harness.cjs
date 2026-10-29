// Isolated, local-only project UI and picture regression checks.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium,expect}=require('@playwright/test'),sharp=require('sharp');
const app=path.resolve(__dirname,'..'),out=path.join(app,'output','projects-detail'),base='http://localhost:3247',secret='local-project-detail';fs.mkdirSync(out,{recursive:true});
const data=fs.mkdtempSync(path.join(os.tmpdir(),'projects-detail-'));
const server=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3247'],{cwd:app,env:{...process.env,ADMIN_PASSWORD:'test',ADMIN_SESSION_SECRET:secret,FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',RESEND_API_KEY:'',VERCEL:''},stdio:'ignore'});
let browser,page;
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();const context=await browser.newContext(),payload=`v1.${Date.now()+3600000}.qa`;
 await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'fixture-csrf',url:base}]);
 const headers={origin:base,'x-csrf-token':'fixture-csrf'},post=async(input)=>{const r=await context.request.post(base+'/api/projects',{headers,data:{operation:"create",...input}});assert(r.ok(),await r.text());return r.json();};
 const project=(await post({family:'projects',input:{name:'Community garden',description:'Turn an unused courtyard into a welcoming garden. Coordinate planting, volunteers, and a small opening day.',lifecycle:'active',objectives:[{text:'Agree a planting plan',completed:true},{text:'Invite the neighborhood',targetAt:'2026-12-12'}]}})).item;
 const untouched=(await post({family:'projects',input:{name:'Untouched reference',description:'Must remain unchanged'}})).item;
 const read=async (id=project.id)=>(await(await context.request.get(base+'/api/projects?family=projects&id='+id)).json()).item;
 await post({family:'milestones',input:{projectId:project.id,title:'First planting day',dueAt:'2026-12-12',completionCriteria:['Plants in place']}});
 const photoPath='/api/projects/photos/'+project.id;
 assert.equal((await fetch(base+photoPath)).status,401);
 assert.equal((await context.request.post(base+photoPath)).status(),403);
 assert.equal((await context.request.get(base+'/api/projects/photos/not-a-project')).status(),404);
 page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(/^https:\/\//,r=>r.abort());
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/admin/projects');await page.getByRole('searchbox').fill('Community garden');await page.getByRole('button',{name:'Open Community garden',exact:true}).click();
 const photoButton=()=>page.getByRole('button',{name:/profile picture for Community garden/});await photoButton().click();
 const image=await sharp({create:{width:700,height:500,channels:3,background:'#527e51'}}).png().toBuffer();
 await page.locator('.people-photo-dialog input[type=file]').first().setInputFiles({name:'garden.png',mimeType:'image/png',buffer:image});await page.getByRole('button',{name:'Save picture',exact:true}).click();await page.locator('.people-photo-dialog').waitFor({state:'hidden'});
 await expect.poll(async()=>Boolean((await read()).photoUpdatedAt)).toBe(true);
 const firstImage=await context.request.get(base+photoPath);assert.equal(firstImage.status(),200);assert.equal((await context.request.get(base+photoPath,{headers:{'if-none-match':firstImage.headers().etag}})).status(),304);
 await photoButton().click();await page.getByRole('button',{name:/Adjust crop/}).click();await page.locator('.people-photo-editor').waitFor();const zoom=page.locator('.people-photo-editor input[type=range]').first();await zoom.fill('1.5');await page.getByRole('button',{name:'Save picture',exact:true}).click();await page.locator('.people-photo-dialog').waitFor({state:'hidden'});
 const edit=(await(await context.request.get(base+photoPath+'?edit=1')).json());assert.equal(edit.crop.zoom,1.5);assert(edit.source.startsWith('data:image/'));
 const stale=await context.request.patch(base+photoPath,{headers,data:{crop:{zoom:1,panX:0,panY:0,outputSize:512},expectedUpdatedAt:'2000-01-01T00:00:00Z'}});assert.equal(stale.status(),409);
 // Objective updates must retain previously completed objectives and unrelated records.
 const objective=page.getByRole('textbox',{name:'Objective',exact:true}).nth(1);await objective.fill('Invite neighbors and volunteers');await objective.press('Tab');await expect.poll(async()=>(await read()).objectives[1].text).toBe('Invite neighbors and volunteers');assert((await read()).objectives[0].completedAt);
 await page.getByRole('button',{name:'Add objective',exact:true}).click();await page.getByRole('textbox',{name:'Objective',exact:true}).last().fill('Order garden tools');await page.getByRole('textbox',{name:'Objective',exact:true}).last().press('Tab');await expect.poll(async()=>(await read()).objectives.length).toBe(3);
 assert.deepEqual(await read(untouched.id),untouched);
 for(const width of [320,390,820,1440,2560]){
  await page.setViewportSize({width,height:1000});await page.goto(base+'/admin/projects/'+project.id);await page.getByRole('heading',{name:'Community garden',exact:true}).waitFor();await page.getByRole('button',{name:'Add objective',exact:true}).waitFor();
  await page.screenshot({path:path.join(out,'overview-'+width+'.png'),fullPage:true,animations:"disabled"});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow '+width);
  const add=await page.getByRole('button',{name:'Add objective',exact:true}).boundingBox();assert(add.width<230,'Add objective stretched');
  const picture=page.locator('[class*="projectIdentity"] img');await expect(picture).toBeVisible();assert(await picture.evaluate(el=>el.complete&&el.naturalWidth>0));
  for(const tab of ['Activity','Links','Properties']){await page.getByRole('tab',{name:tab,exact:true}).click();await expect(page.getByRole('tab',{name:tab,exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByRole('tabpanel')).toBeVisible();await page.evaluate(async()=>{await Promise.race([Promise.all(document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))),new Promise(resolve=>setTimeout(resolve,650))]);});await page.screenshot({path:path.join(out,tab.toLowerCase()+'-'+width+'.png'),fullPage:true,animations:"disabled"});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'tab overflow '+tab+' '+width);}
 }
 await page.setViewportSize({width:390,height:1000});await page.goto(base+'/admin/projects/'+project.id);await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByRole('textbox',{name:'Description',exact:true}).fill('A shared garden with neighbors.');await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect.poll(async()=>(await read()).description).toBe('A shared garden with neighbors.');
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,widths:[320,390,820,1440,2560],checks:['overview and all detail tabs','upload and adjust existing crop','picture persists across reload and viewports','private image authorization and CSRF','conditional image caching','stale crop conflict','objectives preserve completion and unrelated project','content bounds and compact add action','no page errors']},null,2));console.log('PASS: local project detail and picture regression.');
})().catch(async error=>{console.error(error);await page?.screenshot({path:path.join(out,'failure.png'),fullPage:true,animations:"disabled"}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});


