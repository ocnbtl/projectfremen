/** Simulate client edits, retries and competing tabs against an in-memory CAS API. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}
}).outputText, filename);
const { BoardSession } = require("../components/canvas/board-session.ts");
const start = {id:"one", title:"Ad inspiration",folder:"Creative",updatedAt:"2026-01-01T00:00:00Z",revision:1,nodes:[],edges:[],views:[]};
const records = new Map([[start.id,structuredClone(start)]]);
let calls=0, hold, entered, offline=false, loseResponse=false;
global.fetch=async (url,init) => {
  const req=init.body && JSON.parse(init.body);
  const respond=(status,data)=>new Response(JSON.stringify(data),{status});
  if (offline) throw Error("Offline");
  if (init.method==="GET") return respond(200,{ok:true,board:records.get(new URL(url,"http://localhost").searchParams.get("id"))});
  if (init.method==="POST") {
    if(!records.has(req.id))records.set(req.id,{...start,...req});
    return respond(200,{ok:true,board:records.get(req.id)});
  }
  calls++;
  if (hold) { const p=hold;hold=null;entered();await p; }
  const prev=records.get(req.board.id);
  if(prev.revision!==req.expectedRevision)return respond(409,{ok:false,error:"Conflict"});
  const board={...req.board,revision:prev.revision+1};
  records.set(board.id,board);
  if(loseResponse){loseResponse=false;throw Error("Response lost");}
  return respond(200,{ok:true,board});
};
(async()=>{
  const session=new BoardSession(structuredClone(start),()=>{});
  let resume;
  const ready=new Promise(resolve=>{entered=resolve});
  hold=new Promise(resolve=>{resume=resolve});
  session.edit({...session.board,title:"First edit"});
  const firstSave=session.flush();
  await ready;
  session.edit({...session.board,title:"Second edit"});
  const concurrent=session.flush();
  resume();
  assert(await firstSave);assert(await concurrent);assert.equal(calls,2);
  assert.equal(records.get("one").title,"Second edit");assert(!session.dirty);
  loseResponse=true;
  session.edit({...session.board,title:"Resolved retry"});
  assert.equal(await session.flush(),false);
  assert(await session.flush());assert(!session.conflict);assert(!session.dirty);
  offline=true;session.edit({...session.board,title:"Offline draft"});
  assert.equal(await session.flush(),false);assert.equal(session.board.title,"Offline draft");assert(session.dirty);
  offline=false;assert(await session.flush());
  const other={...records.get("one"),title:"Another tab",revision:session.board.revision+1};
  records.set("one",other);
  session.edit({...session.board,title:"My edits"});
  assert.equal(await session.flush(),false);assert(session.conflict);assert(session.dirty);
  const copy=await session.saveCopy();
  assert.notEqual(copy.id,"one");assert.equal(copy.title,"My edits (copy)");
  assert.deepEqual(records.get("one"),other);
  const retriedCopy=await session.saveCopy();
  assert.equal(retriedCopy.id,copy.id);assert.equal(records.size,2);
  console.log("PASS serial saves, edits in flight, offline retry, lost acknowledgment, independent tabs and idempotent conflict recovery.");
})().catch(error=>{console.error(error);process.exitCode=1;});
