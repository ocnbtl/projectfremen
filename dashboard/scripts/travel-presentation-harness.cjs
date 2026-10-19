const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText,file);
const {placePicture}=require('../lib/modules/planning/place-presentation.ts');
const {fixedAreaFlag,isAreaPlace,areaFlagUrl}=require('../lib/modules/planning/area-flags.ts');
const {uniqueFlagFile,areaFlagQuery,areaFlagImage}=require('../lib/modules/planning/area-flag-provider.ts');
const {travelHistory}=require('../lib/modules/planning/travel-history.ts');
(async()=>{
 const honda={label:'Honda',imageUrl:'/api/people/photos/personal-abcdef',objectId:'personal-abcdef',href:'/'};
 const tokyo={name:'Tokyo',address:'Tokyo, Japan',countryCode:'JP',tags:['Area'],latitude:35.67686,longitude:139.76389};
 assert.match(placePicture(tokyo,[honda]),/^\/api\/map\/flags\?/);assert(!placePicture(tokyo,[honda]).includes('photos'));
 assert.equal(placePicture({...tokyo,image:'custom'},[honda]),'custom');
 assert.equal(placePicture({name:'Somewhere',address:'',tags:['Travel']},[honda]),undefined);
 assert.equal(placePicture({name:'Honda',address:'',tags:['Organization']},[honda]),honda.imageUrl);
 assert(isAreaPlace({tags:['AREA']}));assert(isAreaPlace({locationVerification:{precision:'area'}}));
 assert.equal(areaFlagUrl({name:'Tokyo'}),undefined);
 assert.deepEqual(fixedAreaFlag('France','FR'),{kind:'country',code:'FR'});
 assert.deepEqual(fixedAreaFlag('Ohio','US'),{kind:'state',code:'oh'});
 assert.equal(fixedAreaFlag('Paris','US','city'),undefined);
 const row=(id,file)=>({item:{value:`http://www.wikidata.org/entity/${id}`},flag:{value:`http://commons.wikimedia.org/wiki/Special:FilePath/${file}`}});
 assert.equal(uniqueFlagFile([row('Q1490','Flag%20of%20Tokyo%20Metropolis.svg')]),'Flag_of_Tokyo_Metropolis.svg');
 assert.equal(uniqueFlagFile([row('Q1','one.svg'),row('Q2','two.svg')]),undefined);
 assert.equal(uniqueFlagFile([row('Q1','one.svg'),row('Q1','two.svg')]),undefined);
 assert.equal(uniqueFlagFile([row('Q1','..%2Ffile.svg')]),undefined);
 assert.equal(uniqueFlagFile([{item:{value:'http://www.wikidata.org/entity/Q1'},flag:{value:'https://evil.test/file.svg'}}]),undefined);
 assert.throws(()=>areaFlagQuery('Tokyo','ZZ'),/Invalid/);assert.throws(()=>areaFlagQuery('Tokyo','JP',100,10),/coordinates/);
 const query=areaFlagQuery('Tokyo','JP',35.67,139.76);assert(query.includes('wd:Q17'));assert(query.includes('wd:Q486972'));assert(query.includes('geof:distance'));assert(query.includes('wdt:P41'));
 const entry={visits:[{id:'old',startDate:'2022-01-01',endDate:'2022-01-02',note:'First visit'},{id:'new',startDate:'2025-01-01',endDate:'2025-01-02',note:''}],tripVisits:[{tripId:'trip',title:'Summer trip',startDate:'2024-07-01',endDate:'2024-07-08'}]};
 const before=JSON.stringify(entry);assert.deepEqual(travelHistory(entry).map(v=>v.id),['visit:new','trip:trip','visit:old']);assert.equal(JSON.stringify(entry),before);
 for(const [name,country,kind] of [['France','FR','country'],['Ohio','US','state']]){const png=await areaFlagImage(name,country,kind);assert.equal(png.subarray(1,4).toString(),'PNG');}
 if(process.argv.includes('--live'))for(const [name,country,lat,lon] of [['Tokyo','JP',35.67686,139.76389],['Paris','FR',48.8534951,2.3483915]]){const png=await areaFlagImage(name,country,'city',lat,lon);assert(png,`${name} flag missing`);const m=await require('sharp')(png).metadata();assert(m.width>m.height,`${name} should retain rectangular flag`);console.log(`${name}: verified ${m.width}x${m.height} flag`);}
 console.log('PASS: area/organization image separation, custom image priority, bounded country-aware flag lookup, ambiguous-result rejection, local country/state images, and complete sorted visit history.');
})().catch(e=>{console.error(e);process.exitCode=1;});
