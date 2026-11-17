// Local deterministic scenarios exercise production helpers; no network or real records.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {normalizeMediaProfile}=require('../lib/modules/media/profile.ts');
const {MEDIA_PURPOSES,cleanMediaLabels,normalizeMediaOrganization,nearbyMediaPlace,mergeMediaLinks,mediaSearchText}=require('../lib/modules/media/organization.ts');
const {readPhotoDetails}=require('../lib/modules/media/photo-metadata.ts');
const {matchesMediaFilters,EMPTY_MEDIA_FILTERS}=require('../lib/modules/media/filters.ts');
const out=path.resolve(__dirname,'../output/media-workflow');fs.mkdirSync(out,{recursive:true});
function jpeg(lat=39.1,lon=-84.5){
 const t=Buffer.alloc(800);t.write('II',0);t.writeUInt16LE(42,2);t.writeUInt32LE(8,4);
 const entry=(offset,tag,type,count,value)=>{t.writeUInt16LE(tag,offset);t.writeUInt16LE(type,offset+2);t.writeUInt32LE(count,offset+4);t.writeUInt32LE(value,offset+8);};
 t.writeUInt16LE(7,8);entry(10,0x10f,2,8,450);t.write('Fixture\0',450);entry(22,0x110,2,8,460);t.write('Model 7\0',460);entry(34,0x100,4,1,4000);entry(46,0x101,4,1,3000);entry(58,0x8769,4,1,200);entry(70,0x8825,4,1,260);entry(82,0x13b,2,6,470);t.write('Ocean\0',470);
 t.writeUInt16LE(1,200);entry(202,0x9003,2,20,500);t.write('2026:11:17 16:30:00\0',500);
 t.writeUInt16LE(4,260);entry(262,1,2,2,lat<0?83:78);entry(274,2,5,3,600);entry(286,3,2,2,lon<0?87:69);entry(298,4,5,3,624);
 for(const [n,offset] of [[lat,600],[lon,624]]){const v=Math.abs(n),degree=Math.floor(v),minutes=(v-degree)*60,minute=Math.floor(minutes),seconds=(minutes-minute)*60;[[degree,1],[minute,1],[Math.round(seconds*1000000),1000000]].forEach(([num,den],i)=>{t.writeUInt32LE(num,offset+i*8);t.writeUInt32LE(den,offset+i*8+4);});}
 const header=Buffer.from([255,216,255,225,0,0]);header.writeUInt16BE(t.length+8,4);return Buffer.concat([header,Buffer.from('Exif\0\0'),t,Buffer.from([255,217])]);
}
const personas=['Family historian','Photographer','Freelancer','Student','Teacher','Researcher','Small business owner','Creator','Traveler','Designer','Builder','Homeowner','Volunteer','Event planner','Musician','Coach','Pet owner','Collector','Job seeker','Agency producer','Shop owner','Project manager','Writer','Community organizer'];
const mimes=['image/jpeg','image/png','image/heic','video/mp4','audio/mpeg','application/pdf','text/plain','application/zip'];
(async()=>{
 const sample=jpeg(),photo=await readPhotoDetails(new File([sample],'camera.jpg',{type:'image/jpeg'}),true);
 assert(photo.location,'GPS extracted from real EXIF bytes');assert(Math.abs(photo.location.latitude-39.1)<.00001);assert(Math.abs(photo.location.longitude+84.5)<.00001);assert.equal(photo.metadata.capturedAt,'2026-11-17T16:30:00');assert.match(photo.metadata.camera,/Fixture/);assert.equal(photo.metadata.width,4000);
 fs.writeFileSync(path.join(out,'gps-fixture.jpg'),sample);
 const report=[];let assertions=0;
 for(let persona=0;persona<personas.length;persona++)for(let scenario=0;scenario<100;scenario++){
  const i=persona*100+scenario,mime=mimes[i%mimes.length],purpose=MEDIA_PURPOSES[i%MEDIA_PURPOSES.length],id=crypto.randomUUID(),ref={module:'projects',objectType:'project',objectId:'project-'+i,label:'Project '+i,route:'/admin/projects/project-'+i};
  const raw={version:1,manifest:{format:'unigentamos-account-media-v1',mediaId:id,objectId:id,contentRoot:'a'.repeat(64),digestAlgorithm:'sha256',fileName:'fixture-'+i,mimeType:mime,byteLength:1+(i%2000000),chunkSize:1048576,totalChunks:Math.ceil((1+i%2000000)/1048576),createdAt:'2026-11-17T10:00:00Z'},linkedRefs:[ref,ref],altText:'Fixture',tags:[' Campaign ','campaign','世界','Résumé'],purposes:[purpose,purpose],metadata:photo.metadata};
  raw.accountFile={id,sha256:raw.manifest.contentRoot,byteLength:raw.manifest.byteLength,chunkSize:1048576,totalChunks:raw.manifest.totalChunks};
  const before=JSON.stringify(raw),profile=normalizeMediaProfile(raw);assert.equal(JSON.stringify(raw),before);assert.deepEqual(profile.manifest,raw.manifest);assert.equal(profile.linkedRefs.length,1);assert.deepEqual(profile.tags,['Campaign','世界','Résumé']);assert.deepEqual(profile.purposes,[purpose]);assert.deepEqual(normalizeMediaProfile(profile),profile);assert(mediaSearchText('Title','Description',profile).includes('project '+i));assert(mediaSearchText('Title','',profile).includes('世界'));assert(matchesMediaFilters(profile,EMPTY_MEDIA_FILTERS));assert(matchesMediaFilters(profile,{...EMPTY_MEDIA_FILTERS,links:'linked',storage:'account'}));assert(!matchesMediaFilters(profile,{...EMPTY_MEDIA_FILTERS,links:'unlinked'}));assert.equal(mergeMediaLinks([ref,ref]).length,1);assertions+=12;
  const latitude=-70+(i%140),longitude=-170+(i%340),location={latitude,longitude},place={id:'place-'+i,name:'Saved venue',latitude,longitude,lookup:{precision:'address'},createdAt:'',updatedAt:'',address:'',tags:[],linkedRefs:[],notes:''};
  assert.equal(nearbyMediaPlace(location,[place])?.id,place.id);assert.equal(nearbyMediaPlace(location,[place,{...place,id:'neighbor'}]),undefined);assert.equal(nearbyMediaPlace(location,[{...place,archivedAt:'2026'}]),undefined);assert.equal(nearbyMediaPlace(location,[{...place,lookup:{precision:'area'}}]),undefined);assert.equal(nearbyMediaPlace(location,[{...place,latitude:latitude+.01}]),undefined);assertions+=5;
  const embedded=await readPhotoDetails(new File([jpeg(latitude,longitude)],'world.jpg',{type:'image/jpeg'}),scenario%2===0);if(scenario%2===0){assert(Math.abs(embedded.location.latitude-latitude)<.00001);assert(Math.abs(embedded.location.longitude-longitude)<.00001);}else assert.equal(embedded.location,undefined);assertions+=scenario%2===0?2:1;
  const broken=await readPhotoDetails(new File([Buffer.alloc(scenario%128,i%256)],'damaged.jpg',{type:'image/jpeg'}),true);assert(!broken.location&&!broken.title&&!broken.description&&!broken.metadata&&!(broken.tags||[]).length);assertions++;
  if(scenario%10===0){assert.throws(()=>cleanMediaLabels(['x'.repeat(61)]));assert.throws(()=>normalizeMediaOrganization({purposes:['invented']}));assert.throws(()=>normalizeMediaOrganization({metadata:{capturedAt:'2026-02-31T10:00:00'}}));assert.throws(()=>normalizeMediaProfile({...raw,location:{latitude:91,longitude:0}}));assertions+=4;}
  if(scenario===99)report.push({persona:personas[persona],scenarios:100});
 }
 fs.writeFileSync(path.join(out,'simulation-results.json'),JSON.stringify({scenarios:2400,assertions,personas:report,method:'Deterministic production-helper tests, not empirical customer research. No network requests or production writes.'},null,2));console.log('PASS 2,400 local scenarios;',assertions,'assertions; EXIF GPS, privacy opt-out, worldwide saved-place matching, ambiguity, malformed files, tags, purposes, links, filters, immutable originals and metadata round trips.');
})().catch(error=>{console.error(error);process.exitCode=1;});
