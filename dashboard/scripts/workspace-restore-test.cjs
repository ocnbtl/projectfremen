const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const os=require("node:os");
const fs=require("node:fs/promises");
const path=require("node:path");
const {rehearse}=require("./workspace-restore-rehearsal.cjs");
const hash=data=>crypto.createHash("sha256").update(data).digest("hex");
async function run(){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),"fremen-restore-"));
  try{
    const originals=[],records=[],mediaDir=path.join(temp,"account-media");
    await fs.mkdir(mediaDir);
    for(let i=0;i<63;i++){
      const fileId=crypto.randomUUID(), mediaId=crypto.randomUUID(),objectId=crypto.randomUUID(),recordId="stable-"+i;
      const bytes=crypto.randomBytes(i===0?1048589:15+i),sha256=hash(bytes),chunks=Math.ceil(bytes.length/1048576);
      await fs.mkdir(path.join(mediaDir,fileId));
      for(let p=0;p<chunks;p++)await fs.writeFile(path.join(mediaDir,fileId,String(p)),bytes.subarray(p*1048576,(p+1)*1048576));
      originals.push({recordId,mediaId,objectId,fileId,sha256,bytes:bytes.length});
      records.push({id:recordId,mediaProfile:{manifest:{format:"unigentamos-account-media-v1",contentRoot:sha256,mediaId,objectId,byteLength:bytes.length,fileName:"photo",mimeType:"image/jpeg"},
        accountFile:{id:fileId,sha256,byteLength:bytes.length,chunkSize:1048576,totalChunks:chunks}}});
    }
    const boardId=crypto.randomUUID();
    const rows=JSON.stringify([{key:"personal-records.json",value:records},{key:"personal-canvas-board-"+boardId+".json",value:{board:{id:boardId,nodes:[{id:"ad",ref:{module:"media",objectType:"media_asset",objectId:records[0].id}}]}}},
      {key:"note-links.json",value:{links:[{id:"l1",state:"active",noteRef:{objectId:"n1"},targetRef:{module:"media",objectId:originals[0].objectId}},
        {id:"l2",state:"active",noteRef:{objectId:"n1"},targetRef:{module:"media",objectId:"device-only-reference"}}]}}]);
    const baseline=JSON.stringify({format:"unigentamos-account-inventory-v1",appStateSha256:hash(rows),originals});
    const args={rowsPath:path.join(temp,"db.json"),mediaDir,baselinePath:path.join(temp,"baseline.json"),baselineDigest:hash(baseline),workspaceId:crypto.randomUUID(),ownerId:crypto.randomUUID(),destination:path.join(temp,"restore")};
    await fs.writeFile(args.rowsPath,rows);await fs.writeFile(args.baselinePath,baseline);
    const receipt=await rehearse(args);
    assert.equal(receipt.originals,63);assert.equal(receipt.documents,3);assert.equal(receipt.verifiedMediaLinks,2);assert.equal(receipt.mediaLinksRequiringReview,1);
    await assert.rejects(rehearse(args),/EEXIST/);
    await fs.writeFile(path.join(mediaDir,originals[0].fileId,"1"),Buffer.alloc(13));
    await assert.rejects(rehearse({...args,destination:path.join(temp,"corrupt")}),/SHA-256/);
    await assert.rejects(fs.access(path.join(temp,"corrupt","verified.json")));
    await assert.rejects(rehearse({...args,baselineDigest:"f".repeat(64)}),/fingerprint/);
    console.log("Restored 63 synthetic originals and linked documents into a fresh database, reopened and rehashed the independent copy. Corruption, a changed inventory and overwrite attempts were rejected.");
  }finally{await fs.rm(temp,{recursive:true,force:true});}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
