/* Isolated storage checks: no production records or external services. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), ts = require('typescript');
Object.assign(process.env, { FREMEN_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'fremen-primary-tag-')), SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', FREMEN_REQUIRE_SUPABASE: 'false' });
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, f);
const { savePlanningRecord: save, readPlanningState: read } = require('../lib/modules/planning/store.ts');
const { placePinIconRole, primaryPlaceTag } = require('../lib/modules/planning/place-tags.ts');
(async () => {
  let place = await save('places', { name: 'Primary tag fixture', tags: ['House', 'Food', 'Custom'], primaryTag: 'food' });
  assert.equal(place.primaryTag, 'Food');
  assert.equal((await read()).places.find(p => p.id === place.id).primaryTag, 'Food');
  assert.equal(placePinIconRole(place.tags, place.primaryTag), 'place-tag-food');
  place = await save('places', { id: place.id, notes: 'Unrelated edit' }, place.updatedAt);
  assert.equal(place.primaryTag, 'Food');
  place = await save('places', { id: place.id, primaryTag: 'Custom' }, place.updatedAt);
  assert.equal(placePinIconRole(place.tags, place.primaryTag), 'place-tag-custom');
  place = await save('places', { id: place.id, tags: ['House', 'Food'] }, place.updatedAt);
  assert.equal(place.primaryTag, undefined);
  assert.equal(placePinIconRole(place.tags, place.primaryTag), 'place-tag-house');
  place = await save('places', { id: place.id, primaryTag: 'Travel' }, place.updatedAt);
  assert.equal(place.primaryTag, undefined, 'An unselected tag cannot become primary');
  assert.equal(primaryPlaceTag(['Custom', 'School']), 'School');
  assert.equal(placePinIconRole([], 'House'), 'location');
  assert.equal(placePinIconRole(['Food', 'House'], ' HOUSE '), 'place-tag-house');
  console.log('Primary-tag persistence, edits, removal, custom and legacy fallback checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
