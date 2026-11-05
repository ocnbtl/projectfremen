// Independent operator addresses for public venues. This command never starts an app
// or opens user data. By default it only replays previously recorded public responses.
// Use --sample to permit paced Photon searches and bounded Overture tile ranges.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Module = require('node:module');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const holdout = process.argv.includes('--holdout');
const cases = holdout ? require('./place-venue-holdout.json') : require('./place-venue-cases.json');
// Keep the original score reproducible. Human review of the frozen holdout found
// two legitimate name variants that its strict aliases missed. Record a second
// score, requiring the same published street and locality in either case.
const reviewedAliases = {
  'Purple Poulet, Newport KY': ['The Purple Poulet'],
  'Café Myriade, rue Mackay, Montréal': ['Myriade'],
};

const app = path.resolve(__dirname, '..');
process.chdir(app); // Local city catalog paths use the same working directory as Next.
const baseRevision = '7c0420c14f376d024025e86d32da31d374888b70';
const out = path.join(app, 'output', 'place-venue-benchmark');
fs.mkdirSync(out, { recursive: true });
const cacheFile = path.join(out, 'public-responses.json');
const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
const allowSample = process.argv.includes('--sample');
const baselineOnly = process.argv.includes('--baseline-only');
const structured = process.argv.includes('--structured');
const fetchPublic = global.fetch;
let stopped = false;
let requests = 0;
let queued = Promise.resolve();
let archiveCalls = 0;
let archiveBudget = 0;
const archiveDir = path.join(out, 'public-archive');
fs.mkdirSync(archiveDir, { recursive: true });

function transpile(source) {
  return ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true,
  } }).outputText;
}
require.extensions['.ts'] = (module, file) => module._compile(transpile(fs.readFileSync(file, 'utf8')), file);
const planning = path.join(app, 'lib', 'modules', 'planning');
function originalSearch() {
  const file = path.join(planning, 'place-search.ts');
  const source = execFileSync('git', ['show', baseRevision + ':dashboard/lib/modules/planning/place-search.ts'], {
    cwd: app, encoding: 'utf8',
  });
  const original = new Module(file, module);
  original.filename = file;
  original.paths = Module._nodeModulePaths(planning);
  original._compile(transpile(source), file);
  return original.exports;
}

