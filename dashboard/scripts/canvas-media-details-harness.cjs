// Exercise the two metadata routes and the real record store against disposable fixture data.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ts = require("typescript");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-media-details-"));
Object.assign(process.env, { FREMEN_ACCOUNT_MEDIA_BACKEND:'filesystem-test',FREMEN_DATA_DIR: temp, FREMEN_REQUIRE_SUPABASE:"false", SUPABASE_URL:"", SUPABASE_SERVICE_ROLE_KEY:"" });
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop:true },
}).outputText, filename);
const session = require.resolve("../lib/admin-session.ts");
let signedIn = true;
require.cache[session] = { id:session,filename:session,loaded:true,exports:{hasAdminSession:async()=>signedIn} };
const chunks = require.resolve("../lib/modules/media/account-store.ts");
require.cache[chunks] = {id:chunks,filename:chunks,loaded:true,exports:{accountChunk:()=>assert.fail("Metadata edit touched file bytes")}};
const details = require("../app/api/media/details/route.ts");
const files = require("../app/api/media/files/route.ts");
const { readMediaFileRecords, createPersonalRecord, updatePersonalRecord } = require("../lib/personal-records-store.ts");
const { displayMediaDetails, linkedMediaId } = require("../components/canvas/useCanvasMediaDetails.ts");
const { canonicalVaultFields, readCanonicalMetadata } = require("../lib/local-first/canonical-record.ts");
function req(data, method="POST", csrf=true) {
  const headers = {"Content-Type":"application/json", cookie:"admin_csrf=test",...(csrf?{"x-csrf-token":"test"}:{})};
  return new Request("http://localhost/api/media/details",{method,headers,body:JSON.stringify(data)});
}
async function patch(item, changes) {
  return details.PATCH(req({id:item.id,expectedUpdatedAt:item.updatedAt,patch:changes},"PATCH"));
}
async function main() {
  const id=crypto.randomUUID(), manifest={format:"unigentamos-account-media-v1",mediaId:id,objectId:id,contentRoot:"a".repeat(64),digestAlgorithm:"sha256",fileName:"file.png",mimeType:"image/png",byteLength:12,chunkSize:1048576,totalChunks:1,createdAt:new Date().toISOString()};
  const profile={version:1, manifest, accountFile:{id,sha256:manifest.contentRoot,byteLength:12,chunkSize:1048576,totalChunks:1},linkedRefs:[],tags:["existing"],altText:"Original artwork"};
  const source={domain:"notes-docs",title:"File",className:"file"};
  const [account]=await createPersonalRecord({...source,mediaProfile:profile});
  await createPersonalRecord({...source,title:"Legacy reference"});
  await createPersonalRecord({...source,title:"Encrypted file",mediaProfile:{...profile,manifest:{...manifest,format:"unigentamos-vault-media-v1",digestAlgorithm:"chunk-root-v1"},accountFile:undefined}});
  const records=await readMediaFileRecords(), ids=records.map(record=>record.id);
  const index=async()=> (await (await details.POST(req({ids}))).json()).items;
  signedIn=false;
  assert.equal((await details.POST(req({ids}))).status,401);
  signedIn=true;
  assert.equal((await details.PATCH(req({},"PATCH",false))).status,403);
  assert.deepEqual((await index()).map(item=>item.storage).sort(),["account","reference","vault"]);
  for(const record of records) {
    const node={id:"placed",title:"Board title",body:"First ad",ref:{objectId:record.id,objectType:"media_asset",module:"media",label:record.title}};
    const [entry]=(await index()).filter(item=>item.id===record.id);
    assert.equal(linkedMediaId(node),record.id);
    assert.equal(displayMediaDetails(node,entry).body,"First ad");
    assert.equal(displayMediaDetails(node,entry).title,"Board title");
    const saved=await patch(entry,{title:"Shared "+record.title,body:"First ad",notes:"For the next review"});
    assert.equal(saved.status,200,await saved.clone().text());
    const canonical=(await saved.json()).item;
    assert.equal(displayMediaDetails(node,canonical).notes,"For the next review");
    assert.equal((await patch(entry,{notes:"Old draft"})).status,409);
    const clear=await patch(canonical,{body:""});
    assert.equal(clear.status,200);
    assert.equal(displayMediaDetails(node,(await clear.json()).item).body,"");
    const after=(await readMediaFileRecords()).find(row=>row.id===record.id);
    assert.equal(after.mediaNotes,"For the next review");
    assert.deepEqual(after.mediaProfile,record.mediaProfile);
    if(record.mediaProfile){
      const edit=await files.POST(req({action:"edit",recordId:record.id,expectedUpdatedAt:after.updatedAt,mediaNotes:"From Media"}));
      assert.equal(edit.status,200,await edit.clone().text());
      const seen=(await index()).find(item=>item.id===record.id);
      assert.equal(seen.notes,"From Media");
      assert.equal(seen.title,canonical.title);
      assert.equal(seen.body,"");
    }
  }
  const rows=await readMediaFileRecords(),sample=rows.find(r=>r.id===account.id);
  const fields=canonicalVaultFields({module:"personal-records",collection:"file",record:sample});
  assert.equal(fields.mediaNotes,"From Media");
  const metadata=readCanonicalMetadata(fields);
  metadata.editableFields=metadata.editableFields.filter(f=>f.key!=="mediaNotes");
  assert(readCanonicalMetadata(fields).editableFields.some(f=>f.key==="mediaNotes"));
  assert.equal((await Promise.allSettled([1,2].map(n=>updatePersonalRecord(sample.id,{mediaNotes:"edit "+n},{expectedUpdatedAt:sample.updatedAt})))).filter(result=>result.status==="fulfilled").length,1);
  console.log("PASS account, Vault and legacy Media metadata round trips, original identity, board captions, explicit clears, permission checks and concurrent edit protection.");
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(temp,{recursive:true,force:true}));
