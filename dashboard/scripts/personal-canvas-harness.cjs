/* Canvas model and persistence checks. Run against a fresh local data directory. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ts = require("typescript");
const data = fs.mkdtempSync(path.join(os.tmpdir(), "personal-canvas-"));
Object.assign(process.env, { FREMEN_DATA_DIR: data, SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", FREMEN_REQUIRE_SUPABASE: "false" });
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022, esModuleInterop:true}
}).outputText, filename);

const {createBoard,getBoard,listBoardSummaries,updateBoard} = require("../lib/modules/canvas/store.ts");
const {boardSummary,boardContents} = require("../lib/modules/canvas/model.ts");
const groups = [
  ["Static ad inspiration", "media", "asset", "/admin/media/"],
  ["Project handoff", "projects", "project", "/admin/projects/"],
  ["Research synthesis", "notes", "note", "/admin/notes/"],
  ["Event guest mapping", "people", "person", "/admin/people/"],
  ["Payment review", "finance", "transaction", "/admin/finance/transactions?selected="],
];
const object = (i, useCase) => ({
  id:"card-"+i,kind:"object",x:(i%8)*260-500,y:Math.floor(i/8)*220-150,width:230,height:180,
  color:["amber","blue","#f5a687","rose"][i%4],title:"Reference "+i,body:"",group:i%2?"In review":"Ideas",used:false,
  ref:{module:useCase[1],objectType:useCase[2],objectId:"item-"+i,label:"Original "+i,route:useCase[3]+"item-"+i}
});

async function checkSummaryPagination(summaries){
  // Exercise the cloud query builder locally, including an index-size boundary.
  const keys=Array.from({length:105},(_,i)=>"personal-canvas-board-"+String(i).padStart(4,"0")+".json");
  const original=global.fetch;
  let queries=0;
  Object.assign(process.env,{SUPABASE_URL:"http://fixture.test",SUPABASE_SERVICE_ROLE_KEY:"local-fixture-only"});
  delete require.cache[require.resolve("../lib/file-store.ts")];
  global.fetch=async (input,options)=>{
    const url=new URL(input);
    assert.equal(url.hostname,"fixture.test");
    assert.equal(url.pathname,"/rest/v1/app_state");
    assert.equal(url.searchParams.get("select"),"key,summary:value->summary");
    assert.equal(url.searchParams.get("order"),"key.asc");
    assert.equal(url.searchParams.get("key"),"like.personal-canvas-board-*.json");
    assert.equal(options.cache,"no-store");
    queries++;
    const after=url.searchParams.getAll("key").find(t=>t.startsWith("gt."))?.slice(3) || "";
    const slice=keys.filter(k=>k>after).slice(0,Number(url.searchParams.get("limit")));
    return Response.json(slice.map(key=>({key,summary:{...summaries[0],id:key}})));
  };
  try {
    const rows=await require("../lib/file-store.ts").listJsonFileSummaries("personal-canvas-board-");
    assert.deepEqual(rows.map(r=>r.id),keys);
    assert.equal(queries,2);
  } finally {global.fetch=original;}
}

async function main(){
  const boards = [];
  for(const useCase of groups){
    const created = await createBoard({title:useCase[0],folder:"Planning"});
    assert.equal((await createBoard({...created})).revision,1);
    const nodes = Array.from({length:40},(_,i)=>object(i,useCase));
    nodes.push({id:"summary",kind:"sticky",x:-700,y:-420,width:260,height:170,title:"Next steps",body:"Review the shortlist",group:"",color:"yellow",used:false});
    const edges = nodes.slice(1,8).map((node,i)=>({id:"link-"+i,source:nodes[i].id,target:node.id,style:["solid","dashed","dotted"][i%3],symbol:["arrow","circle","none"][i%3],label:"Related"}));
    const saved = await updateBoard({...created,nodes,edges,views:[{id:"detail",name:"Shortlist",x:-30,y:20,zoom:1.8}]},1);
    assert.deepEqual(saved,await getBoard(created.id));
    assert.deepEqual(saved,await updateBoard(saved,1),"response-loss retry");
    boards.push(saved);
  }
  const summaries = await listBoardSummaries();
  assert.equal(summaries.length,5);
  for(const summary of summaries){
    assert.equal(summary.nodeCount,41);
    assert.equal(summary.edgeCount,7);
    assert.equal(summary.viewCount,1);
    assert.equal(summary.preview.length,20);
    assert(!("nodes" in summary));
    for(const r of summary.preview) assert(r.x>=0&&r.y>=0&&r.x+r.width<=100.02&&r.y+r.height<=100.02);
  }
  let interactions = 0;
  for(let j=0;j<boards.length;j++){
    let board = boards[j];
    const sourceRoutes = board.nodes.map(n=>n.ref?.route);
    for(let i=0;i<400;i++){
      const index=(i*17+j)%40;
      const node=board.nodes[index];
      switch(i%5){
        case 0: node.x+=12;node.y-=5;break;
        case 1: node.group=i%3?"Shortlist":"Ready";break;
        case 2: node.body="Annotation "+i;break;
        case 3: node.used=!node.used;break;
        case 4: board.views[0]={...board.views[0],zoom:0.5+(i%7)/2,x:-i*4,y:i*2};break;
      }
      board={...board,...boardContents(board)};
      assert.equal(boardSummary(board).nodeCount,41);
      interactions++;
    }
    const saved=await updateBoard(board,board.revision);
    assert.deepEqual(saved.nodes.map(n=>n.ref?.route),sourceRoutes);
    assert.deepEqual((await getBoard(saved.id)).views,board.views);
  }
  const base=await getBoard(boards[0].id);
  const race=await Promise.allSettled(["Window one","Window two"].map(title=>updateBoard({...base,title},base.revision)));
  assert.equal(race.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(race.find(r=>r.status==="rejected").reason.status,409);
  const current=await getBoard(base.id);
  const invalid = [
    {...current,nodes:[...current.nodes,current.nodes[0]]},
    {...current,edges:[{...current.edges[0],source:"missing"}]},
    {...current,views:[{...current.views[0],zoom:0}]},
    {...current,nodes:[{...current.nodes[0],x:Infinity}]},
    {...current,nodes:[{...current.nodes[0],ref:{...current.nodes[0].ref,route:"https://outside.example"}}]},
    {...current,nodes:[{...current.nodes[0],ref:{...current.nodes[0].ref,route:"/admin/media/../finance"}}]},
  ];
  for(const draft of invalid) await assert.rejects(updateBoard(draft,current.revision), e=>e.status===400);
  assert.deepEqual(await getBoard(base.id),current,"invalid saves are atomic");
  await assert.rejects(getBoard("../not-a-board"), e=>e.status===400);
  await assert.rejects(getBoard("nonexistent"), e=>e.status===404);
  await checkSummaryPagination(summaries);
  console.log("PASS",interactions,"model interactions across 5 board scenarios; durable round trips, lightweight previews, stable source links, conflicts, retries, invalid inputs and paginated cloud summary queries against a local stub.");
}
main().catch(error=>{console.error(error);process.exitCode=1});
