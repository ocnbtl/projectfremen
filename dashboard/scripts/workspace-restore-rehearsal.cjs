// Offline only. The target must be new. No provider credentials are read.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { PGlite } = require("@electric-sql/pglite");
const digest = data => crypto.createHash("sha256").update(data).digest("hex");
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const sha = /^[0-9a-f]{64}$/;
function check(ok,message){if(!ok)throw Error(message);}
function catalog(rows) {
  check(Array.isArray(rows)&&rows.every(row=>typeof row.key==="string"&&row.value!==undefined),"Invalid app_state export.");
  const records=rows.find(row=>row.key==="personal-records.json")?.value;
  check(Array.isArray(records),"The personal records document is missing.");
  const entries=[], aliases=new Set(), fileIds=new Set();
  for (const record of records) {
    const profile=record.mediaProfile, file=profile?.accountFile;
    if(!file){check(profile?.manifest?.format!=="unigentamos-account-media-v1","Account manifest is missing its original.");continue;}
    const manifest=profile.manifest;
    check(uuid.test(file.id)&&uuid.test(manifest?.mediaId)&&uuid.test(manifest?.objectId)&&typeof record.id==="string"&&record.id.length>0
      && Number.isSafeInteger(file.byteLength)&&file.byteLength>0&&file.byteLength<=268435456&&file.chunkSize===1048576
      && file.totalChunks===Math.ceil(file.byteLength/file.chunkSize)&&sha.test(file.sha256)&&manifest.byteLength===file.byteLength,
      "Invalid account file metadata.");
    const names=new Set([record.id,manifest.mediaId,manifest.objectId]);
    check(!fileIds.has(file.id)&&[...names].every(name=>!aliases.has(name)),"Duplicate stable identity. Resolve before staging.");
    fileIds.add(file.id); for(const name of names)aliases.add(name);
    if(manifest.format==="unigentamos-account-media-v1")check(manifest.contentRoot===file.sha256,"Manifest hash mismatch.");
    entries.push({recordId:record.id,mediaId:manifest.mediaId,objectId:manifest.objectId,fileId:file.id,sha256:file.sha256,
      bytes:file.byteLength,chunks:file.totalChunks,name:manifest.fileName,mime:manifest.mimeType});
  }
  return entries.sort((a,b)=>a.recordId.localeCompare(b.recordId));
}
async function checkedChunks(directory,entry,copyTo){
  const base=await fs.realpath(directory), hasher=crypto.createHash("sha256");
  const target=copyTo&&path.join(copyTo,entry.fileId);
  if(target)await fs.mkdir(target);
  for(let i=0;i<entry.chunks;i++){
    const part=path.join(base,entry.fileId,String(i)), actual=await fs.realpath(part);
    check(path.relative(base,actual)===path.join(entry.fileId,String(i)),"Unexpected chunk path.");
    const size=Math.min(1048576,entry.bytes-i*1048576);
    check((await fs.stat(actual)).size===size,"Incomplete original "+entry.recordId);
    const bytes=await fs.readFile(actual);
    check(bytes.length===size,"Original changed during read.");
    hasher.update(bytes);
    if(target)await fs.writeFile(path.join(target,String(i)),bytes,{flag:"wx",mode:0o600});
  }
  check(hasher.digest("hex")===entry.sha256,"Original failed SHA-256 verification: "+entry.recordId);
}
async function rehearse({rowsPath,mediaDir,baselinePath,baselineDigest,workspaceId,ownerId,destination}) {
  check(uuid.test(workspaceId)&&uuid.test(ownerId),"Supply the intended isolated workspace and owner UUIDs.");
  const expectedBytes=await fs.readFile(baselinePath);
  check(sha.test(baselineDigest)&&digest(expectedBytes)===baselineDigest,"Independent inventory fingerprint mismatch.");
  const baseline=JSON.parse(expectedBytes);
  const rowsBytes=await fs.readFile(rowsPath);
  check(baseline.format==="unigentamos-account-inventory-v1"&&baseline.appStateSha256===digest(rowsBytes),"Database snapshot does not match the inventory.");
  const rows=JSON.parse(rowsBytes), entries=catalog(rows);
  check(baseline.originals?.length===entries.length&&entries.length>0,"Original count does not match the inventory.");
  const expected=new Map(baseline.originals.map(e=>[e.recordId,e]));
  for(const entry of entries)for(const key of ["recordId","mediaId","objectId","fileId","sha256","bytes"])
    check(entry[key]===expected.get(entry.recordId)?.[key],"Independent inventory mismatch for "+entry.recordId);
  const target=path.resolve(destination);
  // A failed or previous rehearsal must be retained for inspection, never overwritten.
  await fs.mkdir(target,{mode:0o700});
  const library=path.join(target,"account-media"), database=path.join(target,"database");
  await fs.mkdir(library,{mode:0o700});
  let db=new PGlite(database);
  try{
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key,email text,encrypted_password text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz); create table restored_documents(workspace_id uuid not null,key text not null,value jsonb not null,primary key(workspace_id,key)); alter table restored_documents enable row level security");
    const migrationDir=path.resolve(__dirname,"../supabase/migrations");
    for(const suffix of ["account_workspace_identity.sql","workspace_record_permissions.sql","workspace_media.sql","workspace_storage_ledger.sql"]){
      const name=(await fs.readdir(migrationDir)).find(file=>file.endsWith(suffix));
      await db.exec(await fs.readFile(path.join(migrationDir,name),"utf8"));
    }
    await db.transaction(async tx=>{
      await tx.query("insert into auth.users(id) values($1)",[ownerId]);
      await tx.query("insert into account_workspaces(id,owner_id,name) values($1,$2,'Isolated restore')",[workspaceId,ownerId]);
      await tx.query("insert into account_workspace_members(workspace_id,user_id,role) values($1,$2,'owner')",[workspaceId,ownerId]);
      await tx.query("insert into account_workspace_storage(workspace_id,included_bytes) values($1,0)",[workspaceId]);
      for(const row of rows)await tx.query("insert into restored_documents values ($1,$2,$3)",[workspaceId,row.key,JSON.stringify(row.value)]);
      for(const entry of entries){
        await checkedChunks(mediaDir,entry,library);
        await tx.query("insert into account_workspace_media(workspace_id,owner_id,record_id,media_id,object_id,source_file_id,audience,backend,state,file_name,mime_type,byte_length,chunk_size,sha256) values($1,$2,$3,$4,$5,$6,'private','supabase','ready',$7,$8,$9,1048576,$10)",[workspaceId,ownerId,entry.recordId,entry.mediaId,entry.objectId,entry.fileId,entry.name,entry.mime,entry.bytes,entry.sha256]);
      }
    });
  }finally{await db.close();}
  db=new PGlite(database);
  try{
    const restored=(await db.query("select key,value from restored_documents where workspace_id=$1",[workspaceId])).rows;
    const restoredEntries=catalog(restored);
    check(JSON.stringify(restoredEntries)===JSON.stringify(entries),"Restored database identities differ.");
    for(const entry of restoredEntries){
      const match=await db.query("select 1 from account_workspace_media where workspace_id=$1 and owner_id=$2 and record_id=$3 and media_id=$4 and object_id=$5 and source_file_id=$6 and sha256=$7 and audience='private' and backend='supabase'",[workspaceId,ownerId,entry.recordId,entry.mediaId,entry.objectId,entry.fileId,entry.sha256]);
      check(match.rows.length===1,"Restored media link could not be resolved.");
      await checkedChunks(library,entry);
    }
    const usage=(await db.query("select sum(used_delta) as bytes,sum(reserved_delta) as pending from account_storage_events where workspace_id=$1",[workspaceId])).rows[0];
    check(Number(usage.bytes)===entries.reduce((n,e)=>n+e.bytes,0)&&Number(usage.pending)===0,"Restored storage accounting differs.");
    await db.query("insert into account_workspace_restore_checks values($1,now(),$2,$3,$4)",[workspaceId,baselineDigest,entries.length,rows.length]);
  }finally{await db.close();}
  const aliases=new Set(entries.flatMap(e=>[e.recordId,e.objectId,e.mediaId]));
  const accountLinks=[],otherLinks=[];
  function inspect(ref,source){
    if(ref?.module!=="media")return;
    let id=ref.objectId;
    if(ref.objectType==="workspace_link"&&ref.route){
      const url=new URL(ref.route,"https://workspace.invalid");
      if(url.origin==="https://workspace.invalid")id=url.searchParams.get("selected")||url.searchParams.get("asset")||id;
    }
    (aliases.has(id)?accountLinks:otherLinks).push({source,id});
  }
  for(const row of rows){
    if(row.key.startsWith("personal-canvas-board-"))for(const node of row.value.board?.nodes||[])inspect(node.ref,{board:row.value.board.id,card:node.id});
    if(row.key==="note-links.json")for(const link of row.value.links||[])if(link.state!=="removed")inspect(link.targetRef,{note:link.noteRef?.objectId,link:link.id});
  }
  await fs.writeFile(path.join(target,"link-inventory.json"),JSON.stringify({verifiedAccountMedia:accountLinks,requiresReview:otherLinks},null,2),{flag:"wx",mode:0o600});
  const receipt={format:"unigentamos-offline-rehearsal-v1",workspaceId,ownerId,verifiedAt:new Date().toISOString(),baselineDigest,
    verifiedMediaLinks:accountLinks.length,mediaLinksRequiringReview:otherLinks.length,
    documents:rows.length,originals:entries.length,bytes:entries.reduce((n,e)=>n+e.bytes,0)};
  await fs.writeFile(path.join(target,"verified.json"),JSON.stringify(receipt,null,2),{flag:"wx",mode:0o600});
  return receipt;
}
module.exports={rehearse,catalog};
if(require.main===module){
  const [rowsPath,mediaDir,baselinePath,baselineDigest,workspaceId,ownerId,destination]=process.argv.slice(2);
  if(!destination){console.error("Usage: node scripts/workspace-restore-rehearsal.cjs app-state.json account-media inventory.json inventory-sha256 workspace-uuid owner-uuid NEW-DIRECTORY");process.exitCode=2;}
  else rehearse({rowsPath,mediaDir,baselinePath,baselineDigest,workspaceId,ownerId,destination}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
