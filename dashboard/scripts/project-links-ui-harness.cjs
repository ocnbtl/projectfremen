// Local-only records and browser checks for Project links, profiles and recovery.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium,expect}=require('@playwright/test'),sharp=require('sharp');
const app=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'project-links-ui-')),out=path.join(app,'output/project-links-ui'),port=String(25000+crypto.randomInt(10000)),base='http://localhost:'+port,secret=crypto.randomBytes(24).toString('hex');
fs.mkdirSync(out,{recursive:true});
const server=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',port],{cwd:app,env:{...process.env,ADMIN_PASSWORD:'test',ADMIN_SESSION_SECRET:secret,FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',RESEND_API_KEY:'',VERCEL:''},stdio:'ignore'});
let browser,page;
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();const context=await browser.newContext(),payload='v1.'+(Date.now()+3600000)+'.qa',headers={origin:base,'x-csrf-token':'fixture-csrf'};
 await context.addCookies([{name:'admin_session',value:payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url'),url:base},{name:'admin_csrf',value:'fixture-csrf',url:base}]);
 const post=async(route,input)=>{const r=await context.request.post(base+route,{headers,data:input});assert(r.ok(),await r.text());return r.json();};
 const project=(await post('/api/projects',{operation:'create',family:'projects',input:{name:'Neighborhood studio',description:'Plan a shared studio with neighbors.',lifecycle:'active'}})).item;
 const person=(await post('/api/personal/records',{domain:'family',className:'person',title:'Jamie Fixture',status:'active'})).items.find(r=>r.title==='Jamie Fixture');
 const org=(await post('/api/personal/records',{domain:'notes-docs',className:'org',title:'Studio Cooperative',status:'active'})).items.find(r=>r.title==='Studio Cooperative');
 const note=(await post('/api/personal/records',{domain:'notes-docs',className:'note',title:'Workshop ideas',status:'active',summary:'Plan accessible entrances.'})).items.find(r=>r.title==='Workshop ideas');
 const resource=(await post('/api/personal/records',{domain:'notes-docs',className:'resource',title:'Access checklist',status:'active',url:'https://example.test/access'})).items.find(r=>r.title==='Access checklist');
 for(const record of [person,org]){
  const photoPath='/api/people/photos/'+record.id,buffer=await sharp({create:{width:128,height:128,channels:4,background:'#d48242'}}).png().toBuffer();
  const r=await context.request.post(base+photoPath,{headers,multipart:{source:{name:'profile.png',mimeType:'image/png',buffer},crop:JSON.stringify({zoom:1,panX:0,panY:0,outputSize:256})}});assert(r.ok(),await r.text());
  const photo=(await r.json()).photo;
  const updated=await context.request.patch(base+'/api/personal/records',{headers,data:{id:record.id,profile:{photoUrl:photo.url,photoUpdatedAt:photo.updatedAt}}});assert(updated.ok(),await updated.text());
 }
 const ref=(module,type,record)=>({module,objectType:type,objectId:record.id,label:record.title,route:'/admin/'+module+'/'+record.id});
 const link=async(source,relationship)=>post('/api/projects',{operation:'create',family:'links',input:{projectId:project.id,source,relationship}});
 await link(ref('people','person',person),'project_person');
 await link(ref('notes','note',note),'source_material');
 await link(ref('resources','resource',resource),'supporting_context');
 const source={module:'projects',objectType:'project',objectId:project.id,label:project.name,route:'/admin/projects/'+project.id};
 await post('/api/personal/ops',{family:'decisions',input:{title:'Choose workshop dates',question:'Which dates work for everyone?',domain:'Home',sourceRefs:[source],linkedRefs:[]}});
 page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:\/\//,r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const address=base+'/admin/projects/'+project.id+'?tab=links';
 await page.goto(address);await page.getByRole('button',{name:'Link organization',exact:true}).click();
 const form=page.getByRole('form',{name:'Link organization',exact:true});
 await form.getByRole('combobox',{name:'Organization',exact:true}).click();
 await expect(page.getByRole('option',{name:'Jamie Fixture',exact:true})).toHaveCount(0);
 await page.getByRole('option',{name:'Studio Cooperative',exact:true}).click();
 await form.getByRole('button',{name:'Save changes',exact:true}).click();await expect(form).toHaveCount(0);
 for(const width of [1440,820,390,320]){
  await page.setViewportSize({width,height:1000});await page.goto(address);
  for(const record of [person,org]){const img=page.locator('img[src*="'+record.id+'"]');await expect(img).toBeVisible();await expect.poll(()=>img.evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);}
  await expect(page.getByRole('heading',{name:'Organizations',exact:true})).toBeVisible();
  for(const [name,role] of [['People','module-people'],['Reviews','module-reviews'],['Files & resources','module-resources']])await expect(page.getByRole('heading',{name,exact:true}).locator('svg')).toHaveAttribute('data-icon-role',role);
  await expect(page.getByRole('button',{name:'Remove Access checklist link'}).locator('svg')).toHaveAttribute('data-icon-role','delete');
  if(width>760){const people=await page.getByRole('heading',{name:'People',exact:true}).boundingBox(),notes=await page.getByRole('heading',{name:'Notes',exact:true}).boundingBox();assert(Math.abs(people.y-notes.y)<3&&notes.x>people.x,'desktop links must align in two columns');}
  await expect(page.getByRole('link',{name:'Choose workshop dates',exact:false})).toBeVisible();
  await expect(page.getByText('No decision recorded yet.',{exact:true})).toHaveCount(0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'viewport overflow '+width);
  await page.screenshot({path:path.join(out,'links-'+width+'.png'),fullPage:true});
 }
 await page.getByRole('button',{name:'Remove Access checklist link'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Remove link',exact:true}).click();
 await page.locator('summary').filter({hasText:'Removed links'}).click();
 await expect(page.getByRole('button',{name:'Restore Access checklist link'})).toBeVisible();
 await page.getByRole('button',{name:'Restore Access checklist link'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Restore',exact:true}).click();
 await expect(page.getByRole('link',{name:'Access checklist',exact:false})).toBeVisible();
 assert(!errors.length,errors.join('\n'));
 console.log('PASS: Project people/org pictures, scoped organization picker, links/decision layout at desktop/tablet/phone, remove/restore and no browser errors.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(page&&process.exitCode)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});if(browser)await browser.close();server.kill();});
