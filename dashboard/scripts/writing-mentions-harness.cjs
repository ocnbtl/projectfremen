const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ts = require("typescript");
const provider = process.argv.includes("--provider");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "fremen-mentions-"));
const runtime = path.join(temp, "runtime");
fs.mkdirSync(runtime);
fs.mkdirSync(path.join(temp, "data"));
process.chdir(temp);
Object.assign(process.env, {FREMEN_DATA_DIR:runtime, FREMEN_REQUIRE_SUPABASE:"false", SUPABASE_URL:provider?"https://fixture.invalid":"", SUPABASE_SERVICE_ROLE_KEY:provider?"fixture":""});
require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"), {
  compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022, esModuleInterop:true}
}).outputText, filename);
let signedIn = false;
const session = require.resolve("../lib/admin-session.ts");
require.cache[session] = {id:session, filename:session, loaded:true, exports:{hasAdminSession:async () => signedIn}};
const {GET} = require("../app/api/admin/writing-mentions/route.ts");
const {createBoard,updateBoard} = require("../lib/modules/canvas/store.ts");
const {createEmptyFinanceState} = require("../lib/modules/finance/store.ts");
const {createEmptyProjectsState} = require("../lib/modules/projects/store.ts");
const {mentionIdentity} = require("../lib/writing/mentions.ts");
const target = "/admin/notes/work%20brief";
const mark = "[Brief]("+target+")";
const ask = href => GET(new Request("http://localhost/api/admin/writing-mentions?" + new URLSearchParams({target:href})));
const lookup = async (href=target) => (await ask(href)).json();
const store = (name,value) => fs.writeFileSync(path.join(runtime,name),JSON.stringify(value));
const stamp = "2026-01-01T00:00:00Z";
const note = {id:"source",className:"note",domain:"notes-docs",title:"Source",status:"active",body:"",createdAt:stamp,updatedAt:stamp};
const node = {id:"card",kind:"sticky",x:0,y:0,width:180,height:120,title:"Card",body:"",color:"blue",used:false,group:""};
async function main() {
  assert.equal((await ask(target)).status,401);
  assert.deepEqual(fs.readdirSync(runtime),[]);
  signedIn = true;
  for (const invalid of ["", "https://example.com/admin/notes/a","/admin/personal/passwords/record","/admin/personal/settings?skill=prompt","/admin/notes/../secrets"])
    assert.equal((await ask(invalid)).status,400);
  assert.equal(mentionIdentity("/admin/notes/job(3)"),mentionIdentity("/admin/notes/job%283%29"));
  assert.equal((await ask(target)).headers.get("cache-control"),"private, no-store");
  fs.writeFileSync(path.join(temp,"data","personal-records.json"),JSON.stringify([{...note,body:mark}]));
  assert.equal((await lookup()).items.length,1);
  assert.deepEqual(fs.readdirSync(runtime),[], "reads must not seed bundled fallback documents");
  const finance = {...createEmptyFinanceState(),importPreviews:[{id:"expired",expiresAt:"2000-01-01T00:00:00Z"}]};
  store("finance.json",finance);
  const media = {...note,id:"photo",className:"file",title:"Photo"};
  const markdown = ["```txt",mark,"```","`"+mark+"`","\\"+mark,"!"+mark].join("\n\n");
  const literal = {...note,id:"literal",body:markdown};
  const alias = "[Renamed](/admin/notes?tab=properties&note=work+brief)";
  const source = {...note,body:markdown+"\n\nMeet with "+alias+" about pricing. Also "+mark+"."};
  store("personal-records.json",[source,literal,media,{...note,id:"archived",status:"inactive",body:mark}]);
  const event = {id:"event",title:"Scheduled task",description:"Schedule "+mark,isTask:true,createdAt:stamp,updatedAt:stamp};
  const task = {id:"standalone",title:"Standalone",description:"Do "+mark,createdAt:stamp,updatedAt:stamp};
  store("planning-records.json",{schemaVersion:1,events:[event],taskPlans:[task,{...task,id:"events:event",source:{family:"events",id:"event"}}]});
  const board = await createBoard({id:"board",title:"Ideas"});
  const card = {...node,body:mark+" "+mark,notes:mark};
  const photo = {...node,id:"picture",kind:"object",body:mark,notes:mark,ref:{module:"media",objectType:"media_asset",objectId:"photo",label:"Photo",route:"/admin/media/photo"}};
  const saved = await updateBoard({...board,nodes:[card,photo]},board.revision);
  const result = await lookup();
  assert.deepEqual(result.unavailable,[]);
  const hrefs = result.items.map(row=>row.href).sort();
  assert.deepEqual(hrefs,["/admin/calendar?selected=event","/admin/notes/source","/admin/personal?task=standalone",
    "/admin/personal/canvas?board=board&card=card","/admin/personal/canvas?board=board&card=picture"].sort());
  const excerpt = result.items.find(item=>item.href==="/admin/notes/source").context;
  assert.match(excerpt,/Meet with Renamed about pricing/);
  assert.doesNotMatch(excerpt,/\/admin\//);
  assert.equal(fs.readFileSync(path.join(runtime,"finance.json"),"utf8"),JSON.stringify(finance));
  store("personal-records.json",[{...source,body:"See [Meeting](/admin/personal?task=events%3Aevent)"},literal,{...media,body:"Current "+mark}]);
  assert.deepEqual(await lookup("/admin/calendar?selected=event"),await lookup("/admin/personal?task=events%3Aevent"));
  assert.equal((await lookup("/admin/calendar?selected=event")).items[0].href,"/admin/notes/source");
  const afterMedia = (await lookup()).items.map(row=>row.href);
  assert.ok(afterMedia.includes("/admin/media/photo"));
  assert.ok(!afterMedia.includes("/admin/personal/canvas?board=board&card=picture"));
  await updateBoard({...saved,nodes:[photo]},saved.revision);
  store("personal-records.json",[literal,{...media,mediaCaptionEdited:true}]);
  store("planning-records.json",{schemaVersion:1,events:[],taskPlans:[]});
  assert.deepEqual((await lookup()).items,[]);
  const inherited = "objectives:roadmap:phase";
  store("projects.json",{...createEmptyProjectsState(),projects:[{id:"roadmap",name:"Roadmap "+mark,createdAt:stamp,updatedAt:stamp,
    objectives:[{id:"phase",text:"First phase",createdAt:stamp}]}]});
  store("planning-records.json",{schemaVersion:1,events:[{...event,title:"Event "+mark,description:""}],
    taskPlans:[{...task,title:"Task "+mark,description:""},{...task,id:inherited,source:{family:"objectives",projectId:"roadmap",id:"phase"}}]});
  const titles = (await lookup()).items;
  assert.deepEqual(titles.map(row=>[row.href,row.field]).sort(),[
    ["/admin/calendar?selected=event","Title"],["/admin/personal?task=standalone","Title"],
    ["/admin/projects/roadmap","Title"],["/admin/personal?task="+encodeURIComponent(inherited),"Notes"]].sort());
  store("planning-records.json",{schemaVersion:1,events:[],taskPlans:[]});
  store("projects.json",{schemaVersion:999});
  store("personal-records.json",[{...note,body:mark}]);
  const partial = await lookup();
  assert.ok(partial.unavailable.includes("Projects"));
  assert.equal(partial.items.length,1);
  console.log("Writing mentions passed authentication, read-only fallbacks, Markdown, aliases, canonical deduplication, live edits, removals and partial-source failures.");
}
async function providerChecks() {
  let version = "v1", body = mark, metadata = 0, documentReads = 0, failMetadata = false;
  global.fetch = async (input, options) => {
    const url = new URL(input);
    assert.equal(url.hostname,"fixture.invalid");
    assert.equal(options.method || "GET","GET");
    const query = url.searchParams;
    if (query.get("select") === "key,updated_at") {
      metadata++;
      assert.match(query.get("or"),/personal-records\.json/);
      return failMetadata ? Response.json({}, {status:500}) : Response.json([{key:"personal-records.json",updated_at:version}]);
    }
    documentReads++;
    if (query.get("key") === "eq.personal-records.json") return Response.json([{value:[{...note,body}],updated_at:version}]);
    return Response.json([]);
  };
  assert.equal((await ask(target)).status,401);
  assert.equal(metadata + documentReads,0);
  signedIn = true;
  const initial = await lookup();
  assert.deepEqual(initial.unavailable,[]);
  assert.equal(initial.items.length,1);
  const reads = documentReads;
  assert.ok(reads > 0);
  assert.equal((await lookup("/admin/notes/other")).items.length,0);
  assert.equal(documentReads,reads);
  assert.equal(metadata,2);
  body = ""; version = "v2";
  assert.deepEqual((await lookup()).items,[]);
  assert.ok(documentReads > reads);
  failMetadata = true; body = mark;
  assert.equal((await lookup()).items.length,1);
  console.log("Writing mention provider checks passed version-only warm lookups, invalidation, fallback and read-only access.");
}
(provider ? providerChecks() : main()).catch(error => {console.error(error);process.exitCode=1;}).finally(()=>{process.chdir(os.tmpdir());fs.rmSync(temp,{recursive:true,force:true});});
