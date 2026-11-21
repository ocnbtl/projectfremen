const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium, expect } = require("@playwright/test");
const ts = require("typescript");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "writing-mentions-browser-"));
Object.assign(process.env,{FREMEN_DATA_DIR:temp, SUPABASE_URL:"", SUPABASE_SERVICE_ROLE_KEY:"", FREMEN_REQUIRE_SUPABASE:"false", VERCEL:""});
require.extensions[".ts"] = (mod,filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022, esModuleInterop:true}
}).outputText,filename);
const { createBoard, updateBoard } = require("../lib/modules/canvas/store.ts");
const { buildSignedAdminSessionToken } = require("../lib/auth.ts");

async function test() {
  const time = new Date().toISOString(), target = "/admin/notes/target";
  const mention = "[Launch brief](" + target + ")";
  const note = {domain:"notes-docs",className:"note",status:"active",updatedAt:time,createdAt:time};
  const taskId = "task-" + crypto.randomUUID();
  fs.writeFileSync(path.join(temp,"personal-records.json"),JSON.stringify([
    {...note,id:"target",title:"Launch brief",body:"Reference for the launch."},
    {...note,id:"source",title:"Team meeting",body:"Review " + mention + " with design. See " + mention + "."}
  ]));
  fs.writeFileSync(path.join(temp,"planning-records.json"),JSON.stringify({schemaVersion:1,taskPlans:[{
    id:taskId,title:"Confirm the release",kind:"task",description:"Follow up on "+mention,createdAt:time,updatedAt:time,
    start:"",end:"",allDay:true,timeZone:"UTC",calendarIds:[],recurrence:"",exceptions:{}
  }]}));
  const board = await createBoard({id:"launch",title:"Design board"});
  await updateBoard({...board,nodes:[{id:"creative",kind:"sticky",title:"Creative direction",body:"Design examples for "+mention,
    used:false,group:"",color:"blue",x:140,y:240,width:250,height:180}]},board.revision);
  const secret = crypto.randomUUID(), port = crypto.randomInt(21000,33000), base = "http://127.0.0.1:"+port;
  const server = spawn(process.execPath,[require.resolve("next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{
    cwd:path.resolve(__dirname,".."),env:{...process.env,ADMIN_PASSWORD:"fixture",ADMIN_SESSION_SECRET:secret},windowsHide:true,
    stdio:["ignore","pipe","pipe"]
  });
  let browser;
  try {
    await new Promise((resolve,reject)=>{
      const timeout = setTimeout(()=>reject(Error("Local app startup timed out")),30000);
      server.stdout.on("data",text=>{ if (String(text).includes("Ready in")) {clearTimeout(timeout);resolve();} });
      server.once("exit",code=>{clearTimeout(timeout);reject(Error("App exited "+code));});
      server.once("error",reject);
    });
    const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
    browser = await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE || (fs.existsSync(chrome)?chrome:undefined)});
    const context = await browser.newContext({viewport:{width:1280,height:850},serviceWorkers:"block"});
    await context.route(/^https?:\/\//,route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    await context.addCookies([{name:"admin_session",url:base,value:buildSignedAdminSessionToken(secret,600)}, {name:"admin_csrf",url:base,value:crypto.randomUUID()}]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror",e=>errors.push(e.message));
    const visit = () => page.goto(base+target+"?tab=links");
    const panel = page.locator("[data-writing-mentions]:visible");
    await visit();
    await expect(panel.getByRole("link")).toHaveCount(3);
    await expect(panel.getByRole("link",{name:/Team meeting/})).toContainText("with design");
    await panel.getByRole("link",{name:/Creative direction/}).click();
    await expect(page.locator('.react-flow__node.selected[data-id="creative"]')).toBeVisible();
    await visit();
    await panel.getByRole("link",{name:/Confirm the release/}).click();
    await expect(page.getByRole("button",{name:"Back to tasks"})).toBeVisible();
    await expect(page.getByRole("textbox",{name:"Task name"})).toHaveValue("Confirm the release");
    await visit();
    const source = await panel.getByRole("link",{name:/Team meeting/}).getAttribute("href");
    const editor = await context.newPage();
    await editor.goto(base+source);
    await editor.getByRole("button",{name:"Edit Markdown"}).click();
    await editor.getByRole("textbox",{name:"Markdown source"}).fill("The launch reference was removed.");
    await editor.getByRole("button",{name:"Save Note",exact:true}).click();
    await expect(editor.getByRole("button",{name:"Save Note",exact:true})).toBeDisabled();
    await page.bringToFront();
    await expect(panel.getByRole("link")).toHaveCount(2,{timeout:12000});
    await page.setViewportSize({width:390,height:844});
    await expect(panel.getByRole("link",{name:/Creative direction/})).toBeVisible();
    assert.ok(await panel.evaluate(el=>el.getBoundingClientRect().right<=innerWidth+1));
    assert.deepEqual(errors,[]);
    console.log("Passed note, task and Canvas source navigation, source deduplication, cross-tab removal after saving and mobile layout.");
  } finally { await browser?.close(); server.kill(); }
}
test().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(temp,{recursive:true,force:true}));
