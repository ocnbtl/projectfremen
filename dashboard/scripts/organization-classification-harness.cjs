const fs = require('node:fs'), assert = require('node:assert/strict'), ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{esModuleInterop:true,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, file);
const {organizationLabels} = require('../lib/modules/people/organization-labels.ts');
const {placeClassification} = require('../lib/modules/planning/place-presentation.ts');
assert.deepEqual(organizationLabels({organizationType:'Airport', industry:'Arts & culture'}), {type:'',industry:''});
assert.deepEqual(organizationLabels({organizationType:'constructor', industry:'Other'}), {type:'',industry:''});
assert.deepEqual(organizationLabels({organizationType:'Government', industry:'Transportation'}), {type:'Government',industry:'Transportation'});
assert.deepEqual(organizationLabels({organizationType:'Business', industry:'Arts & culture'}), {type:'Business',industry:''});
const org = {label:'Cincinnati/Northern Kentucky International Airport (CVG)',organizationType:'Government',industry:'Transportation',hasProfileLocation:true};
assert.deepEqual(placeClassification({name:'CVG',tags:['Travel']},[org]), {type:'Government',industry:'Transportation'});
assert.deepEqual(placeClassification({name:'Tokyo',tags:['Area']},[{...org,label:'Honda',organizationType:'Business',industry:'Manufacturing'}]), {type:'',industry:''});
assert.deepEqual(placeClassification({name:'House',tags:['House']},[{...org,hasProfileLocation:false}]), {type:'',industry:''});
assert.deepEqual(placeClassification({name:'Ambiguous',tags:['Organization']},[org,{...org,label:'Different'}]), {type:'',industry:''});
assert.deepEqual(placeClassification({name:'CVG',tags:['Travel']},[{...org,industry:'Public safety'}]), {type:'Government',industry:'Public safety'});
console.log('Organization classification, taxonomy validation, and area/linked-object isolation: PASS');
const {normalizePlanningRecord} = require('../lib/modules/planning/record-validation.ts');
const {planningWritableKeys} = require('../lib/modules/planning/ownership.ts');
const saved = normalizePlanningRecord('savedViews', {id:'view',createdAt:'2026-10-26',updatedAt:'2026-10-26',name:'Airports',center:[0,0],zoom:3,organizationType:'Government',industry:'Transportation',sort:'industry'});
assert.equal(saved.organizationType,'Government');assert.equal(saved.industry,'Transportation');assert.equal(saved.sort,'industry');


assert(planningWritableKeys('savedViews').includes('organizationType'));assert(planningWritableKeys('savedViews').includes('industry'));

