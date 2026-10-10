/* Deterministic lookup/paste regression checks; no provider calls or stored records. */
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { splitPastedAddress, formatPlaceAddress } = require('../lib/modules/planning/place-address.ts');
const { searchPlaceCoordinates } = require('../lib/modules/planning/place-search.ts');
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
  console.log('PASS: full-address paste, units, ZIP+4, conservative preservation, named venue priority, country filtering, deduplication, legacy address parsing and partial provider failure.');
})().catch(error => { console.error(error); process.exitCode = 1; });
