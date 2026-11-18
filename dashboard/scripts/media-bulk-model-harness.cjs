const fs=require('fs'),assert=require('assert/strict'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {applyMediaBulkEdit}=require('../lib/modules/media/bulk-edit.ts');
const {normalizeMediaProfile}=require('../lib/modules/media/profile.ts');
const {createNativeObjectRef}=require('../lib/native-objects/routes.ts');
const id='d3edda72-f014-44f2-8d24-9077f870ed88';
const ref=createNativeObjectRef({module:'projects',objectType:'project',objectId:'project-a',label:'Project A'});
const person=createNativeObjectRef({module:'people',objectType:'person',objectId:'person-a',label:'Person A'});
const empty=()=>({tags:{mode:'add',values:[]},purposes:{mode:'add',values:[]},links:{mode:'add',values:[]}});
for(const encrypted of [false,true]){
 const profile=normalizeMediaProfile({version:1,tags:['Keep','Campaign'],purposes:['Personal memory'],linkedRefs:[ref],altText:'Keep accessible text',archivedAt:'2026-11-01T10:00:00Z',location:{latitude:20,longitude:-65,source:'embedded'},metadata:{camera:'Original camera'},manifest:{format:encrypted?'unigentamos-vault-media-v1':'unigentamos-account-media-v1',mediaId:id,objectId:id,contentRoot:'a'.repeat(64),digestAlgorithm:encrypted?'chunk-root-v1':'sha256',fileName:'Original.jpg',mimeType:'image/jpeg',byteLength:100,chunkSize:1048576,totalChunks:1,createdAt:'2026-11-01T10:00:00Z'},...(!encrypted?{accountFile:{id,sha256:'a'.repeat(64),byteLength:100,chunkSize:1048576,totalChunks:1}}:{})});
 const before=JSON.stringify(profile);assert.strictEqual(applyMediaBulkEdit(profile,empty()),profile);
 const change=empty();change.tags.values=[' campaign ','New'];change.purposes.values=['Reference'];change.links.values=[ref,person];const next=applyMediaBulkEdit(profile,change);assert.equal(JSON.stringify(profile),before);assert.deepEqual(next.tags,['Keep','Campaign','New']);assert.deepEqual(next.purposes,['Personal memory','Reference']);assert.deepEqual(next.linkedRefs,[ref,person]);
 assert.strictEqual(applyMediaBulkEdit(next,change),next,'reapplying adds is a no-op');
 for(const key of ['manifest','accountFile','location','metadata','altText','archivedAt'])assert.deepEqual(next[key],profile[key]);
 const mixed=empty();mixed.tags={mode:'remove',values:['CAMPAIGN']};mixed.purposes={mode:'remove',values:['Personal memory']};mixed.links={mode:'remove',values:[ref]};const removed=applyMediaBulkEdit(next,mixed);assert.deepEqual(removed.tags,['Keep','New']);assert.deepEqual(removed.purposes,['Reference']);assert.deepEqual(removed.linkedRefs,[person]);assert.strictEqual(applyMediaBulkEdit(removed,mixed),removed);
 const self=empty();self.links.values=[createNativeObjectRef({module:'media',objectType:'media_asset',objectId:id,label:'Self'})];assert.strictEqual(applyMediaBulkEdit(profile,self,[id]),profile);
 const tooMany=empty();tooMany.tags.values=Array.from({length:30},(_,i)=>'new'+i);assert.throws(()=>applyMediaBulkEdit(profile,tooMany),/30/);assert.equal(JSON.stringify(profile),before);
 const invalid=empty();invalid.purposes.values=['Invented'];assert.throws(()=>applyMediaBulkEdit(profile,invalid),/supported/);
 const badLink=empty();badLink.links.values=[{...person,module:'invalid'}];assert.throws(()=>applyMediaBulkEdit(profile,badLink),/Invalid linked/);
}
console.log('PASS bulk metadata preservation for account/encrypted profiles, mixed add/remove, idempotence, self-links, tag limits and invalid input.');
