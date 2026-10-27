/* Validate bundled public ACS estimates without network or private records. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {acsIndicators}=require('../lib/modules/planning/acs-indicators.ts'),{mapAnalysis}=require('../lib/modules/planning/map-analysis.ts');
const dir=path.join(__dirname,'../data/map/acs-indicators'),sources=require('../data/map/acs-indicators/sources.json');
(async()=>{
 const counts=Object.fromEntries(Object.keys(sources).map(k=>[k,0]));let checked=0;
 for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.gz'))){const table=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir,file))));const level=file.split('-')[1].split('.')[0],length={state:2,county:5,place:7,tract:11}[level];
 for(const [metric,rows]of Object.entries(table)){assert(sources[metric]);for(const[id,pair]of Object.entries(rows)){assert.equal(id.length,length);assert.match(id,/^\d+$/);assert.equal(pair.length,2);assert(pair.every(v=>v===null||Number.isFinite(v)&&v>=0));counts[metric]++;checked++;}}
 }
 for(const [metric,source]of Object.entries(sources)){assert.equal(counts[metric],source.rows);assert.match(source.sha256,/^[a-f0-9]{64}$/);assert.match(source.url,/^https:\/\/www2.census.gov\//);}
 const geometry={type:'FeatureCollection',features:[{type:'Feature',properties:{GEOID:'39',NAME:'Ohio'},geometry:null}]};
 const income=await acsIndicators('us-per-capita-income','state','',geometry);assert.equal(income.rows.find(r=>r.id==='39').name,'Ohio');assert(income.rows.find(r=>r.id==='39').value>30000);assert.equal(income.period,'2020–2024');
 const settings={metrics:[{metric:'us-per-capita-income'},{metric:'us-rent'}],match:'all',scale:'quantile'};
 const rent=await acsIndicators('us-rent','state','',geometry);assert(mapAnalysis([income,{...rent,period:'2020-2024'}],settings));assert.throws(()=>mapAnalysis([income,{...rent,period:'2019-2023'}],settings),/cannot be combined/);
 await assert.rejects(acsIndicators('us-rent','county','../',null),/supported/);await assert.rejects(acsIndicators('us-unknown','state','',null),/supported/);
 console.log(JSON.stringify({layers:Object.keys(sources).length,checkedEstimates:checked,counts,periodMatching:'PASS',validation:'PASS'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