async function fetchOnce(target) {
  const url = new URL(target);
  if (url.origin !== 'https://photon.komoot.io' || url.pathname !== '/api/') throw Error('Unexpected provider');
  url.searchParams.sort();
  if (!cache[url.href]) {
    if (!allowSample) throw Error('Unrecorded public response (offline mode)');
    if (stopped || requests >= 24) throw Error('Public sample limit reached');
    await new Promise(resolve => setTimeout(resolve, 2100));
    requests++;
    const response = await fetchPublic(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Unigentamos-place-quality-check/1.0 (https://unigentamos.com)' },
      signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    if (!response.ok) {
      if ([403, 429, 503].includes(response.status)) stopped = true;
      throw Error('Public sample returned HTTP ' + response.status);
    }
    const body = await response.json();
    if (!Array.isArray(body.features)) throw Error('Unexpected provider response');
    cache[url.href] = { at: new Date().toISOString(), body };
    fs.writeFileSync(cacheFile, JSON.stringify(cache));
  }
  return Response.json(cache[url.href].body);
}
async function readArchive(url, options = {}) {
  const catalog = url.href === 'https://stac.overturemaps.org/catalog.json';
  const range = new Headers(options.headers).get('range') || '';
  const limits = /^bytes=(\d+)-(\d+)$/.exec(range);
  if (!catalog && (url.origin !== 'https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com' ||
    !/^\/tiles\/\d{4}-\d\d-\d\d\.\d+\/places\.pmtiles$/.test(url.pathname) || url.search || !limits)) {
    throw Error('Unexpected public archive request');
  }
  const size = catalog ? 65536 : Number(limits[2]) - Number(limits[1]) + 1;
  if (!Number.isSafeInteger(size) || size < 1 || size > 3 * 1024 * 1024) throw Error('Invalid archive range');
  const key = createHash('sha256').update(url.href + ' ' + range).digest('hex');
  const file = path.join(archiveDir, key);
  if (fs.existsSync(file + '.json')) {
    return new Response(fs.readFileSync(file), JSON.parse(fs.readFileSync(file + '.json', 'utf8')));
  }
  if (!allowSample || stopped || archiveCalls >= 200 || archiveBudget + size > 40 * 1024 * 1024) {
    throw Error('Public archive recording unavailable or bounded sample exhausted');
  }
  archiveCalls++;
  archiveBudget += size;
  const response = await fetchPublic(url, {
    signal: options.signal, redirect: 'error', headers: range ? { Range: range } : {},
  });
  if ([403, 429, 503].includes(response.status)) stopped = true;
  const contentRange = response.headers.get('content-range');
  if (response.status !== (catalog ? 200 : 206) ||
    (!catalog && !contentRange?.startsWith('bytes ' + limits[1] + '-' + limits[2] + '/')) ||
    Number(response.headers.get('content-length')) > size) {
    await response.body?.cancel();
    throw Error('Invalid public archive response (HTTP ' + response.status + ')');
  }
  const chunks = [];
  let received = 0;
  for await (const chunk of response.body) {
    received += chunk.length;
    if (received > size) throw Error('Archive response exceeded declared range');
    chunks.push(chunk);
  }
  if (!catalog && received !== size) throw Error('Partial public archive response');
  const body = Buffer.concat(chunks);
  const meta = { status: response.status, headers: contentRange ? { 'content-range': contentRange } : {} };
  fs.writeFileSync(file, body);
  fs.writeFileSync(file + '.json', JSON.stringify(meta));
  return new Response(body, meta);
}
let errors = new Set();
global.fetch = (target, options) => {
  const url = new URL(target);
  if (url.origin !== 'https://photon.komoot.io') return readArchive(url, options).catch(error => {
    errors.add(error.message); throw error;
  });
  const result = queued.then(() => fetchOnce(url)).catch(error => { errors.add(error.message); throw error; });
  queued = result.catch(() => {});
  return result;
};

function words(value = '') {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/['’]/g, '').replace(/&/g, ' and ').replace(/[^\p{L}\d]+/gu, ' ').trim();
}
function streetKey(value) {
  // A house number can precede or follow the street in different countries.
  return words(value).replace(/\bstreet\b/g, 'st').replace(/\bavenue\b/g, 'ave')
    .replace(/\bhighway\b/g, 'hwy').split(' ').sort().join(' ');
}
function checkVenue(test, row) {
  const parts = row.addressParts || {};
  const namedVenue = test.names.some(alias => words(alias) === words(row.name));
  const city = test.cities.some(city => [parts.city, parts.district, parts.region].some(part => words(part) === words(city)));
  const locality = city && row.countryCode === test.country;
  const observed = streetKey(parts.street);
  const expected = streetKey(test.street);
  // Some operators list just the street while a provider also includes a corner
  // or building reference. Match a complete comma-delimited street component.
  const street = (parts.street || '').split(',').some(component => streetKey(component) === expected);
  const missingNumber = observed && !/\d/.test(observed) && expected.replace(/\b\d+\b/g, '').trim() === observed;
  const addressStatus = street ? 'matches' : !observed ? 'missing street' :
    missingNumber ? 'missing house number' : 'different street or number';
  let distanceToOperatorPinMeters;
  if (test.operatorMapPin) {
    const [lat, lon] = test.operatorMapPin;
    const radians = Math.PI / 180;
    const a = Math.sin((lat - row.latitude) * radians / 2) ** 2 +
      Math.cos(lat * radians) * Math.cos(row.latitude * radians) * Math.sin((lon - row.longitude) * radians / 2) ** 2;
    distanceToOperatorPinMeters = Math.round(12742000 * Math.asin(Math.min(1, Math.sqrt(a))));
  }
  return { namedVenue, locality, addressStatus, verified: namedVenue && locality && street, distanceToOperatorPinMeters };
}
function describe(test, rows) {
  const checks = rows.map(row => checkVenue(test, row));
  const first = checks.findIndex(check => check.verified);
  const reviewedNames = reviewedAliases[test.query] || [];
  const reviewedFirst = checks.findIndex((check, index) => check.verified ||
    (check.locality && check.addressStatus === 'matches' && reviewedNames.some(alias => words(alias) === words(rows[index].name))));
  return {
    returned: rows.length, verifiedRank: first < 0 ? null : first + 1,
    reviewedRank: reviewedFirst < 0 ? null : reviewedFirst + 1,
    nameAndLocalityRank: checks.findIndex(check => check.namedVenue && check.locality) + 1 || null,
    candidates: rows.map((row, index) => ({
      name: row.name, address: row.address, sourceUrl: row.sourceUrl, latitude: row.latitude,
      longitude: row.longitude, ...checks[index],
    })),
  };
}

async function main() {
  const baseline = originalSearch();
  const { searchPlaces } = require(path.join(planning, 'map-providers.ts'));
  async function oldLookup(query) {
    const params = new URLSearchParams({ q: query, limit: '8', lang: 'en' });
    return baseline.parsePlaceSearch(await (await global.fetch('https://photon.komoot.io/api/?' + params)).json(), query);
  }
  const searches = { baseline: query => baseline.searchFullPlace(query, oldLookup) };
  if (!baselineOnly) {
    const { searchVenueAutofill } = require(path.join(planning, 'place-autofill.ts'));
    const { searchOverturePlaces } = require(path.join(planning, 'overture-places.ts'));
    searches.current = (query, test) => searchVenueAutofill(query, structured ? {
      countryCode: test.country,
      addressParts: { street: '', city: test.cities[0], region: '', postalCode: '', district: '' },
    } : {}, searchPlaces, searchOverturePlaces);
  }
  const results = [];
  for (const test of cases) {
    const query = structured ? test.names[0] : test.query;
    const result = { query, source: test.source };
    if (structured) result.context = { city: test.cities[0], country: test.country };
    for (const [label, search] of Object.entries(searches)) {
      errors = new Set();
      try { result[label] = describe(test, await search(query, test)); }
      catch (error) { result[label] = { error: error.message }; }
      if (errors.size) result[label].providerErrors = [...errors];
    }
    results.push(result);
    console.log(query, Object.fromEntries(Object.keys(searches).map(label =>
      [label, result[label].error ?? result[label].verifiedRank ?? 'unverified'])));
    if (stopped) break;
  }
  const totals = Object.fromEntries(Object.keys(searches).map(label => {
    const rows = results.map(result => result[label]);
    return [label, {
      attempted: rows.length, errors: rows.filter(row => row.error).length,
      nameAndLocality: rows.filter(row => row.nameAndLocalityRank).length,
      operatorStreetMatched: rows.filter(row => row.verifiedRank).length,
      operatorStreetMatchedFirst: rows.filter(row => row.verifiedRank === 1).length,
      reviewedStreetMatched: rows.filter(row => row.reviewedRank).length,
      reviewedStreetMatchedFirst: rows.filter(row => row.reviewedRank === 1).length,
    }];
  }));
  const report = { at: new Date().toISOString(), baseRevision, sampleSize: cases.length,
    photonRequests: requests, archiveRequests: archiveCalls, archiveBudgetBytes: archiveBudget,
    mode: allowSample ? 'bounded public provider sample plus cached responses' : 'offline public response replay',
    scoring: 'Named venue, operator street and house number, locality and country. Separate distance where operator links a map pin. No synthetic candidates.',
    totals, results };
  const filename = (holdout ? 'holdout-' : '') + (baselineOnly ? 'baseline-' : '') + (structured ? 'structured-' : '') + 'results.json';
  fs.writeFileSync(path.join(out, filename), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(totals));
  if (results.length !== cases.length || results.some(result => Object.keys(searches).some(label => result[label].error))) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
