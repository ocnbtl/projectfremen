/* Offline checks against the bundled public data. No live/private records. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {worldRegions}=require('../lib/modules/planning/world-regions.ts'),{mapAnalysis}=require('../lib/modules/planning/map-analysis.ts');
const {MAP_CATALOG,MAP_PALETTES}=require('../lib/modules/planning/map-catalog.ts');
const catalog=require('../data/map/world-regions-catalog.json'),coverage=require('../data/map/regional-indicator-coverage.json');
const zeroDenominators=require('../data/map/regional-indicators/sources.json').zeroDenominators;
const extra=Object.keys(MAP_CATALOG).filter(k=>k.startsWith('regional-')&&!['regional-population','regional-density'].includes(k));
const read=f=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'../data/map',f))));
(async()=>{
 let checked=0;
 for(const country of catalog){const values=read(`regional-indicators/${country.code}.json.gz`);
  for(const [level,number] of [['state',1],['county',2]]){
   const features=read(`world/${country.code}-${number}.json.gz`).features,ids=features.map(f=>f.properties.GEOID).sort();
   for(const metric of extra){const rows=values[level][metric];assert.deepEqual(Object.keys(rows).sort(),ids);
    assert(Object.values(rows).every(v=>v===null||Number.isFinite(v)&&v>=0&&v<=100));
    assert.equal(Object.values(rows).filter(v=>v!==null).length,coverage[country.code][level][metric]);checked+=ids.length;
   }
   for(const id of ids){const urban=values[level]['regional-urban'][id],rural=values[level]['regional-rural'][id];if(urban!==null&&rural!==null)assert(Math.abs(urban+rural-100)<.03);}
  }
  const children=read(`world/${country.code}-2.json.gz`).features;
  for(const metric of extra)for(const parent of Object.keys(values.state[metric])) {
   const childIds=children.filter(f=>f.properties.parent===parent).map(f=>f.properties.GEOID);
   // A published zero population has no percentage (0/0) but can legitimately
   // contribute zero to its provincial counts. It is not a missing observation.
   const zeros=zeroDenominators[['regional-urban','regional-rural'].includes(metric)?'urbanization':'population'];
   if(!childIds.length||childIds.some(id=>values.county[metric][id]===null&&!zeros.includes(id)))assert.equal(values.state[metric][parent],null,'Incomplete province '+country.code+' '+parent+' '+metric);
  }
 }
 const data=await Promise.all(['regional-population','regional-under15','regional-urban'].map(metric=>worldRegions(metric,'state','CAN')));
 assert.equal(data[1].rows.filter(r=>r.value!==null).length,9);assert.equal(data[2].rows.filter(r=>r.value!==null).length,12);
 assert(data[1].rows.every(r=>r.year==='2020'));assert(data[2].rows.every(r=>r.year==='Reference year unavailable'));
 assert.match(data[2].geometryNote,/not its observation year/);
 const settings={metrics:[{metric:'regional-population'},{metric:'regional-under15',min:10},{metric:'regional-urban',min:20}],match:'all',scale:'quantile',palette:'ocean'};
 const analysis=mapAnalysis(data,settings);assert.equal(analysis.rows.length,13);assert(analysis.matched>0&&analysis.matched<13);
 for(const palette of ['ocean','sunset','viridis']){assert.equal(MAP_PALETTES[palette].colors.length,5);assert.deepEqual(mapAnalysis(data,{...settings,palette}).colors,MAP_PALETTES[palette].colors);}
 await assert.rejects(worldRegions('regional-under15','state','../../bad'),/supported/);
 await assert.rejects(worldRegions('regional-unknown','state','CAN'),/supported/);
 await assert.rejects(worldRegions('regional-female','tract','CAN'),/supported/);
 console.log(JSON.stringify({countries:catalog.length,checkedValues:checked,newLayers:extra.length,canada:'PASS',missingData:'PASS',palettes:'PASS'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
