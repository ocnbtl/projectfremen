// Pure regression checks. No server, network, or user data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, filename);
const {buildProfileRecordEdges, collectProfileConnections, resolveProfileTarget} = require('../lib/modules/people/profile-connections.ts');
const {buildResourceDuplicateEvidenceIndex: index, duplicateMemberSignature} = require('../lib/modules/resources/duplicate-evidence.ts');
const ref = (id, label, module='people', objectType='person') => ({module, objectType, objectId:id, label, route:'/admin/'+module+'/'+id});
const alice=ref('alice','Alice'), bob=ref('bob','Bob'), org=ref('org','Studio','people','organization'), resource=ref('resource','Reference','resources','resource');
const targets=[alice,bob,org,resource];
const record=(id, extra={})=>({id,className:'person',title:id,relations:{related:[]},projects:[],...extra});
const edges=buildProfileRecordEdges([
  record('alice',{profile:{occupations:[{organizationId:'org',title:'Designer'}]}}),
  record('bob',{profile:{associatedPeople:['alice']}}),
  record('resource',{className:'resource',relations:{related:['alice']}}),
  record('archived',{archivedAt:'2026-01-01',profile:{associatedPeople:['alice']}})
],targets);
const links=[{id:'1',source:org,target:alice,status:'active',relationship:'colleague'}, {id:'2',source:alice,target:ref('deleted','Deleted'),status:'active',relationship:'friend'}, {id:'3',source:alice,target:bob,status:'removed',relationship:'friend'}];
const connected=collectProfileConnections(alice,targets,links,edges);
assert.deepEqual(connected.map(x=>x.ref.objectId).sort(),['bob','org','resource']);
assert.equal(connected.find(x=>x.ref.objectId==='org').linkIds.length,1);
assert(connected.find(x=>x.ref.objectId==='org').details.includes('Designer'));
assert.equal(resolveProfileTarget('Studio',[org,ref('org2','Studio','people','organization')]),undefined);
assert.equal(resolveProfileTarget('org',[org,ref('org2','Studio','people','organization')]).objectId,'org');
assert.equal(collectProfileConnections(alice,targets,[],buildProfileRecordEdges([record('resource',{className:'resource',resourceProfile:{deletedAt:'2026-01-01'},relations:{related:['alice']}})],targets)).length,0);
const makeResource=(id,title,url='https://icons.example/library')=>({id,title,nativeRef:ref(id,title,'resources','resource'),lifecycleState:'active',source:{candidates:[{matchKey:url,displayDomain:'icons.example'}],evidence:[]}});
const a=makeResource('a','Circle'),b=makeResource('b','Square');
assert.equal(index([a,b]).groups.length,1);
assert.equal(index([a,makeResource('b','Square','https://icons.example/other')]).groups.length,0);
const reviewed={...a,duplicateReviews:[{matchKey:'https://icons.example/library',members:[a,b].map(duplicateMemberSignature),reviewedAt:'2026-11-02T00:00:00.000Z'}]};
assert.equal(index([reviewed,b]).groups.length,0);
assert.equal(index([reviewed,b]).reviewedGroups.length,1);
assert.equal(index([reviewed,{...b,title:'Changed'}]).groups.length,1);
assert.equal(index([reviewed,b,makeResource('c','Triangle')]).groups.length,1);
assert.equal(index([a,{...b,lifecycleState:'archived'}]).groups.length,0);
assert.equal(index([a,{...b,deletedAt:'2026-01-01'}]).groups.length,0);
console.log('PASS canonical bidirectional connections, ambiguous-name protection, archived/deleted exclusions, exact-URL evidence, persistent review invalidation.');
