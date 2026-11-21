/* Exercise source identity, legacy discovery and bounded provider reads using only fixtures. */
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const ts = require("typescript");
const temp = fs.mkdtempSync(path.join(os.tmpdir(),"canvas-placement-"));
Object.assign(process.env,{FREMEN_DATA_DIR:temp,FREMEN_REQUIRE_SUPABASE:"false",SUPABASE_URL:"",SUPABASE_SERVICE_ROLE_KEY:""});
require.extensions[".ts"] = (module,filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,filename);
const session = require.resolve("../lib/admin-session.ts");
let signedIn = true;
require.cache[session] = {id:session,filename:session,loaded:true,exports:{hasAdminSession:async()=>signedIn}};
const {store, placements, endpoint} = {
  store:require("../lib/modules/canvas/store.ts"),
  placements:require("../lib/modules/canvas/placements.ts"),
  endpoint:require("../app/api/personal/canvas/placements/route.ts")
};
const {sourceObjectId} = require("../lib/modules/canvas/source-reference.ts");
const {canvasWorkspaceLink} = require("../lib/modules/canvas/object-link.ts");
const ref = (module,objectType,objectId,route) => ({module,objectType,objectId,route,label:"Source"});
const link = (module,route) => ref(module,"workspace_link",route,route);
const node = (id,ref) => ({id,kind:"object",title:id,ref,body:"",color:"blue",group:"",used:false,x:0,y:0,width:200,height:120});
const request = search => endpoint.GET(new Request("http://localhost/api/personal/canvas/placements?"+search));
async function all(module,ids) {
  let after = null;
  const found = [];
  do {
    const page = await placements.boardPlacements(module,ids,after);
    found.push(...page.placements);
    after = page.next;
  } while (after);
  return found;
}

async function main() {
  const media = ref("media","asset","photo","/admin/media/photo");
  const notes = link("notes","/admin/notes?note=note%252F1&item=attachment");
  const project = link("projects","/admin/projects/OLD%20NAME?tab=links");
  assert.equal(sourceObjectId(notes),"note%2F1");
  assert.equal(sourceObjectId(link("media","/admin/media/in-use?asset=photo")),"photo");
  assert.equal(sourceObjectId(link("media","/admin/media/duplicates?selected=case")),undefined);
  assert.equal(sourceObjectId(link("projects","/admin/projects/native?tab=timeline&item=child")),undefined);
  assert.equal(sourceObjectId({...media,module:"notes"}),undefined);
  assert.equal(canvasWorkspaceLink(notes.route,"http://localhost").route,notes.route);
  const board = await store.createBoard({id:"b0",title:"Inspiration"});
  const nodes = [node("ad",media),node("copy",link("media","/admin/media?selected=vault-id")),node("ref",notes),node("plan",project)];
  let saved = await store.updateBoard({...board,nodes},1);
  const filename = path.join(temp,"personal-canvas-board-b0.json");
  let old = JSON.parse(fs.readFileSync(filename));
  assert.equal(old.sourceIndexVersion,1);
  delete old.sourceIndex; delete old.sourceIndexVersion;
  fs.writeFileSync(filename,JSON.stringify(old));
  assert.deepEqual((await all("media",["photo","vault-id"])).map(row=>row.cardId).sort(),["ad","copy"]);
  assert.deepEqual((await all("notes",["note%2F1"])).map(row=>row.cardId),["ref"]);
  assert.deepEqual((await all("projects",["native","slug","old name"])).map(row=>row.cardId),["plan"]);
  saved = await store.updateBoard({...saved,title:"Renamed",nodes:[nodes[1],nodes[2]]},saved.revision);
  assert.deepEqual(await all("media",["photo","vault-id"]),[{boardId:"b0",boardTitle:"Renamed",cardId:"copy",cardNumber:1}]);
  for (let i=1; i<=5; i++) {
    const board = await store.createBoard({id:"b"+i,title:"Board "+i});
    await store.updateBoard({...board,nodes:[node("card",media)]},1);
  }
  assert.equal((await all("media",["photo"])).length,5);
  assert.equal((await request("module=notes&id=a&after=../b")).status,400);
  assert.equal((await request("module=media")).status,400);
  assert.equal((await request("module=other&id=a")).status,400);
  signedIn = false;
  assert.equal((await request("module=media&id=photo")).status,401);
  signedIn = true;
  assert.equal((await request("module=media&id=photo")).headers.get("cache-control"),"private, no-store");
  if (process.argv.includes("--browser")) await require("./canvas-placements-browser.cjs")({temp,store,node,ref,link});

  // Mock only the provider transport. An indexed result must never request a
  // board body. The second read for a legacy result is cached by board revision.
  Object.assign(process.env,{SUPABASE_URL:"http://fixture.test",SUPABASE_SERVICE_ROLE_KEY:"fixture"});
  for (const name of ["../lib/file-store.ts","../lib/modules/canvas/placements.ts"]) delete require.cache[require.resolve(name)];
  const {boardPlacements} = require("../lib/modules/canvas/placements.ts");
  const fetch = global.fetch;
  let documentReads = 0;
  global.fetch = async input => {
    const url = new URL(input);
    assert.equal(url.origin,"http://fixture.test");
    const p = url.searchParams;
    if (p.get("select") === "value,updated_at") {
      documentReads++;
      assert.equal(p.get("key"),"eq.personal-canvas-board-b0.json");
      return Response.json([{value:old,updated_at:"2026-01-01T00:00:00Z"}]);
    }
    assert.equal(p.get("limit"),"4");
    assert.match(p.get("select"),/hits0:value->sourceIndex->s[a-f\d]{64}/);
    assert.match(p.get("or"),/value->sourceIndexVersion.is.null/);
    assert(!p.get("select").includes("value->board"));
    return Response.json([
      {key:"personal-canvas-board-b0.json",id:"b0",title:"Old",revision:2,indexed:null,hits0:null},
      {key:"personal-canvas-board-b1.json",id:"b1",title:"Indexed",revision:2,indexed:1,hits0:[["card",2]]}
    ]);
  };
  try {
    for (let i=0;i<2;i++) assert.deepEqual((await boardPlacements("media",["photo"],null)).placements.map(row=>row.cardId),["ad","card"]);
    assert.equal(documentReads,1);
  } finally { global.fetch = fetch; }
  console.log("Passed canvas placement lookup, paging, aliases, removal, rename, authentication and provider projection checks.");
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(temp,{recursive:true,force:true}));
