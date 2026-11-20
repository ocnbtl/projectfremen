const {strict:assert}=require("node:assert");
const fs=require("node:fs"), os=require("node:os"), path=require("node:path"), crypto=require("node:crypto");
const {spawn}=require("node:child_process");
const {webkit,expect}=require("@playwright/test");
const app=path.resolve(__dirname,"..");
const data=fs.mkdtempSync(path.join(os.tmpdir(),"canvas-library-"));
const port=20000+crypto.randomInt(30000), base="http://localhost:"+port;
const token=crypto.randomBytes(24).toString("hex");
const server=spawn(process.execPath,[require.resolve("next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{
  cwd:app,env:{...process.env,FREMEN_DATA_DIR:data,ADMIN_SESSION_SECRET:token,ADMIN_PASSWORD:"fixture",FREMEN_REQUIRE_SUPABASE:"false",SUPABASE_URL:"",SUPABASE_SERVICE_ROLE_KEY:"",VERCEL:""},stdio:["ignore","pipe","pipe"]
});
const ready=new Promise((resolve,reject)=>{
  let output="";const timer=setTimeout(()=>reject(Error("Local server timeout")),20000);timer.unref();
  server.stdout.on("data",c=>{output+=c;if(output.includes("Ready in")){clearTimeout(timer);resolve();}});
  server.stderr.on("data",()=>{});server.once("error",reject);server.once("exit",code=>reject(Error("Local server exited "+code)));
});
(async()=>{
  await ready;
  const browser=await webkit.launch({executablePath:process.env.WEBKIT_EXECUTABLE});
  try {
    const ctx=await browser.newContext({serviceWorkers:"block",viewport:{width:1366,height:900}});
    const payload="v1."+(Date.now()+3600000)+".qa";
    await ctx.addCookies([{name:"admin_session",url:base,value:payload+"."+crypto.createHmac("sha256",token).update(payload).digest("base64url")},{name:"admin_csrf",url:base,value:crypto.randomBytes(24).toString("hex")}]);
    await ctx.route(/^https?:\/\//,route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    const page=await ctx.newPage();
    page.setDefaultTimeout(10000);
    const errors=[];
    page.on("pageerror",e=>{if(!e.message.includes("ResizeObserver"))errors.push(e.message);});
    await page.goto(base+"/admin/personal/canvas");
    await expect(page.getByRole("heading",{name:"Your first canvas"})).toBeVisible();
    async function create(title,folder) {
      await page.getByRole("button",{name:"New board",exact:true}).click();
      const dialog=page.getByRole("dialog");
      await dialog.getByLabel("Board name").fill(title);
      await dialog.getByLabel("Folder",{exact:true}).fill(folder);
      await dialog.getByRole("button",{name:"Create board",exact:true}).click();
      await expect(page.getByRole("button",{name:"Back to boards"})).toBeVisible();
      await expect(page).toHaveURL(/\?board=/);
      await page.getByRole("button",{name:"Back to boards"}).click();
      await expect(page.getByRole("link",{name:"Open "+title,exact:true})).toBeVisible();
    }
    await create("Static ad inspiration","Creative");
    await create("Client payment trail","Finance");
    await page.getByRole("button",{name:"Organize Static ad inspiration"}).click();
    const form=page.getByRole("dialog");
    await form.getByLabel("Board name").fill("Autumn inspiration");
    await form.getByLabel("Folder",{exact:true}).fill("Studio");
    await form.getByRole("button",{name:"Save changes"}).click();
    await expect(page.getByRole("link",{name:"Open Autumn inspiration"})).toBeVisible();
    await page.getByRole("combobox",{name:"Folder filter"}).click();
    await page.getByRole("option",{name:"Studio",exact:true}).click();
    await expect(page.getByRole("link",{name:"Open Client payment trail"})).toHaveCount(0);
    await page.getByRole("combobox",{name:"Sort boards"}).click();
    await page.getByRole("option",{name:"Name A–Z",exact:true}).click();
    await page.getByRole("link",{name:"Open Autumn inspiration"}).click();
    await page.getByRole("button",{name:"Back to boards"}).click();
    await expect(page.getByRole("combobox",{name:"Folder filter"})).toHaveText(/Studio/);
    await page.getByRole("searchbox",{name:"Search boards"}).fill("missing fixture");
    await expect(page.getByRole("heading",{name:"No matching boards"})).toBeVisible();
    await page.getByRole("button",{name:"Clear filters"}).click();
    await expect(page.getByRole("link",{name:"Open Client payment trail"})).toBeVisible();
    await page.reload();
    await expect(page.getByRole("link",{name:"Open Autumn inspiration"})).toBeVisible();
    await page.getByRole("combobox",{name:"Sort boards"}).click();
    await expect(page.getByRole("option",{name:"Name A–Z",exact:true})).toHaveAttribute("aria-selected","true");
    await page.keyboard.press("Escape");
    const out=path.join(app,"output/canvas-library");fs.mkdirSync(out,{recursive:true});
    for(const width of [390,1366]){
      await page.setViewportSize({width,height:850});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"Library overflow at "+width);
      await page.screenshot({path:path.join(out,"library-"+width+".png")});
    }
    await page.setViewportSize({width:390,height:850});
    await page.goto(base+"/admin/personal");
    await page.evaluate(()=>{
      window.personalArrivals=[];
      const observer=new MutationObserver(records=>{
        for(const record of records)for(const node of record.addedNodes){
          if(node instanceof HTMLElement && node.matches('body > span[aria-hidden="true"]') &&
            node.getAnimations().some(a=>a.effect.getKeyframes().some(frame=>String(frame.transform).includes("translate")))){
            window.personalArrivals.push({label:node.textContent.toLowerCase(),path:location.pathname});
          }
        }
      });
      observer.observe(document.body,{childList:true});
    });
    const spaces=page.getByRole("navigation",{name:"Personal spaces"});
    for(const [label,slug] of [["Car","car"],["Personal Build","personal-build"],["Health","health"],["Pets","pets"],["Canvas","canvas"]]){
      await spaces.getByRole("link",{name:label,exact:true}).click();
      await expect(page).toHaveURL(base+"/admin/personal/"+slug);
      await expect.poll(()=>page.evaluate(()=>window.personalArrivals.at(-1))).toEqual({label:label.toLowerCase(),path:"/admin/personal/"+slug});
      const parent=page.getByRole("link",{name:"Return to Personal",exact:true});
      await expect(parent).toBeVisible();
      if(slug==="canvas")await expect(page.getByRole("button",{name:"Personal views"})).toContainText("Canvas");
      if (slug==="health") await parent.click();
      else await page.goBack();
      await expect(spaces).toBeVisible();
      await expect.poll(()=>page.evaluate(()=>window.personalArrivals.at(-1))).toEqual({label:label.toLowerCase(),path:"/admin/personal"});
    }
    await page.emulateMedia({reducedMotion:"reduce"});
    const arrivals=await page.evaluate(()=>window.personalArrivals.length);
    await spaces.getByRole("link",{name:"Canvas",exact:true}).click();
    await expect(page.getByRole("link",{name:"Open Autumn inspiration"})).toBeVisible();
    assert.equal(await page.evaluate(()=>window.personalArrivals.length),arrivals);
    assert.equal(await page.getByRole("main",{name:"Canvas library"}).evaluate(el=>getComputedStyle(el).animationName),"none");
    await page.setViewportSize({width:1366,height:900});
    await page.goBack();
    await expect(spaces).toBeVisible();
    await page.emulateMedia({reducedMotion:"no-preference"});
    const keyboardShortcut=spaces.getByRole("link",{name:"Car",exact:true});
    await keyboardShortcut.focus();
    await keyboardShortcut.press("Enter");
    await expect.poll(()=>page.evaluate(()=>window.personalArrivals.at(-1))).toEqual({label:"car",path:"/admin/personal/car"});
    await page.goBack();
    await expect(spaces).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(base+"/admin/personal/car");
    await page.evaluate(()=>localStorage.setItem("unigentamos:motion","reduce"));
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-product-motion","reduce");
    await page.getByRole("link",{name:"Return to Personal",exact:true}).click();
    await expect(spaces).toBeVisible();
    assert.equal(await page.locator("main").first().evaluate(el=>getComputedStyle(el).animationName),"none");
    assert.deepEqual(errors,[]);
    console.log("PASS Canvas library, editing, persistence, responsive layout, five Personal shortcut transitions, Back and reduced motion.");
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.kill());
