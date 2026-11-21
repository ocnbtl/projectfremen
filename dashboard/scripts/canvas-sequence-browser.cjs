/* Exercise the print tab in Chromium so the browser produces a real PDF. */
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {spawn}=require("node:child_process");
const {chromium,expect}=require("@playwright/test");
const sharp=require("sharp");
const app=path.resolve(__dirname,"..");
const data=fs.mkdtempSync(path.join(os.tmpdir(),"canvas-sequence-"));
const port=25000+crypto.randomInt(10000),base="http://127.0.0.1:"+port,csrf=crypto.randomUUID(),secret=crypto.randomUUID();
const server=spawn(process.execPath,[require.resolve("next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{
  cwd:app,env:{...process.env,FREMEN_ACCOUNT_MEDIA_BACKEND:'filesystem-test',FREMEN_DATA_DIR:data,FREMEN_REQUIRE_SUPABASE:"false",SUPABASE_URL:"",SUPABASE_SERVICE_ROLE_KEY:"",VERCEL:"",ADMIN_SESSION_SECRET:secret,ADMIN_PASSWORD:"fixture"},
  stdio:["ignore","pipe","pipe"]
});
const ready=new Promise((resolve,reject)=>{server.stdout.on("data",b=>{if(String(b).includes("Ready in"))resolve();});server.once("error",reject);server.once("exit",code=>reject(Error("Local server exited "+code)));});
let browser;
async function run(){
  await ready;
  const chrome=process.env.CHROMIUM_EXECUTABLE || (process.platform==="win32" && fs.existsSync("C:/Program Files/Google/Chrome/Application/chrome.exe")?"C:/Program Files/Google/Chrome/Application/chrome.exe":undefined);
  browser=await chromium.launch({executablePath:chrome});
  const context=await browser.newContext({viewport:{width:1366,height:960},serviceWorkers:"block"});
  const errors=[];
  context.on("page",p=>p.on("pageerror",e=>errors.push(e.message)));
  const stamp="v1."+(Date.now()+3600000)+".sequence";
  await context.addCookies([{name:"admin_session",value:stamp+"."+crypto.createHmac("sha256",secret).update(stamp).digest("base64url"),url:base},{name:"admin_csrf",value:csrf,url:base}]);
  const page=await context.newPage(),api=base+"/api/personal/canvas",headers={"x-csrf-token":csrf};
  const id=crypto.randomUUID();
  const created=await context.request.post(api,{headers,data:{id,title:"Campaign review",folder:""}});
  assert(created.ok());
  const read=async()=>(await (await context.request.get(api+"?id="+id)).json()).board;
  const addr=base+"/admin/personal/canvas?board="+id;
  await page.goto(addr);
  const btn=name=>page.getByRole("button",{name,exact:true});
  // Blue portrait on a wide card makes incorrect letterboxing and PDF image loss easy to detect.
  const blue=await sharp({create:{width:180,height:240,channels:3,background:"#1262cd"}}).png().toBuffer();
  await page.locator('input[type="file"]').last().setInputFiles({name:"Portrait reference.png",mimeType:"image/png",buffer:blue});
  await expect.poll(async()=>(await read()).nodes.length,{timeout:20000}).toBe(1);
  const board=await read();
  const portrait={...board.nodes[0],x:30,y:40,width:250,height:180,imagePins:[{id:"pin",x:.25,y:.75,text:"Check this blue corner"}]};
  const items=Array.from({length:13},(_,i)=>({id:"note"+i,kind:"sticky",x:2000+i*200,y:130,width:150,height:110,
    title:"Review "+String(i+1).padStart(2,"0"),body:"Private editor body",color:"butter",group:"",used:false}));
  items[0].x=310;
  const options={groupBy:"item/type",sortBy:"title",filters:[],search:""};
  const views=[{id:"first",name:"Board opening",x:0,y:0,zoom:1,frameSize:{width:600,height:320},
    positions:[portrait,...items].map(({id,x,y})=>({id,x,y}))},
    {id:"second",name:"Sorted references",x:0,y:0,zoom:1,mode:"gallery",organizer:options},
    {id:"third",name:"Detail ending",x:-4010,y:-80,zoom:1,frameSize:{width:570,height:240},
      organizer:{...options,search:"Review 01"}, positions:[{id:items[0].id,x:4100,y:100}],
      arrangement:{rowBy:"item/type",columnBy:"",headerStyle:"outline",headerColor:"#375b70",
        rowTint:"#dceaff",rowOutline:"#346286",headerFont:"serif",headerAlign:"center",organizer:options,
        bands:[{axis:"row",key:"sticky",axisName:"Review",label:"Focus",x:4020,y:100,width:72,height:45,fontSize:14,
          region:{x:4020,y:94,width:242,height:130}}]}}];
  const save=await context.request.put(api,{headers,data:{expectedRevision:board.revision,board:{...board,nodes:[portrait,...items],views}}});
  assert(save.ok(),await save.text());
  await page.goto(addr+"&view=third");
  await btn("Saved views").click();
  await page.getByLabel("View name",{exact:true}).fill("Working view");
  await btn("Save current view").click();
  async function setIncluded(name,include){
    await btn("Manage "+name).click();
    await page.getByRole("checkbox",{name:"Include in sequence"}).setChecked(include);
    await btn("Manage "+name).click();
  }
  for(const name of ["Working view",...views.map(v=>v.name)])await setIncluded(name,false);
  await expect(btn("Present views")).toBeDisabled();await expect(btn("Export PDF")).toBeDisabled();
  await expect(page.getByText(/0 views in sequence/)).toBeVisible();
  for(const v of views)await setIncluded(v.name,true);
  await expect.poll(async()=>{
    const current=(await read()).views;
    return current.length===4 && current.filter(v=>v.inSequence!==false).length===3 && current.find(v=>v.name==="Working view")?.inSequence===false;
  }).toBe(true);
  const working=(await read()).views.find(v=>v.name==="Working view");
  assert(working.frameSize.width>0 && working.frameSize.height>0 && working.inSequence===false);
  assert(working.positions.length===14);
  const saved=await read();
  const camera=()=>page.locator(".react-flow__viewport").evaluate(el=>el.style.transform);
  const before=await camera();
  await btn("Present views").click();
  const modal=page.getByRole("dialog",{name:"Presenting Campaign review"});
  await expect(modal.getByRole("heading",{name:"Board opening"})).toBeVisible();
  await expect(modal.locator("[data-slide-node]")).toHaveCount(2);
  await expect.poll(()=>modal.locator("img").evaluate(i=>i.naturalWidth)).toBeGreaterThan(0);
  const output=path.join(app,"output/canvas");fs.mkdirSync(output,{recursive:true});
  await page.screenshot({path:path.join(output,"present-board-desktop.png")});
  const pin=await modal.locator("g:has(> title)").getAttribute("transform");
  assert.equal(pin,"translate(91.25 135)");
  await modal.getByRole("button",{name:"Annotations"}).click();
  await expect(modal.getByText("Check this blue corner",{exact:true})).toBeVisible();
  await page.keyboard.press("ArrowRight");await expect(modal.getByRole("heading",{name:"Sorted references"})).toBeVisible();
  await expect(modal.locator("[data-slide-node]")).toHaveCount(14);
  assert((await modal.locator("svg text").allTextContents()).some(label=>label.includes("Sticky note")));
  const layoutOf=svg=>svg.locator("[data-slide-node]").evaluateAll(nodes=>nodes.map(node=>[node.dataset.slideNode,node.getAttribute("transform")]));
  const fits=svg=>svg.locator(".cs-board").evaluate(board=>{
    const frame=board.getBoundingClientRect();
    return Array.from(board.querySelectorAll("[data-slide-node] > foreignObject:first-of-type")).every(node=>{
      const item=node.getBoundingClientRect();
      return item.width>0 && item.height>0 && item.left>=frame.left-1 && item.top>=frame.top-1 && item.right<=frame.right+1 && item.bottom<=frame.bottom+1;
    });
  });
  const sortedLayout=await layoutOf(modal);
  assert.notEqual(sortedLayout.find(([id])=>id===items[0].id)[1],"translate(310 130)");
  assert(await fits(modal),"Every item fits in the converted view");
  await page.keyboard.press("End");await expect(modal.getByRole("heading",{name:"Detail ending"})).toBeVisible();
  assert.deepEqual(await layoutOf(modal),[[items[0].id,"translate(4100 100)"]]);
  const detailStyle=async node=>[
    await node.locator("[data-arrangement-band=row]").getAttribute("fill"),
    await node.locator("[data-arrangement-header=row] > rect").getAttribute("stroke"),
    await node.locator("[data-arrangement-header=row] text").allTextContents()
  ];
  assert.deepEqual(await detailStyle(modal),["#dceaff","#375b70",["Review","Focus"]]);
  await page.keyboard.press("Escape");await expect(modal).toHaveCount(0);
  assert.equal(await camera(),before);
  await expect(btn("Present views")).toBeFocused();
  await page.setViewportSize({width:390,height:844});
  await btn("Present views").click();await modal.getByRole("button",{name:"Next view"}).click();
  await expect(modal.getByRole("heading",{name:"Sorted references"})).toBeVisible();
  assert.deepEqual(await layoutOf(modal),sortedLayout);
  assert(await fits(modal),"Every item fits on mobile");
  assert(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  await page.screenshot({path:path.join(output,"present-arrangement-mobile.png")});
  await modal.getByRole("button",{name:"Exit presentation"}).click();
  // Capture the native print request. CDP's PDF path uses the same print
  // layout but requires the OS printer dialog to be closed.
  await page.evaluate(()=>{
    const open=window.open.bind(window);
    window.open=(...args)=>{
      const tab=open(...args);
      if(tab)tab.print=()=>{tab.document.documentElement.dataset.requestedPrint="true";};
      return tab;
    };
  });
  const pending=page.waitForEvent("popup");
  await btn("Export PDF").click();
  const preview=await pending;
  await expect(preview.getByRole("button",{name:"Print / Save as PDF"})).toBeEnabled({timeout:25000});
  assert.equal(await preview.locator("html").getAttribute("data-requested-print"),"true");
  assert.deepEqual(await preview.locator("article .cs-print-head h2").allTextContents(),["Board opening","Board opening","Sorted references","Sorted references","Detail ending"]);
  const sheets=preview.locator(".cs-sheet");
  assert.deepEqual(await layoutOf(sheets.nth(1)),sortedLayout);
  assert.deepEqual(await layoutOf(sheets.nth(2)),[[items[0].id,"translate(4100 100)"]]);
  assert.deepEqual(await detailStyle(sheets.nth(2)),["#dceaff","#375b70",["Review","Focus"]]);
  assert(await preview.locator("img").evaluateAll(images=>images.length===2 && images.every(img=>img.naturalWidth>0)));
  const pdf=await preview.pdf({path:path.join(output,"saved-views.pdf"),preferCSSPageSize:true,printBackground:true});
  assert.equal(pdf.subarray(0,4).toString(),"%PDF");
  const count=pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length;
  assert.equal(count,5,"PDF has three board views and two image annotation pages");
  await preview.close();await expect(btn("Present views")).toBeVisible();
  assert.deepEqual(await read(),saved,"Presenting and printing must leave the board and its saved views intact");
  assert.deepEqual(errors,[]);
  console.log("PASS read-only playback and five-page PDF with ordered views, separate saved positions, legacy board arrangement, mobile framing, photo pins and filters.");
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
