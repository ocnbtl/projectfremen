const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ts = require("typescript");
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "writing-links-"));
Object.assign(process.env, { FREMEN_DATA_DIR:fixture, FREMEN_REQUIRE_SUPABASE:"false", SUPABASE_URL:"", SUPABASE_SERVICE_ROLE_KEY:"" });
require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"), {
  compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022, esModuleInterop:true}
}).outputText, filename);
const {objectToken,skillToken,parseWriting,writingPlainText,writingContext,writingDestination} = require("../lib/writing/tokens.ts");
const session = require.resolve("../lib/admin-session.ts");
let signedIn = false;
require.cache[session] = { id:session, filename:session, loaded:true, exports:{hasAdminSession:async()=>signedIn} };
const { GET } = require("../app/api/admin/writing-objects/route.ts");
async function main() {
  const label = "Yū [Studio] \\ Works";
  const token = objectToken({module:"projects",label,route:"/admin/projects/local(test)"});
  const [ref] = parseWriting(token);
  assert.equal(ref.kind,"object");
  assert.equal(ref.label,label);
  assert.equal(ref.href,"/admin/projects/local%28test%29");
  assert.equal(writingPlainText("Visit "+token),"Visit "+label);
  for (const route of ["https://elsewhere.example/x","//elsewhere.example","/admin/people/../../api/test","/admin/people/%2e%2e/%2e%2e/api","/admin/people\\outside"]) assert.equal(writingDestination("Name",route),null);
  const heading = skillToken({id:"brand",name:"Brand [voice]",behavior:"collection"});
  const copy = skillToken({id:"clip",name:"Copy voice",behavior:"copy"});
  assert.equal(parseWriting(copy)[0].action,"copy");
  const passage = heading+" Use "+token+"\n\nSecond line.\n"+copy+"\n"+heading+" Next passage";
  assert.equal(writingContext(passage,passage.indexOf(copy)),"Use "+label+"\n\nSecond line.");
  const denied = await GET();
  assert.equal(denied.status,401);
  signedIn = true;
  const record = {domain:"notes-docs",className:"prompt",title:"Local prompt",body:"Private body absent from catalog",status:"active",createdAt:"2026-11-01T12:00:00Z",updatedAt:"2026-11-01T12:00:00Z"};
  fs.writeFileSync(path.join(fixture,"personal-records.json"),JSON.stringify([{...record,id:"a"}, {...record,id:"b",archivedAt:record.updatedAt}]));
  const result = await GET();
  assert.equal(result.headers.get("cache-control"),"private, no-store");
  const data = await result.json();
  assert.equal(data.incomplete,false);
  assert.ok(data.items.some(row=>row.route==="/admin/notes/a"));
  assert.ok(!data.items.some(row=>row.route==="/admin/notes/b"));
  assert.ok(!JSON.stringify(data).includes(record.body));
  console.log("Passed writing link round trips, portable skill behavior, prompt boundaries and authenticated object lookup.");
}
main().finally(()=>fs.rmSync(fixture,{recursive:true,force:true})).catch(error=>{console.error(error);process.exitCode=1});
