/* Deterministic lookup/paste regression checks; no provider calls or stored records. */
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { splitPastedAddress, formatPlaceAddress } = require('../lib/modules/planning/place-address.ts');
const { searchPlaceCoordinates, searchFullPlace, parsePlaceSearch, rankPlaceSuggestions, canAutofillCoordinates, placeFromSearch } = require('../lib/modules/planning/place-search.ts');
(async () => {
  const parts = { street: '3087 Terminal Dr', city: 'Hebron', region: 'KY', postalCode: '41048', district: '' };
  for (const address of ['3087 Terminal Dr, Hebron, KY 41048', '3087 Terminal Dr Hebron, KY 41048', '3087 Terminal Dr Hebron KY 41048', '3087 Terminal Dr, Hebron, Kentucky 41048, USA', '3087 Terminal Dr\nHebron, KY 41048\nUnited States', '3087 Terminal Dr, Hebron, KY, 41048']) {
    assert.deepEqual(splitPastedAddress(address), parts);
  }
  assert.deepEqual(splitPastedAddress('10 Main St\nSuite 2\nNew York, NY 10001-1234'), { street: '10 Main St, Suite 2', city: 'New York', region: 'NY', postalCode: '10001-1234', district: '' });
  assert.equal(formatPlaceAddress(parts, 'US'), '3087 Terminal Dr, Hebron, KY 41048, United States');
  assert.deepEqual(splitPastedAddress('10 Main St, Charleston, West Virginia 25301'), { street: '10 Main St', city: 'Charleston', region: 'WV', postalCode: '25301', district: '' });
  assert.deepEqual(splitPastedAddress('10 Main St NW Suite 2 New York NY 10001'), { street: '10 Main St NW Suite 2', city: 'New York', region: 'NY', postalCode: '10001', district: '' });
  for (const text of ['3087 Terminal Dr', '10 Main St Apt 41048', 'Hebron, KY 41048', '10 Rue de Test, Paris 75001', 'https://example.com']) assert.equal(splitPastedAddress(text), undefined);
  assert.equal(splitPastedAddress('3087 Terminal Dr, Hebron, KY 41048', 'GB'), undefined);
  const airport = { name: 'Cincinnati/Northern Kentucky International Airport', latitude: 39.0499, longitude: -84.6651, countryCode: 'US' };
  const tenant = { name: 'Samuel Adams Cincinnati Brewhouse', latitude: 39.0533, longitude: -84.6533, countryCode: 'US' };
  const calls = [], address = formatPlaceAddress(parts, 'US');
  const search = async (q, country) => { calls.push([q, country]); return q.startsWith('CVG,') ? [airport, { ...tenant, countryCode: 'IT' }] : [tenant, airport]; };
  assert.deepEqual(await searchPlaceCoordinates(address, { name: 'CVG', countryCode: 'US', addressParts: parts }, search), [airport, tenant]);
  assert.deepEqual(calls, [['CVG, Hebron, KY, 41048, United States', 'US'], [address, 'US']]);
  calls.length = 0;
  assert.deepEqual(await searchPlaceCoordinates(address, { name: 'CVG', countryCode: 'US' }, search), [airport, tenant]);
  assert.equal(calls[0][0], 'CVG, Hebron, KY, 41048, United States');
  calls.length = 0;
  await searchPlaceCoordinates('3087 Terminal Dr Hebron, KY 41048', { name: 'CVG', countryCode: 'US', addressParts: { street: '3087 Terminal Dr Hebron, KY 41048', city: '', region: '', postalCode: '', district: '' } }, search);
  assert.equal(calls[0][0], 'CVG, Hebron, KY, 41048, United States', 'Empty structured fields must not hide the full address');
  const fallbackCalls = [];
  const result = await searchPlaceCoordinates('Terminal address without a postal code', { name: 'CVG', countryCode: 'US' }, async query => {
    fallbackCalls.push(query); return query.startsWith('CVG,') ? [airport] : [{ ...tenant, addressParts: parts }];
  });
  assert.equal(result[0].name, airport.name);
  assert.deepEqual(fallbackCalls, ['Terminal address without a postal code', 'CVG, Hebron, KY, 41048, United States']);
  assert.deepEqual(await searchPlaceCoordinates(address, { name: 'Home', addressParts: parts }, async q => { if (q.startsWith('Home,')) throw Error('Unavailable'); return [tenant]; }), [tenant]);
  assert.deepEqual(await searchPlaceCoordinates(address, { name: 'CVG', addressParts: parts }, async q => { if (q === address) throw Error('Unavailable'); return [airport]; }), [airport]);
  assert.deepEqual(await searchPlaceCoordinates(address, {}, async () => []), []);
  await assert.rejects(() => searchPlaceCoordinates(address, {}, async () => { throw Error('Provider unavailable'); }), /Provider unavailable/);
  await assert.rejects(() => searchPlaceCoordinates('', {}, search), /address characters/);
  // Provider-shaped fixtures: international areas must not invent street addresses.
  const feature = (properties, coordinates = [-75.8217313, 23.441]) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates } });
  const worldwide = parsePlaceSearch({ features: [
    feature({ name: 'Écuras', type: 'city', countrycode: 'FR', country: 'France', state: 'Nouvelle-Aquitaine' }, [.56, 45.68]),
    feature({ name: 'Exuma', type: 'city', osm_key: 'boundary', osm_value: 'administrative', countrycode: 'BS', country: 'The Bahamas', osm_type: 'R', osm_id: 3776652 }),
    feature({ name: 'The Bahamas', type: 'country', osm_key: 'place', osm_value: 'archipelago', countrycode: 'BS', country: 'The Bahamas', osm_type: 'R', osm_id: 547469 }, [-78, 24.77]),
    feature({ name: 'Tokyo', type: 'city', countrycode: 'JP', country: 'Japan' }, [139.76, 35.68]),
    feature({ name: 'Paris café', type: 'house', housenumber: '10', street: 'Rue de Test', city: 'Paris', postcode: '75001', countrycode: 'FR', country: 'France' }, [2.35, 48.85]),
    feature({ name: 'Invalid' }, [NaN, 91])
  ] }, 'Exumas');
  assert.equal(worldwide.length, 5);
  const exuma = worldwide.find(row => row.name === 'Exuma');
  assert.equal(exuma.countryCode, 'BS'); assert.equal(exuma.addressParts.street, ''); assert.equal(exuma.addressParts.city, 'Exuma'); assert.equal(exuma.precision, 'area'); assert.equal(exuma.sourceUrl, 'https://www.openstreetmap.org/relation/3776652');
  const bahamas = worldwide.find(row => row.name === 'The Bahamas');
  assert.equal(bahamas.address, 'The Bahamas'); assert.equal(bahamas.addressParts.street, ''); assert.equal(bahamas.addressParts.postalCode, '');
  const cafe = worldwide.find(row => row.name === 'Paris café'); assert.equal(cafe.addressParts.street, '10 Rue de Test'); assert.equal(cafe.precision, 'address'); assert.equal(cafe.countryCode, 'FR');
  const globalCalls = [];
  const globalSearch = async (...args) => { globalCalls.push(args); return [...worldwide, exuma]; };
  const ranked = await searchFullPlace(' Exumas ', globalSearch);
  assert.equal(ranked[0].name, 'Exuma'); assert.equal(ranked.length, 5);
  assert.deepEqual(globalCalls, [['Exumas']], 'No implicit US or old-draft country filter');
  assert.equal((await searchFullPlace('Bahamas', globalSearch))[0].name, 'The Bahamas');
  await assert.rejects(() => searchFullPlace('https://example.com', globalSearch), /place name/);
  await assert.rejects(() => searchFullPlace('a'.repeat(501), globalSearch), /place name/);
  await assert.rejects(() => searchFullPlace('Exumas', async () => { throw Error('Rate limited'); }), /Rate limited/);
  assert.deepEqual(await searchFullPlace('No known match', async () => []), []);

  const venue = { name: 'North Café', address, latitude: 39.05, longitude: -84.65, countryCode: 'US', addressParts: parts, precision: 'address', sourceUrl: 'https://www.openstreetmap.org/node/10' };
  const localBranch = { ...venue, name: 'North Cafe', address: address.replace('Dr', 'Drive'), addressParts: { ...parts, street: '3087 Terminal Drive' }, latitude: 39.0501, sourceUrl: 'https://example.org/places/a' };
  const distantBranch = { ...venue, address: '24 Beach Road, Miami, FL 33135', addressParts: { ...parts, street: '24 Beach Road', city: 'Miami', region: 'FL', postalCode: '33135' }, latitude: 25.76, longitude: -80.19, sourceUrl: 'https://example.org/places/b' };
  const neighboringBranch = { ...localBranch, addressParts: { ...parts, street: '3089 Terminal Dr' }, address: address.replace('3087', '3089'), sourceUrl: 'https://example.org/places/c' };
  const otherTenant = { ...localBranch, name: 'South Coffee', sourceUrl: 'https://example.org/places/d' };
  const candidates = [distantBranch, otherTenant, neighboringBranch, venue, localBranch];
  assert.equal(rankPlaceSuggestions('North Cafe, Miami', candidates)[0], distantBranch);
  assert.equal(rankPlaceSuggestions('North Cafe', candidates, { name: 'North Cafe', countryCode: 'US', addressParts: parts })[0], venue);
  assert.equal(rankPlaceSuggestions('3087 Terminal Drive, Hebron', [neighboringBranch, venue])[0], venue);
  assert.equal(rankPlaceSuggestions('North Cafe', candidates).length, 4, 'Nearby reports of one venue merge while tenants and branches stay distinct');
  const directoryBranch = { ...neighboringBranch, providerConfidence: .97,
    sourceUrl: 'https://explore.overturemaps.org/?feature=places.place.8b01262a-8209-4012-8879-1125bfcb09b3' };
  assert.deepEqual(rankPlaceSuggestions('North Cafe', [venue, directoryBranch]), [directoryBranch, venue], 'Confidence only resolves equal-relevance named venue choices, retaining conflicts');
  assert.equal(rankPlaceSuggestions('North Cafe', [directoryBranch, venue], { name: 'North Cafe', countryCode: 'US', addressParts: parts })[0], venue, 'Explicit street wins against a high-confidence neighboring branch');
  const confidentDistant = { ...directoryBranch, ...distantBranch, sourceUrl: directoryBranch.sourceUrl };
  assert.equal(rankPlaceSuggestions('North Cafe, Hebron', [confidentDistant, venue])[0], venue, 'Explicit locality wins over directory confidence');
  const confidentTenant = { ...directoryBranch, name: 'South Coffee' };
  assert.equal(rankPlaceSuggestions('North Cafe', [confidentTenant, venue])[0], venue, 'Exact name wins over directory confidence');
  for (const providerConfidence of [undefined, NaN, Infinity, -.1, 1.1, '1']) {
    const invalidConfidence = { ...directoryBranch, providerConfidence };
    assert.equal(rankPlaceSuggestions('North Cafe', [venue, invalidConfidence])[0], venue, 'Missing or invalid confidence is neutral');
  }
  assert.equal(rankPlaceSuggestions('North Cafe', [venue, { ...directoryBranch, sourceUrl: 'https://example.org/places/untrusted' }])[0], venue, 'Unrecognized source cannot claim Overture confidence');
  assert.equal(canAutofillCoordinates([directoryBranch], address, { name: 'North Cafe', countryCode: 'US', addressParts: parts }), false, 'Confidence never verifies a conflicting address');
  assert(!Object.hasOwn(placeFromSearch(directoryBranch), 'providerConfidence'), 'Lookup confidence is not saved-place data');
  const secondCounter = { ...venue, sourceUrl: 'https://www.openstreetmap.org/node/11' };
  assert.equal(rankPlaceSuggestions('North Cafe', [localBranch, venue, secondCounter]).length, 2, 'One cross-source candidate must not bridge two separate source records');
  assert.equal(rankPlaceSuggestions('North Cafe', [venue, { ...localBranch, latitude: 40 }]).length, 2, 'Conflicting coordinates stay reviewable');
  assert.equal(rankPlaceSuggestions('North Cafe', [venue, { ...localBranch, countryCode: 'CA' }]).length, 2);
  assert.deepEqual(rankPlaceSuggestions('North Cafe', [{ ...venue, longitude: 181 }, { ...venue, latitude: NaN }]), []);
  const verified = { name: 'North Cafe', countryCode: 'US', addressParts: parts };
  assert.equal(canAutofillCoordinates([localBranch], address, verified), true);
  assert.equal(canAutofillCoordinates([venue, neighboringBranch], address, verified), false);
  for (const row of [otherTenant, neighboringBranch, distantBranch, { ...venue, latitude: NaN }, { ...venue, countryCode: 'CA' }, { ...venue, precision: 'area' }, { ...venue, precision: 'approximate' }, { ...venue, addressParts: { ...parts, postalCode: '41049' } }]) {
    assert.equal(canAutofillCoordinates([row], address, verified), false);
  }
  assert.equal(canAutofillCoordinates([venue], parts.street, { addressParts: { street: parts.street, city: '', region: '', district: '', postalCode: '' } }), false);
  const unsupported = parsePlaceSearch({ features: [feature({ name: 'A', housenumber: '10' }), feature({ osm_key: 'amenity' })] }, 'North Cafe');
  assert.equal(unsupported.length, 1);
  assert.equal(unsupported[0].precision, 'approximate');
  console.log('PASS: locality and street ranking, conservative cross-provider deduplication, distinct branches and tenants, and automatic coordinates only on corroborated addresses.');
  console.log('PASS: worldwide full-place lookup, Exumas/Bahamas ranking, international structured addresses, area-center precision, duplicate suggestions, invalid coordinates, bounded inputs and provider errors.');
  console.log('PASS: full-address paste, units, ZIP+4, conservative preservation, named venue priority, country filtering, deduplication, legacy address parsing and partial provider failure.');
})().catch(error => { console.error(error); process.exitCode = 1; });
