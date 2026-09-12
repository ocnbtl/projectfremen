const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
// Load these pure TypeScript modules in a separate test process.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText, filename);
const {findPeopleDuplicates} = require('../lib/modules/people/duplicates.ts');
const {formatInternationalPhone,formatLocalPhone,normalizePhoneForStorage,validateInternationalPhone,PHONE_COUNTRY_CHOICES} = require('../lib/modules/people/phone.ts');
const person=(id,title,profile={},extra={})=>({id,title,className:'person',profile,status:'active',...extra});
const organization=(id,title,profile={},extra={})=>person(id,title,profile,{className:'org',...extra});
assert.equal(findPeopleDuplicates([person('a','Alice'),person('b','Bob')]).length,0);
assert.equal(findPeopleDuplicates([person('a',''),person('b','')]).length,0);
assert.equal(findPeopleDuplicates([person('a','Sam Lee'),organization('b','Sam Lee')]).length,0);
assert.equal(findPeopleDuplicates([person('a','Sam Lee'),person('b','Sam Lee',{}, {archivedAt:'2026-01-01'})]).length,0);
let matches=findPeopleDuplicates([person('a','José Santos'),person('b','Jose Santos')]);
assert.equal(matches[0].confidence,'Review name');assert.deepEqual(matches[0].reasons,['Same name']);
matches=findPeopleDuplicates([person('a','Alice',{primaryEmail:'ALICE@example.com '}),person('b','A. Smith',{emails:[{address:'alice@example.com'}]})]);
assert.equal(matches[0].confidence,'Strong match');assert.deepEqual(matches[0].reasons,['Same email']);
matches=findPeopleDuplicates([person('a','Alice',{phoneNumber:'6145550142',phoneCountryCode:'+1'}),person('b','A Smith',{phones:[{number:'+1 614-555-0142',countryCode:'+1'}]})]);
assert.equal(matches.length,1);assert.deepEqual(matches[0].reasons,['Same phone']);
assert.equal(findPeopleDuplicates([person('a','Alice',{website:'https://employer.com'}),person('b','Bob',{website:'https://employer.com'})]).length,0);
matches=findPeopleDuplicates([organization('a','Acme',{website:'https://www.acme.example/?utm_source=test'}),organization('b','Acme Incorporated',{website:'http://acme.example'})]);
assert.equal(matches.length,1);assert.deepEqual(matches[0].reasons,['Same website']);
assert.equal(findPeopleDuplicates([organization('a','Alpha',{website:'https://linkedin.com'}),organization('b','Beta',{website:'https://linkedin.com'})]).length,0);
assert.equal(findPeopleDuplicates([organization('a','Alpha',{website:'https://sites.google.com/view/alpha'}),organization('b','Beta',{website:'https://sites.google.com/view/beta'})]).length,0);
const records=[person('a','Alice',{primaryEmail:'a@example.com'}),person('b','Alice',{primaryEmail:'a@example.com'}),person('c','Carol')];
const before=JSON.stringify(records);matches=findPeopleDuplicates(records);assert.equal(matches.length,1);assert.equal(matches[0].reasons.length,2);assert.equal(JSON.stringify(records),before);
for(const [raw,code,expected] of [['412345678','+61','+61 412-345-678'],['987654321','+51','+51 987-654-321'],['6145550142','+1','+1 614-555-0142'],['+44 20 7946 0018','+44','+44 20-7946-0018']]) {
  assert.equal(formatInternationalPhone(raw,code),expected);assert.equal(normalizePhoneForStorage(expected,code),expected.replace(/[^+\d]/g,''));assert.equal(validateInternationalPhone(raw,code),null);
}
assert(validateInternationalPhone('123','+61'));
assert(PHONE_COUNTRY_CHOICES.some(item=>item.code==='+61' && item.digits.startsWith('9') && item.flag.includes('🇦🇺')));
assert.equal(normalizePhoneForStorage('0412 345 678','+61'),'+61412345678');
assert.equal(validateInternationalPhone('98765432','+51') !== null,true);
assert.equal(new Set(PHONE_COUNTRY_CHOICES.map(item=>item.code)).size,PHONE_COUNTRY_CHOICES.length);
for (const [stored, code, display] of [['+16145550142','+1','614-555-0142'],['+51987654321','+51','987-654-321'],['+442079460018','+44','20-7946-0018'],['+61412345678','+61','412-345-678'],['','+1','']]) {
  assert.equal(formatLocalPhone(stored, code), display);
  assert.equal(normalizePhoneForStorage(display, code), stored);
}
console.log('People duplicate and phone refinements: passed');
