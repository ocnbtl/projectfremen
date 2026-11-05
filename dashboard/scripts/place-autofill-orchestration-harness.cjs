// Offline provider doubles, a public GERS identifier, and an isolated local store.
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const ts = require('typescript');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'place-autofill-regression-'));
Object.assign(process.env, { FREMEN_DATA_DIR: data, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', FREMEN_REQUIRE_SUPABASE: 'false' });
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, resolveJsonModule: true, esModuleInterop: true },
}).outputText, file);

const { searchVenueAutofill } = require('../lib/modules/planning/place-autofill.ts');
const { placeFromSearch } = require('../lib/modules/planning/place-search.ts');
const { savePlanningRecord, readPlanningState } = require('../lib/modules/planning/store.ts');
const { formatPlaceAddress } = require('../lib/modules/planning/place-address.ts');
const sourcePrefix = 'https://explore.overturemaps.org/?feature=places.place.';
const parts = { street: '1345 Main St', city: 'Cincinnati', region: 'OH', postalCode: '45202', district: '' };
const overture = {
  name: 'MOTR Pub', address: formatPlaceAddress(parts, 'US'), addressParts: parts, countryCode: 'US',
  latitude: 39.111107, longitude: -84.512297, precision: 'address', kind: 'pub',
  sourceUrl: sourcePrefix + '670d3088-22f9-49ff-b1a9-07aa0f0f2754', sourceLabel: 'Overture Maps',
};
const osmParts = { ...parts, street: '1345 Main Street', region: 'Ohio', district: 'Over-the-Rhine' };
const osm = {
  ...overture, sourceLabel: 'OpenStreetMap', addressParts: osmParts, address: formatPlaceAddress(osmParts, 'US'),
  latitude: 39.1110977, longitude: -84.5122838, sourceUrl: 'https://www.openstreetmap.org/node/2177822581',
};
const offline = async () => { throw Error('Provider offline'); };
const query = 'MOTR Pub, Cincinnati OH';

(async () => {
  let anchors = [];
  const nearby = async (name, anchor) => { anchors.push({ name, anchor }); return [overture]; };
  assert.deepEqual(await searchVenueAutofill(query, {}, offline, nearby), [overture]);
  assert.equal(anchors[0].name, 'MOTR Pub');
  assert(Math.abs(anchors[0].anchor.latitude - 39.1) < 0.2 && Math.abs(anchors[0].anchor.longitude + 84.5) < 0.2);
  assert.deepEqual(await searchVenueAutofill(query, {}, async () => [osm], offline), [osm]);
  await assert.rejects(() => searchVenueAutofill(query, {}, offline, offline), /unavailable/i);
  assert.equal((await searchVenueAutofill(query, {}, async () => [osm], nearby)).length, 1);

  // Both provider areas match the text but describe different cities.
  const ambiguous = ['Illinois', 'Massachusetts'].map((region, i) => ({
    name: 'Springfield', countryCode: 'US', address: 'Springfield, ' + region,
    addressParts: { street: '', city: 'Springfield', region, postalCode: '', district: '' },
    precision: 'area', latitude: [39.8, 42.1][i], longitude: [-89.6, -72.6][i],
  }));
  anchors = [];
  await searchVenueAutofill('Fixture Coffee, Springfield', {}, async q => q === 'Springfield' ? ambiguous : [], nearby);
  assert.equal(anchors.length, 0, 'Ambiguous provider localities cannot select a search anchor');
  assert.equal((await readPlanningState()).places.length, 0, 'A search must never save records');

  const save = row => savePlanningRecord('places', placeFromSearch(row));
  const original = await savePlanningRecord('places', { ...placeFromSearch(overture), notes: 'Keep this note' });
  assert.equal(original.lookup.sourceId, overture.sourceUrl);
  const reread = (await readPlanningState()).places.find(p => p.id === original.id);
  assert.equal(reread.lookup.sourceId, overture.sourceUrl);
  assert.equal((await save(overture)).id, original.id);
  const cross = await save(osm);
  assert.equal(cross.id, original.id);
  assert.equal(cross.notes, 'Keep this note');
  assert.equal(cross.lookup.sourceId, overture.sourceUrl);
  const nextParts = { ...parts, street: '1347 Main St' };
  const branch = await save({ ...osm, sourceUrl: 'https://www.openstreetmap.org/node/2',
    addressParts: nextParts, address: formatPlaceAddress(nextParts, 'US') });
  assert.notEqual(branch.id, original.id, 'Nearby branch must stay separate');
  const tenant = await save({ ...osm, name: 'Second Tenant', sourceUrl: 'https://www.openstreetmap.org/node/3' });
  assert.notEqual(tenant.id, original.id, 'Shared address must not merge tenants');
  const counter = await save({ ...overture, sourceUrl: sourcePrefix + '00000000-0000-4000-8000-000000000004' });
  assert.notEqual(counter.id, original.id, 'Distinct IDs in the same source stay separate');
  assert.equal((await save(overture)).id, original.id, 'Repeated stable ID wins over a similar branch');
  await assert.rejects(() => save(osm), /several saved places/i, 'Conflicting cross-source matches require a choice');
  await assert.rejects(() => save({ ...overture, sourceUrl: overture.sourceUrl + '&external=1' }), /source/i);
  assert.equal((await readPlanningState()).places.length, 4);
  console.log('PASS: provider fallback, local anchors, ambiguous locality, search without writes, stable GERS persistence, cross-provider reuse, branches, tenants and saved ambiguity.');
})().catch(error => { console.error(error); process.exitCode = 1; });
