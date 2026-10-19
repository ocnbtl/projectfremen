/* Isolated photo storage: source preservation, repeat edits, crop geometry and stale edits. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),ts=require('typescript'),sharp=require('sharp');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'fremen-photo-edit-'));
Object.assign(process.env,{FREMEN_DATA_DIR:data,SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',FREMEN_REQUIRE_SUPABASE:'false'});
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const {writePeopleProfilePhoto,readPeopleProfilePhoto,cropPeopleProfilePhoto,removePeopleProfilePhoto}=require('../lib/modules/people/profile-photos.ts');
(async()=>{
const id='personal-00000000-0000-4000-8000-000000000001';
const original=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="400" height="400" fill="red"/><rect x="400" width="400" height="400" fill="blue"/></svg>')).png().toBuffer();
const initial=await writePeopleProfilePhoto(id,'image/png',original);
const centered={zoom:1,panX:0,panY:0,outputSize:512};
const crop=await cropPeopleProfilePhoto(id,{...centered,zoom:2,panX:-1},initial.updatedAt);
assert.equal(crop.source.bytesBase64,original.toString('base64'));
const pixel=await sharp(Buffer.from(crop.bytesBase64,'base64')).raw().toBuffer();assert(pixel[0]>240 && pixel[2]<15,'left crop is red');
await assert.rejects(()=>cropPeopleProfilePhoto(id,centered,initial.updatedAt),/picture changed/);
const reset=await cropPeopleProfilePhoto(id,centered,crop.updatedAt);
const expected=await sharp(original).extract({left:200,top:0,width:400,height:400}).resize(512,512).webp({quality:90}).toBuffer();
assert.equal(reset.bytesBase64,expected.toString('base64'),'reset uses original rather than recropping');
assert.equal(reset.source.bytesBase64,crop.source.bytesBase64);
const edits=await Promise.allSettled([cropPeopleProfilePhoto(id,{...centered,zoom:2},reset.updatedAt),cropPeopleProfilePhoto(id,{...centered,panX:1},reset.updatedAt)]);
assert.equal(edits.filter(x=>x.status==='fulfilled').length,1,'stale parallel edit rejected');
for(const invalid of [{...centered,zoom:Infinity},{...centered,panX:2},{...centered,outputSize:999},{...centered,zoom:'2'}])await assert.rejects(()=>cropPeopleProfilePhoto(id,invalid,reset.updatedAt),/Invalid picture crop/);
const transparent=await sharp({create:{width:100,height:100,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();
const replacement=await cropPeopleProfilePhoto(id,centered,undefined,{mimeType:'image/png',bytes:transparent});
assert.equal(replacement.source.bytesBase64,transparent.toString('base64'));assert.equal((await sharp(Buffer.from(replacement.bytesBase64,'base64')).stats()).isOpaque,false);
await removePeopleProfilePhoto(id);assert.equal(await readPeopleProfilePhoto(id),null);
console.log('Passed: legacy crop, original retention, reset, concurrency, validation, replacement, transparency and removal.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>fs.rmSync(data,{recursive:true,force:true}));
