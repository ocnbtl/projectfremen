/* Offline public-data preparation. Never reads or writes private application records.
 * Usage: node scripts/prepare-regional-indicators.cjs SOURCE_DIR
 * SOURCE_DIR: population.csv, urbanization.csv, nightlights.csv and flood.csv (see data/map/README.md).
 */
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const Papa = require('papaparse');
const source = process.argv[2], root = path.resolve(__dirname, '../data/map');
if (!source) throw Error('Provide the public CSV source directory');
const sources = {};
function read(name) {
 const bytes=fs.readFileSync(path.join(source,name+'.csv'));
 sources[name]={sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
 const parsed=Papa.parse(bytes.toString('utf8'),{header:true,skipEmptyLines:true});
 if(parsed.errors.length) throw Error(JSON.stringify(parsed.errors.slice(0,3)));
 const rows=new Map();
 for(const row of parsed.data){if(!row.ADM2CD_c||rows.has(row.ADM2CD_c))throw Error('Missing/duplicate region ID');rows.set(row.ADM2CD_c,row);}
 return rows;
}
const population=read('population'),urban=read('urbanization'),nightlights=read('nightlights'),flood=read('flood');
const number=v=>v!==undefined&&v!==null&&String(v).trim()!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
const sum=values=>values.length&&values.every(v=>v!==null)?values.reduce((a,b)=>a+b,0):null;
const ages=(row,bands)=>sum(['f','m'].flatMap(sex=>bands.map(age=>number(row?.[`sum_pop_${sex}_${age}_2020`]))));
const definitions={
 'regional-lights-change':r=>[number(r?.sum_viirs_ntl_2024),number(r?.sum_viirs_ntl_2014)],
 'regional-flood':r=>[number(r?.pop_flood),number(r?.pop)],
 'regional-under15':r=>[ages(r,[0,1,5,10]),number(r?.sum_pop_2020)],
 'regional-working-age':r=>[ages(r,[15,20,25,30,35,40,45,50,55,60]),number(r?.sum_pop_2020)],
 'regional-over65':r=>[ages(r,[65,70,75,80]),number(r?.sum_pop_2020)],
 'regional-female':r=>[number(r?.sum_pop_f_2020),number(r?.sum_pop_2020)],
 'regional-urban':r=>[sum([21,22,23,30].map(code=>number(r?.[`ghs_${code}_pop`]))),number(r?.ghs_total_pop)],
 'regional-rural':r=>[sum([11,12,13].map(code=>number(r?.[`ghs_${code}_pop`]))),number(r?.ghs_total_pop)],
};
function ratio([numerator,denominator],metric) {
 if(numerator===null||denominator===null||denominator<=0)return null;
 const value=100*numerator/denominator;
 if(metric==='regional-lights-change')return Math.round((value-100)*100)/100;
 if(value>100.0001)throw Error('Invalid population share');
 return Math.round(Math.min(100,value)*100)/100;
}
const manifest={sources,countries:{}},rejected=[];
const output=path.join(root,'regional-indicators');fs.mkdirSync(output,{recursive:true});
for(const entry of require('../data/map/world-regions-catalog.json')) {
 const load=level=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'world',`${entry.code}-${level}.json.gz`)))).features;
 const children=load(2),parents=load(1),table={state:{},county:{}},coverage={state:{},county:{}};
 for(const [metric,derive] of Object.entries(definitions)) {
  const sourceRows=metric==='regional-lights-change'?nightlights:metric==='regional-flood'?flood:metric==='regional-urban'||metric==='regional-rural'?urban:population;
  const groups=new Map();table.county[metric]={};table.state[metric]={};
  for(const feature of children) {
   const props=feature.properties,row=sourceRows.get(props.GEOID);
   let pair=derive(row?.ISO3===entry.code?row:undefined);
   if(metric!=='regional-lights-change'&&pair[0]!==null&&pair[1]!==null&&(pair[1]===0&&pair[0]>0||pair[1]>0&&pair[0]/pair[1]>1.000001)){rejected.push({id:props.GEOID,metric});pair=[null,null];}
   table.county[metric][props.GEOID]=ratio(pair,metric);
   if(!groups.has(props.parent))groups.set(props.parent,[]);
   groups.get(props.parent).push(pair);
  }
  for(const feature of parents){const pairs=groups.get(feature.properties.GEOID)||[];
   // Sum the source counts, never average percentages or omit missing children.
   table.state[metric][feature.properties.GEOID]=ratio([sum(pairs.map(p=>p[0])),sum(pairs.map(p=>p[1]))],metric);
  }
  for(const level of ['state','county'])coverage[level][metric]=Object.values(table[level][metric]).filter(v=>v!==null).length;
 }
 manifest.countries[entry.code]=coverage;
 fs.writeFileSync(path.join(output,entry.code+'.json.gz'),zlib.gzipSync(JSON.stringify(table),{level:9}));
}
fs.writeFileSync(path.join(root,'regional-indicator-coverage.json'),JSON.stringify(manifest.countries)+'\n');
const zeroDenominators={nightlights:[...nightlights.values()].filter(r=>number(r.sum_viirs_ntl_2014)===0).map(r=>r.ADM2CD_c),flood:[...flood.values()].filter(r=>number(r.pop)===0).map(r=>r.ADM2CD_c),population:[...population.values()].filter(r=>number(r.sum_pop_2020)===0).map(r=>r.ADM2CD_c),urbanization:[...urban.values()].filter(r=>number(r.ghs_total_pop)===0).map(r=>r.ADM2CD_c)};
fs.writeFileSync(path.join(output,'sources.json'),JSON.stringify({...manifest.sources,rejected,zeroDenominators},null,2)+'\n');
console.log(JSON.stringify({countries:Object.keys(manifest.countries).length,canada:manifest.countries.CAN,rejected:rejected.length,examples:rejected.slice(0,4),bytes:fs.readdirSync(output).reduce((n,f)=>n+fs.statSync(path.join(output,f)).size,0)}));
