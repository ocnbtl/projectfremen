// Offline public Census extract. No private records or production services.
import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const target=path.resolve('data/map/acs-indicators'),tables={
 'us-per-capita-income':'b19301','us-home-value':'b25077','us-rent':'b25064',
 'us-housing-units':'b25001','us-households':'b11001','us-household-size':'b25010',
};
const regions={},sources={};
const number=value=>/^\d+(\.\d+)?$/.test(value)?Number(value):null;
await fs.mkdir(target,{recursive:true});
for(const [metric,table] of Object.entries(tables)){
 const url=`https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-${table}.dat`;
 const response=await fetch(url,{signal:AbortSignal.timeout(180000)});assert(response.ok,`${table} HTTP ${response.status}`);
 const hash=createHash('sha256'),decoder=new TextDecoder();let buffer='',header,columns,count=0;
 function line(text){const row=text.trimEnd().split('|');if(!header){header=row;columns=[row.indexOf(`${table.toUpperCase()}_E001`),row.indexOf(`${table.toUpperCase()}_M001`)];assert(columns.every(i=>i>0));return;}
  const m=/^(040|050|140|160)0000US(\d+)$/.exec(row[0]);if(!m)return;
  const level=({'040':'state','050':'county','140':'tract','160':'place'})[m[1]],id=m[2],scope=level==='state'?'states':id.slice(0,2),key=`${scope}-${level}`;
  regions[key]||={};regions[key][metric]||={};assert(!Object.hasOwn(regions[key][metric],id));regions[key][metric][id]=columns.map(i=>number(row[i]));count++;
 }
 for await(const chunk of response.body){hash.update(chunk);buffer+=decoder.decode(chunk,{stream:true});const lines=buffer.split('\n');buffer=lines.pop();lines.forEach(line);}buffer+=decoder.decode();if(buffer.trim())line(buffer);
 sources[metric]={url,sha256:hash.digest('hex'),table:table.toUpperCase(),column:'001',period:'2020–2024',rows:count};console.log(metric,count);
}
for(const [key,value] of Object.entries(regions))await fs.writeFile(path.join(target,key+'.json.gz'),gzipSync(JSON.stringify(value),{level:9}));
await fs.writeFile(path.join(target,'sources.json'),JSON.stringify(sources,null,2)+'\n');
console.log('Prepared',Object.keys(regions).length,'geographic files');
