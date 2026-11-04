/* 1,000 real geographic names, deterministic randomized local simulations.
 * Photon responses/coordinates are synthetic, derived from the existing region
 * catalogue. This tests our pipeline, not independent real geocoder accuracy. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib'),assert=require('node:assert/strict'),ts=require('typescript');
const app=path.resolve(__dirname,'..'),out=path.join(app,'output/place-worldwide'),data=fs.mkdtempSync(path.join(os.tmpdir(),'worldwide-places-'));
fs.mkdirSync(out,{recursive:true});Object.assign(process.env,{FREMEN_DATA_DIR:data,SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',FREMEN_REQUIRE_SUPABASE:'false'});
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText,f);
const {parsePlaceSearch,searchFullPlace,placeFromSearch}=require('../lib/modules/planning/place-search.ts');
const {savePlanningRecord:save,readPlanningState:read}=require('../lib/modules/planning/store.ts');
const {placeWriteInput,ADDRESS_COUNTRIES,formatPlaceAddress}=require('../lib/modules/planning/place-address.ts');
const {placePicture}=require('../lib/modules/planning/place-presentation.ts'),{isAreaPlace,fixedAreaFlag}=require('../lib/modules/planning/area-flags.ts');
const personal=require('../lib/personal-records-store.ts'),{reconcilePlaces}=require('../lib/modules/planning/place-reconciliation.ts');
let seed=20261104;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const catalogue=require('../data/map/world-regions-catalog.json'),groups=[];
for(const c of catalogue){const f=path.join(app,'data/map/world',c.code+'-1.json.gz');if(!fs.existsSync(f)||!ADDRESS_COUNTRIES[c.iso2])continue;const geo=JSON.parse(zlib.gunzipSync(fs.readFileSync(f)));groups.push(shuffle(geo.features.filter(r=>r.properties.NAME?.length>=2 && !/not available|unknown|unnamed|undefined/i.test(r.properties.NAME)).map(r=>{let point=r.geometry.coordinates;while(Array.isArray(point[0]))point=point[0];return {name:r.properties.NAME,country:c.iso2,point};})));}
shuffle(groups);const sample=[];for(let i=0;sample.length<1000;i++){let added=0;for(const group of groups){if(group[i]){sample.push(group[i]);added++;if(sample.length===1000)break;}}if(!added)throw Error('Insufficient geography');}
const results=[];
(async()=>{
 for(const [i,row] of sample.entries()){
  const feature={type:'Feature',geometry:{type:'Point',coordinates:row.point},properties:{name:row.name,countrycode:row.country,country:ADDRESS_COUNTRIES[row.country].name,type:'state',osm_type:'R',osm_id:900000000+i,osm_key:'boundary',osm_value:'administrative'}};
  const parsed=parsePlaceSearch({features:[feature,feature,{geometry:{type:'Point',coordinates:[Infinity,90]},properties:{name:'Invalid'}}]},row.name);
  const matches=await searchFullPlace(row.name,async()=>parsed);assert.equal(matches.length,1);const draft=placeFromSearch(matches[0]);
  assert.equal(draft.countryCode,row.country);assert.equal(draft.addressParts.street,'');assert.equal(draft.addressParts.region,row.name);assert(!draft.address.includes('undefined'));
  const place=await save('places',{...draft,notes:'Preserve note '+i,tags:[],linkedRefs:[]});
  const duplicate=await save('places',{...draft,name:'Alternate label '+i,notes:'Must not replace',tags:[],linkedRefs:[]});assert.equal(duplicate.id,place.id);assert.equal(duplicate.name,row.name);assert.equal(duplicate.notes,'Preserve note '+i);
  const persisted=(await read()).places.find(p=>p.id===place.id);assert.equal(persisted.lookup.sourceId,draft.lookup.sourceId);assert.equal(persisted.latitude,row.point[1]);assert.equal(persisted.address,draft.address);assert(isAreaPlace(persisted));
  const visual=placePicture(persisted,[{objectId:'unrelated',label:'Wrong business',href:'/wrong',hasProfileLocation:true,imageUrl:'/api/people/photos/personal-aaaaaaaa'}]);assert(!visual?.includes('people/photos'),'Areas never inherit unrelated logos');assert(visual?.startsWith('/api/map/flags?')||visual?.startsWith('/map-flags/'),'Area flag path exists');
  if(i%25===0){for(const className of ['person','org']){const records=await personal.createPersonalRecord({domain:'notes-docs',className,title:`Simulation ${className} ${i}`,profile:{locations:[{id:'location',placeId:place.id,address:place.address,label:'Visit'}]}});const record=records.find(r=>r.title===`Simulation ${className} ${i}`);await reconcilePlaces({recordIds:[record.id]});assert.equal((await personal.readPersonalRecords()).find(r=>r.id===record.id).profile.locations[0].placeId,place.id);}}
  results.push({name:row.name,country:row.country,passed:true,visual});if((i+1)%100===0)console.log(`Simulated ${i+1}/1000`);
 }
 assert.equal((await read()).places.length,1000,'Repeated adds and profile links must not duplicate places');
 // Distinct businesses at a shared building, and same-named cities across countries.
 const venue={name:'Cafe',address:'1 Shared Street',countryCode:'FR',latitude:48,longitude:2,lookup:{sourceId:'https://www.openstreetmap.org/node/100',kind:'house',precision:'address'}};
 const a=await save('places',venue),b=await save('places',{...venue,lookup:{...venue.lookup,sourceId:'https://www.openstreetmap.org/node/101'}});assert.notEqual(a.id,b.id);
 const moved=await save('places',placeWriteInput({id:a.id,address:'2 Other Street'}),a.updatedAt);assert(!moved.lookup,'Manual address edits clear stale provider identity');
 await assert.rejects(()=>save('places',{...venue,latitude:500}),/coordinates/);
 await assert.rejects(()=>save('places',{...venue,lookup:{...venue.lookup,sourceId:'https://evil.example/1'}}),/source/);
 const unknown=parsePlaceSearch({features:[{properties:{name:'Somewhere',country:'Unknown country',countrycode:'ZZ',type:'city'},geometry:{type:'Point',coordinates:[0,0]}}]},'Somewhere')[0];assert(!unknown.countryCode);assert(unknown.address.includes('Unknown country'));
 // All supported postal formats retain each entered value, including leading-zero postcodes.
 for(const country of Object.keys(ADDRESS_COUNTRIES)){const fields={street:'10 Test Street',city:'Test City',region:'Test Region',postalCode:'00123',district:'Test District'};const formatted=formatPlaceAddress(fields,country);for(const value of Object.values(fields))assert(formatted.includes(value),`${country} drops ${value}`);}
 const countryFlags=Object.keys(ADDRESS_COUNTRIES).filter(code=>fixedAreaFlag(ADDRESS_COUNTRIES[code].name,code,'country'));
 const sprite=fs.readFileSync(path.join(app,'public/country-flags.svg'),'utf8');for(const code of countryFlags)assert(sprite.includes(`id="flag-${code}"`)||fs.existsSync(path.join(app,'public/address-flags',code+'.svg')),`Missing country flag ${code}`);
 let realResponseReplays=0;
 const cachedFile=path.join(out,'provider-cache.json');
 if(fs.existsSync(cachedFile))for(const [query,response] of Object.entries(JSON.parse(fs.readFileSync(cachedFile)))){
  const matches=await searchFullPlace(query,async q=>parsePlaceSearch(response,q));
  for(const match of matches){const draft=placeFromSearch(match),saved=await save('places',draft),again=await save('places',draft);assert.equal(again.id,saved.id);assert.equal(saved.lookup.sourceId,match.sourceUrl);assert.equal(saved.latitude,match.latitude);assert.equal(saved.longitude,match.longitude);assert.equal(saved.countryCode,match.countryCode);realResponseReplays++;}
 }
 assert.equal(fixedAreaFlag('The Bahamas','BS','country').code,'BS');
 assert.equal(placePicture({name:'Custom place',image:'custom-picture',lookup:{kind:'city',precision:'area'},countryCode:'FR'}),'custom-picture');
 assert.equal(placePicture({name:'Verified organization',tags:[]},[{label:'Verified organization',objectId:'org',href:'/admin/people/org',imageUrl:'/api/people/photos/personal-aaaaaaaa'}]),'/api/people/photos/personal-aaaaaaaa');
 assert.equal(placePicture({name:'Unrelated venue',tags:[]},[{label:'Different organization',objectId:'org',href:'/admin/people/org',imageUrl:'/api/people/photos/personal-aaaaaaaa'}]),undefined);
 const report={seed:20261104,mode:'local synthetic provider responses using real geographic names; not a live geocoder accuracy estimate',cases:results.length,countries:new Set(results.map(r=>r.country)).size,profileLinks:80,countryFlagAssets:countryFlags.length,realResponseReplays,results};
 fs.writeFileSync(path.join(out,'simulation-results.json'),JSON.stringify(report,null,2));console.log('PASS',JSON.stringify({...report,results:undefined}));
})().catch(e=>{fs.writeFileSync(path.join(out,'simulation-failure.txt'),e.stack);console.error(e);process.exitCode=1;});
