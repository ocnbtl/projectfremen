const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const crypto = require("node:crypto"), {spawn} = require("node:child_process");
const {webkit,expect} = require("@playwright/test");

module.exports = async function checkSourceDetails({temp,store,node,ref,link}) {
  fs.writeFileSync(path.join(temp,"personal-records.json"),"[]");
  const {createPersonalRecord} = require("../lib/personal-records-store.ts");
  const {createProjectsObject} = require("../lib/modules/projects/store.ts");
  const {item:project} = await createProjectsObject("projects",{name:"Backlink garden",description:"Browser fixture"});
  async function record(className,title,fields={}) {
    const records = await createPersonalRecord({className,domain:"notes-docs",title,...fields});
    return records.find(record=>record.title===title);
  }
  const note = await record("note","Garden log"), legacy = await record("file","Old photo");
  const objectId = crypto.randomUUID();
  const manifest = {format:"unigentamos-vault-media-v1",mediaId:objectId,objectId,contentRoot:"a".repeat(64),digestAlgorithm:"chunk-root-v1",fileName:"garden.png",mimeType:"image/png",byteLength:12,chunkSize:1048576,totalChunks:1,createdAt:new Date().toISOString()};
  const media = await record("file","Account photo",{mediaProfile:{version:1,manifest,linkedRefs:[],tags:[],altText:"Garden"}});
  const board = await store.createBoard({id:"a0",title:"Garden ideas"});
  const refs = [ref("notes","note",note.id,"/admin/notes/"+note.id),link("projects","/admin/projects/"+project.slug),
    link("media","/admin/media?selected="+objectId),ref("media","asset",legacy.id,"/admin/media/"+legacy.id)];
  await store.updateBoard({...board,nodes:refs.map((r,i)=>({...node("place"+i,r),x:5000*i,y:2000*i}))},board.revision);
  const port = 20000+crypto.randomInt(20000), base = "http://localhost:"+port, secret = crypto.randomUUID();
  const server = spawn(process.execPath,[require.resolve("next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{
    cwd:path.resolve(__dirname,".."),env:{...process.env,FREMEN_DATA_DIR:temp,ADMIN_PASSWORD:"fixture",ADMIN_SESSION_SECRET:secret,VERCEL:""},stdio:["ignore","pipe","pipe"]
  });
  let browser;
  try {
    await new Promise((resolve,reject)=>{
      const timeout = setTimeout(()=>reject(Error("Local dashboard startup timed out")),25000);
      server.stdout.on("data",data=>{if (String(data).includes("Ready in")) {clearTimeout(timeout);resolve();}});
      server.once("error",reject);server.once("exit",code=>reject(Error("Local dashboard exited "+code)));
    });
    browser = await webkit.launch({executablePath:process.env.WEBKIT_EXECUTABLE});
    const context = await browser.newContext({viewport:{width:1280,height:860},serviceWorkers:"block"});
    const stamp = "v1."+(Date.now()+3600000)+".placementsfixture";
    await context.addCookies([{name:"admin_session",url:base,value:stamp+"."+crypto.createHmac("sha256",secret).update(stamp).digest("base64url")}]);
    await context.route(/^https?:\/\//,route=>new URL(route.request().url()).origin===base ? route.continue() : route.abort());
    const page = await context.newPage();
    let lookups = 0;
    page.on("request",request=>{if (new URL(request.url()).pathname==="/api/personal/canvas/placements") lookups++;});
    const cases = [
      ["/admin/notes/"+note.id+"?tab=links",0],["/admin/projects/"+project.id+"?tab=files-links",1],
      ["/admin/media/"+media.id,2],["/admin/media/"+legacy.id+"?tab=usage",3]
    ];
    for (const [route,i] of cases) {
      await page.setViewportSize({width:i % 2 ? 390 : 1280,height:860});
      const before = lookups;
      await page.goto(base+route);
      const disclosure = page.locator("summary:visible").filter({hasText:"Used on these boards"}).first();
      await expect(disclosure).toBeVisible({timeout:15000});
      await expect(disclosure.locator('[data-icon-role="component"]')).toBeVisible();
      assert.equal(lookups,before,"Closed board usage should make no request");
      await disclosure.click();
      const target = page.getByRole("link",{name:"Garden ideas Card "+(i+1)}).first();
      await expect(target).toHaveAttribute("href","/admin/personal/canvas?board=a0&card=place"+i);
      await expect(target.locator('[data-icon-role="chevron-right"]')).toBeVisible();
      assert(await target.evaluate(el=>{
        const rect = el.getBoundingClientRect();
        const [name,number,arrow] = Array.from(el.children,child=>child.getBoundingClientRect());
        return rect.left >= 0 && rect.right <= window.innerWidth+1 && el.scrollWidth <= el.clientWidth+1 &&
          name.right <= number.left+1 && number.right <= arrow.left+1 && Math.abs(number.top+number.height/2-arrow.top-arrow.height/2)<2;
      }),"Placement link must fit the source detail width");
      await target.click();
      const placed = page.locator('.react-flow__node[data-id="place'+i+'"]');
      await expect(placed).toHaveClass(/selected/);
      await expect(placed).toBeInViewport({ratio:.9});
      // A fit-to-board view would also make the card visible, but unreadably small.
      await expect.poll(async()=>Math.round((await placed.boundingBox())?.width || 0)).toBeGreaterThan(150);
    }
    await page.goto(base+"/admin/personal/canvas?board=a0&card=missing");
    await expect(page.getByText("This card is no longer on the board.")).toBeVisible();
    console.log("Passed browser round trips from Notes, Projects, current and legacy Media to centered individual cards.");
  } finally { await browser?.close();server.kill(); }
};
