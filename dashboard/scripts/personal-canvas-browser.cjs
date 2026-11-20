/* Local, authenticated browser checks. All source files and boards are synthetic. */
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto");
const {spawn}=require("node:child_process"),{webkit,expect}=require("@playwright/test"),sharp=require("sharp");
const app=path.resolve(__dirname,".."), data=fs.mkdtempSync(path.join(os.tmpdir(),"canvas-browser-"));
const port=24000+crypto.randomInt(10000),base="http://localhost:"+port,secret=crypto.randomUUID(),csrf=crypto.randomUUID();
const server=spawn(process.execPath,[path.join(app,"node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{
  cwd:app,env:{...process.env,FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:"false",SUPABASE_URL:"",SUPABASE_SERVICE_ROLE_KEY:"",VERCEL:"",ADMIN_PASSWORD:"fixture",ADMIN_SESSION_SECRET:secret},stdio:["ignore","pipe","pipe"]});
const ready=new Promise((res,rej)=>{server.stdout.on("data",b=>{if(String(b).includes("Ready in"))res()});server.once("error",rej);server.once("exit",c=>rej(Error("Local server exited "+c)));});
const output=path.join(app,"output/canvas");fs.mkdirSync(output,{recursive:true});
let browser,page;
async function main(){
 await ready;
 browser=await webkit.launch({executablePath:process.env.WEBKIT_EXECUTABLE});
 const context=await browser.newContext({viewport:{width:1440,height:960},serviceWorkers:"block"});
 context.setDefaultTimeout(12000);
 await context.route(/^https:\/\//,r=>r.abort());
 const stamp="v1."+(Date.now()+3600000)+".canvasqa";
 await context.addCookies([{name:"admin_session",value:stamp+"."+crypto.createHmac("sha256",secret).update(stamp).digest("base64url"),url:base},{name:"admin_csrf",value:csrf,url:base}]);
 page=await context.newPage();page.setDefaultTimeout(12000);
 const errors=[];page.on("pageerror",e=>{if(!e.message.includes("ResizeObserver loop"))errors.push(e.message)});
 const btn=name=>page.getByRole("button",{name,exact:true});
 await page.goto(base+"/admin/personal/canvas");await btn("New board").click();
 await page.getByLabel("Board name",{exact:true}).fill("Ad inspiration");
 await page.getByLabel("Folder",{exact:true}).fill("Creative");await btn("Create board").click();
 await expect(page.getByRole("heading",{name:"Ad inspiration"})).toBeVisible();
 await btn("Add sticky note").click();await page.getByLabel("Title",{exact:true}).fill("Art direction");await page.getByLabel("Text",{exact:true}).fill("Compare the headline treatments");await btn("Apply").click();
 const boardId=new URL(page.url()).searchParams.get("board");
 async function board(){return (await (await context.request.get(base+"/api/personal/canvas?id="+boardId)).json()).board;}
 await expect.poll(async()=>(await board()).nodes.length).toBe(1);
 const first=(await board()).nodes[0],node=page.locator('.react-flow__node[data-id="'+first.id+'"]');
 const box=await node.boundingBox();await page.mouse.move(box.x+30,box.y+30);await page.mouse.down();await page.mouse.move(box.x+145,box.y+100,{steps:10});await page.mouse.up();
 await expect.poll(async()=>Math.round((await board()).nodes[0].x)).not.toBe(Math.round(first.x));
 await btn("Undo").click();await expect.poll(async()=>Math.round((await board()).nodes[0].x)).toBe(Math.round(first.x));
 await btn("Redo").click();
 await node.click({position:{x:26,y:24}});const handle=await node.locator(".react-flow__resize-control.handle.bottom.right").boundingBox();
 assert(handle);await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+65,handle.y+26,{steps:8});await page.mouse.up();
 await expect.poll(async()=>(await board()).nodes[0].width).toBeGreaterThan(first.width+20);
 await btn("Undo").click();await expect.poll(async()=>(await board()).nodes[0].width).toBe(first.width);
 await btn("Add text").click();await page.getByLabel("Title",{exact:true}).fill("Brief");await btn("Apply").click();
 await btn("Arrange cards in a grid").click();await page.waitForTimeout(450);
 await node.click({position:{x:20,y:20}});await btn("Connect to another card").click();
 await page.locator(".react-flow__node").filter({hasText:"Brief"}).click();
 await page.getByLabel("Label",{exact:true}).fill("Inspired by");
 await page.getByRole("combobox",{name:"Line",exact:true}).click();await page.getByRole("option",{name:"Dashed"}).click();
 await page.getByRole("combobox",{name:"Endpoint",exact:true}).click();await page.getByRole("option",{name:"Circle"}).click();
 await btn("Apply").click();await expect.poll(async()=>(await board()).edges[0]?.style).toBe("dashed");
 await btn("Saved views").click();await page.getByLabel("View name").fill("Brief and direction");await btn("Save current view").click();await btn("Close panel").click();
 const files=await Promise.all(Array.from({length:40},async(_,i)=>({name:"Ad "+String(i+1).padStart(2,"0")+".png",mimeType:"image/png",buffer:await sharp({create:{width:i===38?1080:i===39?1600:240,height:i===38?1350:i===39?900:240,channels:3,background:{r:80+i*3,g:60+i*2,b:180-i*3}}}).png().toBuffer()})));
 await page.locator('input[type=file]').setInputFiles(files.slice(0,38));
 await expect.poll(async()=>(await board()).nodes.filter(n=>n.ref).length,{timeout:90000}).toBe(38);
 async function transfer(file,kind){
   await page.evaluate(({encoded,name,kind})=>{
    const data=new DataTransfer();data.items.add(new File([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],name,{type:"image/png"}));
    const rect=document.querySelector(".react-flow__pane").getBoundingClientRect();
    const e=kind==="drop"?new MouseEvent(kind,{bubbles:true,cancelable:true,clientX:rect.left+80,clientY:rect.top+80}):new Event(kind,{bubbles:true,cancelable:true});Object.defineProperty(e,kind==="paste"?"clipboardData":"dataTransfer",{value:data});
    document.querySelector(".react-flow__pane").dispatchEvent(e);
   },{encoded:file.buffer.toString("base64"),name:file.name,kind});
 }
 await transfer(files[38],"paste");await expect.poll(async()=>(await board()).nodes.filter(n=>n.ref).length).toBe(39);
 await transfer(files[39],"drop");await expect.poll(async()=>(await board()).nodes.filter(n=>n.ref).length).toBe(40);
 await transfer(files[38],"paste");await expect(page.getByText("Already on this board.",{exact:true})).toBeVisible();
 const last=(await board()).nodes.find(n=>n.title.includes("39")),ad=page.locator('.react-flow__node[data-id="'+last.id+'"]');
 await expect(ad.locator("img")).toBeVisible();
 assert(await ad.locator("img").evaluate(async img=>{await img.decode();return img.naturalWidth>0}));
 const byTitle=Object.fromEntries((await board()).nodes.map(n=>[n.title,n]));
 for(const [name,width,height] of [["Ad 39.png",1080,1350],["Ad 40.png",1600,900],["Ad 01.png",240,240]]){
   const n=byTitle[name];assert.deepEqual([n.width,n.height,n.imageSize.width,n.imageSize.height],[width,height,width,height]);
 }
 const art=ad.locator("img"),control=ad.getByRole("button",{name:"Item actions for Ad 39.png"});
 await expect.poll(()=>art.evaluate(i=>i.naturalWidth)).toBe(1080);
 const imageBox=await art.boundingBox(),controlBox=await control.boundingBox();assert(Math.abs(imageBox.width/imageBox.height-1080/1350)<.01);
 assert(controlBox.y>=imageBox.y+imageBox.height-1);
 await btn("Focus mode").click();await expect(control).toHaveCount(0);await expect(art).toBeVisible();await btn("Focus mode").click();
 const beforeTabs=context.pages().length;await ad.getByRole("img",{name:"Ad 39.png"}).click();await expect(ad).toHaveClass(/selected/);assert.equal(context.pages().length,beforeTabs);
 await control.focus();await page.keyboard.press("ArrowDown");await page.keyboard.press("End");await page.keyboard.press("ArrowUp");await page.keyboard.press("Enter");
 await expect.poll(async()=>(await board()).nodes.find(n=>n.id===last.id).appearance).toBe("outline");
 await control.click();await page.getByRole("menuitem",{name:"Edit",exact:true}).click();await page.getByLabel("Caption").fill("Keep the generous margins.");await btn("Apply").click();await btn("Mark used").click();
 await btn("Group cards").click();await page.getByLabel("Group name").fill("Shortlist");await page.getByRole("dialog",{name:"Group cards"}).getByRole("button",{name:"Group cards"}).click();
 const group=await btn("Select group Shortlist").boundingBox();assert(group);const assigned=(await board()).nodes.find(n=>n.id===last.id);
 await page.mouse.move(group.x+group.width/2,group.y+group.height/2);await page.mouse.down();await page.mouse.move(group.x+group.width/2+40,group.y+group.height/2+20,{steps:6});await page.mouse.up();
 await expect.poll(async()=>(await board()).nodes.find(n=>n.id===last.id).x).toBeGreaterThan(assigned.x+15);
 console.log("Verified 40 images, duplicate reuse, grouping and captions. Opening original…");
 await control.click();
 const mediaPromise=context.waitForEvent("page",{timeout:15000});
 await page.getByRole("menuitem",{name:"Open",exact:true}).click({noWaitAfter:true});console.log("Clicked original.");
 const mediaTab=await mediaPromise;console.log("Media tab created.");await mediaTab.waitForURL(/\/admin\/media/, {waitUntil:"commit",timeout:15000});
 assert(mediaTab.url().includes(last.ref.objectId));console.log("Original Media route opened.");await page.bringToFront();
 await btn("Fit board").click();await page.waitForTimeout(350);
 await page.screenshot({path:path.join(output,"ad-board-desktop.png")});
 await btn("Back to boards").click();await expect(page.getByRole("link",{name:"Open Ad inspiration"})).toBeVisible();await page.reload();
 await btn("Saved views for Ad inspiration").click();await page.getByRole("link",{name:"Brief and direction"}).click();
 await expect(page.getByRole("heading",{name:"Ad inspiration"})).toBeVisible();
 const requestedView=new URL(page.url()).searchParams.get("view");
 const savedView=(await board()).views.find(v=>v.id===requestedView);assert(savedView);
 await expect.poll(()=>page.evaluate(()=>new DOMMatrix(getComputedStyle(document.querySelector(".react-flow__viewport")).transform).a)).toBeCloseTo(savedView.zoom,2);
 const saved=await board();assert.equal(saved.nodes.length,42);assert.equal(saved.edges[0].symbol,"circle");
 assert(saved.nodes.some(n=>n.used&&n.group==="Shortlist"&&n.body==="Keep the generous margins."));
 await page.setViewportSize({width:390,height:844});await expect(btn("Add objects")).toBeInViewport();await btn("Add objects").click();
 await expect(page.getByRole("button",{name:"Add to canvas"})).toBeVisible();await btn("Close object picker").click();
 await btn("Fit board").click();await page.waitForTimeout(350);await page.screenshot({path:path.join(output,"ad-board-mobile.png")});
 await expect.poll(()=>page.evaluate(()=>Math.abs(parseInt(document.querySelector('[title="Reset zoom"]').textContent)-Math.round(100*new DOMMatrix(getComputedStyle(document.querySelector(".react-flow__viewport")).transform).a)))).toBeLessThan(2);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 // Freshly reopened old one-image boards should recover their original proportions.
 const legacyId=crypto.randomUUID();const headers={"x-csrf-token":csrf};
 const create=await context.request.post(base+"/api/personal/canvas",{headers,data:{id:legacyId,title:"Existing ad board",folder:""}});
 assert.equal(create.ok(),true);const legacy=(await create.json()).board;
 const oldNode={...last,width:220,height:200};delete oldNode.imageSize;
 const put=await context.request.put(base+"/api/personal/canvas",{headers,data:{expectedRevision:legacy.revision,board:{...legacy,nodes:[oldNode]}}});assert.equal(put.ok(),true);
 await page.goto(base+"/admin/personal/canvas?board="+legacyId);
 await expect.poll(async()=>{const res=await context.request.get(base+"/api/personal/canvas?id="+legacyId);return (await res.json()).board.nodes[0].width;},{timeout:15000}).toBe(1080);
 // Exercise exact geometry and bulk controls in a fresh local board at a known zoom.
 await page.setViewportSize({width:1366,height:900});
 const testId=crypto.randomUUID(), fixture=await context.request.post(base+"/api/personal/canvas",{headers,data:{id:testId,title:"Ad layout",folder:""}});
 const blank=(await fixture.json()).board;
 const layout=[[95,90,150,90],[301,185,116,105],[679,370,180,120]].map(([x,y,width,height],i)=>({
   ...byTitle["Ad 0"+(i+1)+".png"],x,y,width,height
 }));
 const view={id:"arrange",name:"Arrange",x:60,y:100,zoom:1};
 const seeded=await context.request.put(base+"/api/personal/canvas",{headers,data:{expectedRevision:blank.revision,board:{...blank,nodes:layout,views:[view]}}});assert(seeded.ok());
 await page.goto(base+"/admin/personal/canvas?board="+testId+"&view=arrange");
 const cards=layout.map(n=>page.locator('.react-flow__node[data-id="'+n.id+'"]'));
 const read=async()=>(await (await context.request.get(base+"/api/personal/canvas?id="+testId)).json()).board.nodes;
 const b=await cards[1].boundingBox();await page.mouse.move(b.x+50,b.y+30);await page.mouse.down();
 const dragX=b.x+20,dragY=b.y-20;await page.mouse.move(dragX,dragY,{steps:8});
 await expect.poll(async()=>(await cards[1].boundingBox()).y).toBeLessThan(b.y-30);
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const liveBox=await cards[1].boundingBox(),reference=await cards[0].boundingBox();
 let pointerY=dragY+reference.y+2-liveBox.y;
 await page.mouse.move(dragX,pointerY,{steps:8});await page.waitForTimeout(120);
 for(let attempt=0;attempt<3 && !(await page.locator(".react-flow__viewport-portal line").count());attempt++){
   const currentBox=await cards[1].boundingBox();console.log("Aligning drag",JSON.stringify({reference:reference.y,actual:currentBox.y,pointerY}));
   pointerY+=reference.y-currentBox.y;await page.mouse.move(dragX,pointerY);await page.waitForTimeout(120);
 }
 await expect.poll(()=>page.locator(".react-flow__viewport-portal line").count()).toBeGreaterThan(0);await page.mouse.up();
 await expect.poll(async()=>(await read())[1].y).toBe(layout[0].y);
 await expect(page.locator(".react-flow__viewport-portal line")).toHaveCount(0);
 await btn("Undo").click();await expect.poll(async()=>(await read())[1].y).toBe(layout[1].y);
 await btn("Select multiple").click();for(const c of cards)await c.click({position:{x:18,y:20}});
 await expect(page.getByText("3 selected",{exact:true})).toBeVisible();
 await cards[1].click({position:{x:18,y:20}});await expect(page.getByText("2 selected",{exact:true})).toBeVisible();
 await cards[1].click({position:{x:18,y:20}});await btn("Arrange selection").click();
 await btn("Space horizontally").click();await expect.poll(async()=>{const [a,b,c]=await read();return b.x-a.x-a.width-(c.x-b.x-b.width);}).toBe(0);
 await btn("Space vertically").click();await expect.poll(async()=>{const [a,b,c]=await read();return b.y-a.y-a.height-(c.y-b.y-b.height);}).toBe(0);
 assert.deepEqual((await read()).map(n=>[n.width,n.height]),layout.map(n=>[n.width,n.height]));
 await btn("Close panel").click();await btn("Selection appearance").click();await btn("Card").click();
 await expect.poll(async()=>(await read()).every(n=>n.appearance==="card")).toBe(true);await btn("Close panel").click();await btn("Undo").click();
 await expect.poll(async()=>(await read()).some(n=>n.appearance==="card")).toBe(false);
 const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:"block"});
 await touch.addCookies(await context.cookies());await touch.route(/^https:\/\//,r=>r.abort());const phone=await touch.newPage();phone.setDefaultTimeout(9000);
 await phone.goto(base+"/admin/personal/canvas?board="+testId);
 await phone.getByRole("button",{name:"Fit board",exact:true}).tap();await phone.waitForTimeout(300);
 await phone.getByRole("button",{name:"Select multiple",exact:true}).tap();
 for(const n of layout)await phone.locator('.react-flow__node[data-id="'+n.id+'"] [role="img"]').tap();
 await expect(phone.getByText("3 selected",{exact:true})).toBeVisible();
 await phone.getByRole("button",{name:"Select cards",exact:true}).tap();
 await phone.locator(".react-flow__pane").tap({position:{x:20,y:170}});
 const firstAd=phone.locator('.react-flow__node[data-id="'+layout[0].id+'"]');
 await firstAd.getByRole("img",{name:layout[0].title}).tap();
 await expect(firstAd).toHaveClass(/selected/);await expect(phone.locator(".react-flow__node.selected")).toHaveCount(1);
 const trigger=firstAd.getByRole("button",{name:"Item actions for "+layout[0].title});
 await trigger.tap();
 if(!await phone.getByRole("menu",{name:"Item actions"}).count()){
    await phone.screenshot({path:path.join(output,"phone-menu-check.png")});
    console.log("Touch menu state",await trigger.evaluate(el=>({expanded:el.getAttribute("aria-expanded"),state:el.dataset.state,focus:document.activeElement?.outerHTML.slice(0,180)})));
 }
 const menu=phone.getByRole("menu",{name:"Item actions"}),menuBox=await menu.boundingBox();
 assert(menuBox && menuBox.x>=0 && menuBox.x+menuBox.width<=391);
 await menu.getByRole("menuitemradio",{name:"Outline",exact:true}).tap();
 await expect.poll(async()=>(await read())[0].appearance).toBe("outline");
 await touch.close();
 console.log("PASS live drag guides and snap, tap multi-select, equal gaps on both axes, original sizes and bulk style undo.");
 assert.deepEqual(errors,[]);console.log("PASS 40 distinct images, paste/drop/reuse, real Media links and thumbnails, drag, Undo/Redo, notes, typed connections, saved views, group and used state, navigation and mobile controls.");
}
main().catch(async e=>{console.error(e);if(page)await page.screenshot({path:path.join(output,"failure.png")}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
