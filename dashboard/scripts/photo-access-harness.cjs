/* Synthetic local storage only: compare old/new eligibility, data integrity and CPU. */
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), ts = require('typescript');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fremen-photo-access-'));
Object.assign(process.env, { FREMEN_DATA_DIR: data, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', FREMEN_REQUIRE_SUPABASE: 'false' });
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { readPersonalRecords } = require('../lib/personal-records-store.ts');
const { hasPeoplePhotoProfile } = require('../lib/modules/people/profile-photo-access.ts');
const file = path.join(data, 'personal-records.json');
const stamp = '2026-10-01T12:00:00.000Z';
const records = Array.from({ length: 300 }, (_, i) => ({ id: `personal-00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, className: i % 5 ? 'person' : 'org', domain: 'family', title: `Synthetic contact ${i}`, createdAt: stamp, updatedAt: stamp, profile: { fullName: `Synthetic contact ${i}`, primaryEmail: `fixture${i}@example.invalid`, phoneNumber: '+15135550123', locations: [{ id: `location-${i}`, placeId: 'fixture-place', address: 'Synthetic address' }], occupations: [{ id: `occupation-${i}`, employer: 'Synthetic contact 0', organizationId: 'personal-00000000-0000-4000-8000-000000000000', title: 'Test role' }] } }));
const save = value => fs.writeFileSync(file, JSON.stringify(value));
(async () => {
  fs.writeFileSync(path.join(data, 'planning-records.json'), JSON.stringify({ places: [{ id: 'fixture-place', name: 'Fixture', address: 'Synthetic address', addressParts: { city: 'Fixture City' } }] }));
  save(records);
  // Persist normal metadata in the fixture so the timing comparison does not
  // exaggerate work by regenerating creation metadata on every old-path read.
  save(await readPersonalRecords());
  const persisted = JSON.parse(fs.readFileSync(file, 'utf8'));
  const special = [
    { id: 'legacy', kind: 'PERSON', title: 'Legacy' },
    { id: 'spaced', className: ' Org ', title: 'Whitespace', domain: 'family' },
    { id: 'unsupported', className: 'person', domain: 'not-a-domain' },
    { id: 'not-person', className: 'resource', domain: 'family' },
    { id: 'precedence', className: 'note', kind: 'person', domain: 'family' },
    { id: 'archived', className: 'person', domain: 'family', archivedAt: stamp }
  ];
  save([...persisted, ...special]);
  const before = fs.readFileSync(file, 'utf8');
  const normalized = await readPersonalRecords();
  for (const id of [...special.map(r => r.id), records[0].id, records[1].id, 'missing']) {
    assert.equal(await hasPeoplePhotoProfile(id), normalized.some(r => r.id === id && ['person', 'org'].includes(r.className)), id);
  }
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'eligibility checks do not modify records');
  const measure = async fn => {
    const started = process.cpuUsage();
    for (let i = 0; i < 15; i++) await fn();
    const usage = process.cpuUsage(started);
    return Math.round((usage.user + usage.system) / 1000);
  };
  const oldCpuMs = await measure(async () => (await readPersonalRecords()).find(r => r.id === records[0].id));
  const newCpuMs = await measure(() => hasPeoplePhotoProfile(records[0].id));
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'benchmark does not modify records');
  save(persisted.filter(r => r.id !== records[0].id));
  assert.equal(await hasPeoplePhotoProfile(records[0].id), false, 'deletion takes effect immediately without a stale identity cache');
  console.log(JSON.stringify({ result: 'PASS', fixtureRecords: 306, iterations: 15, oldCpuMs, newCpuMs, scope: 'Local synthetic profile eligibility only; not production CPU savings', checks: ['person/org/legacy/domain parity', 'no record writes', 'fresh deletion visibility'] }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(data, { recursive: true, force: true }));
