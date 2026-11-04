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
 // The two end caps of this wide, padded logo disappear under the old square crop.
 const image=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="840" height="360"><rect width="840" height="360" fill="#fff"/><path fill="#e51a19" d="M46 106h170v148H46z"/><path fill="#225ec6" d="M216 106h408v148H216z"/><path fill="#18b451" d="M624 106h170v148H624z"/></svg>')).png().toBuffer();
 await page.locator('.people-photo-dialog input[type=file]').first().setInputFiles({name:'garden.png',mimeType:'image/png',buffer:image});await page.getByRole('button',{name:'Remove solid background'}).click();await page.getByRole('button',{name:'Restore original background'}).waitFor();await page.getByRole('button',{name:'Save picture',exact:true}).click();await page.locator('.people-photo-dialog').waitFor({state:'hidden'});
 await expect.poll(async()=>Boolean((await read()).photoUpdatedAt)).toBe(true);
 const firstImage=await context.request.get(base+photoPath);assert.equal(firstImage.status(),200);assert.equal((await context.request.get(base+photoPath,{headers:{'if-none-match':firstImage.headers().etag}})).status(),304);
 const backgroundAlpha=async response=>{const {data,info}=await sharp(await response.body()).ensureAlpha().raw().toBuffer({resolveWithObject:true});return data[(Math.floor(info.height/2)*info.width+2)*4+3];};
 assert.equal(await backgroundAlpha(firstImage),0,'pasted matte becomes transparent');
 const preservedSource=(await(await context.request.get(base+photoPath+'?edit=1')).json()).source;
 const legacy=(await post({family:'projects',input:{name:'Legacy wide mark',description:'Previous upload format'}})).item;
 const oldPath=base+'/api/projects/photos/'+legacy.id;
 const oldUpload=await context.request.post(oldPath,{headers,multipart:{source:{name:'legacy.png',mimeType:'image/png',buffer:image},crop:JSON.stringify({zoom:1,panX:0,panY:0,outputSize:512})}});assert(oldUpload.ok(),await oldUpload.text());
 const oldDisplay=await context.request.get(oldPath);
 const {data:legacyPixels,info:legacySize}=await sharp(await oldDisplay.body()).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const cap=x=>Array.from(legacyPixels.subarray((256*legacySize.width+x)*4,(256*legacySize.width+x)*4+4));
 assert(cap(55)[0]>180&&cap(55)[1]<60&&cap(457)[1]>140&&cap(457)[0]<55,'previously pasted default logo recovers both ends');
 assert.equal((await(await context.request.get(oldPath+'?edit=1')).json()).crop.fit,'contain');
 assert.equal((await context.request.get(oldPath,{headers:{'if-none-match':oldDisplay.headers().etag}})).status(),304);
 const checkLogo=async frame=>{
  const img=frame.locator('img');await expect.poll(()=>img.evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);
  const painted=await img.evaluate((el)=>{const result=[];for(let n=el;n;n=n.parentElement){const s=getComputedStyle(n);result.push([s.backgroundColor,s.backgroundImage]);if(n.matches('button,.resource-card-picture'))break;}return result;});
  for(const [color,background] of painted){assert.equal(color,'rgba(0, 0, 0, 0)','logo frame should not paint a disc');assert.equal(background,'none');}
  const {data:rgb,info}=await sharp(await frame.screenshot({animations:'disabled'})).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let left=info.width,right=-1;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*info.channels,[r,g,b]=rgb.subarray(i,i+3);if(r>160&&g<65&&b<65)left=Math.min(left,x);if(g>115&&r<65&&b<115)right=Math.max(right,x);}
  assert((right-left)/info.width>.78,'both ends should fill the slot without clipping');
  assert(Math.abs(left-(info.width-1-right))<info.width*.1,'mark should be horizontally centered');
 };
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:950});await page.goto(base+'/admin/projects');await page.getByRole('searchbox').fill('Community garden');
  const row=page.getByRole('listitem',{name:'Community garden',exact:true});await checkLogo(row.locator('.resource-card-picture'));
  await row.click();await page.mouse.move(0,0);await checkLogo(photoButton());
 }
 await photoButton().click();await page.getByRole('button',{name:/Adjust crop/}).click();await page.getByRole('button',{name:'Restore original background'}).click();await page.getByRole('button',{name:'Remove solid background'}).waitFor();await page.getByRole('button',{name:'Save picture',exact:true}).click();await page.locator('.people-photo-dialog').waitFor({state:'hidden'});
 assert.equal(await backgroundAlpha(await context.request.get(base+photoPath)),255,'original backdrop is restorable');
 assert.equal((await(await context.request.get(base+photoPath+'?edit=1')).json()).source,preservedSource,'original source is unchanged');
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


