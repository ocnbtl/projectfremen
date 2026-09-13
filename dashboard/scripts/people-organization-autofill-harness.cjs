const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), ts = require('typescript');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fremen-organization-enrichment-'));
process.env.FREMEN_DATA_DIR = data;
process.env.SUPABASE_URL = ''; process.env.SUPABASE_SERVICE_ROLE_KEY = ''; process.env.FREMEN_REQUIRE_SUPABASE = 'false';
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true } }).outputText, filename);
const { applyPersonAutofill, validatePersonAutofillPending, personAutofillHasChanges } = require('../lib/modules/people/person-autofill.ts');
const { enrichPersonOrganizations } = require('../lib/modules/people/person-organization-autofill.ts');
const { normalizeOrganizationIndustry } = require('../lib/modules/people/organization-industries.ts');
const { emptyOrganizationSuggestions } = require('../lib/modules/people/organization-autofill.ts');
const { matchesOrganizationWebsiteIdentity } = require('../lib/server/organization-metadata.ts');
const { discoverOrganization } = require('../lib/server/organization-discovery.ts');
const { discoverImportedEmployer } = require('../lib/server/import-organization.ts');
const store = require('../lib/personal-records-store.ts');
const sourceUrl = 'https://studio.example', evidence = 'Organization structured data';
const suggestion = (field, value) => ({ field, value, sourceUrl, evidence });
const result = { suggestions: [], occupations: [{ title: 'Designer', employer: 'Example Studio', status: 'current', sourceUrl, evidence }, { title: 'Illustrator', employer: 'Example Studio', status: 'past', sourceUrl, evidence }], education: [{ institution: 'Example University', sourceUrl, evidence }], sources: [sourceUrl], fetchedAt: new Date().toISOString(), message: 'Found' };
const empty = { occupations: [], education: [] };
const ld = (org) => `<script type="application/ld+json">${JSON.stringify(org)}</script>`;
(async () => {
  let active = 0, peak = 0, calls = [];
  const enriched = await enrichPersonOrganizations(empty, result, async (name) => {
    calls.push(name); peak = Math.max(peak, ++active);
    await new Promise(resolve => setImmediate(resolve)); active--;
    if (name === 'Example University') throw Error('Unavailable source');
    return { suggestions: [suggestion('organizationType', 'Business'), suggestion('industry', 'Design'), suggestion('context', 'A studio creating accessible tools.'), suggestion('website', sourceUrl), suggestion('foundedYear', '2001'), suggestion('teamSize', '50'), suggestion('headquarters', 'Cleveland, Ohio, USA'), suggestion('streetAddress', '10 Main Street, Cleveland, Ohio, 44101, USA')], message: 'Public details found' };
  }, new AbortController().signal);
  assert.equal(calls.length, 2, 'Repeated employment checks its organization only once'); assert.equal(peak, 2);
  assert.equal(enriched.organizations.length, 2); assert.ok(enriched.organizations.some(item => !item.suggestions.length), 'Partial lookup failure remains visible');
  assert.equal(enriched.occupations.length, 2, 'Failed school lookup does not discard person details');
  const canceled = new AbortController(); canceled.abort();
  await assert.rejects(() => enrichPersonOrganizations(empty, result, async () => { throw Error('Must not run'); }, canceled.signal), /abort/i);
  const draft = applyPersonAutofill(empty, enriched);
  const pending = validatePersonAutofillPending(draft.autofill);
  assert.equal(pending.organizations[0].suggestions.length, 8);
  assert.throws(() => validatePersonAutofillPending({ ...pending, organizations: [{ ...pending.organizations[0], suggestions: [suggestion('__proto__', 'x')] }] }), /Invalid/);
  assert.throws(() => validatePersonAutofillPending({ ...pending, organizations: [{ ...pending.organizations[0], suggestions: [{ ...suggestion('context', 'x'), sourceUrl: 'file:///secret' }] }] }));
  const created = await store.createPersonalRecord({ domain: 'notes-docs', className: 'person', title: 'Test Person', profile: draft }, { autofill: pending });
  const person = created.find(record => record.className === 'person'), studio = created.find(record => record.title === 'Example Studio');
  assert.equal(studio.profile.context, 'A studio creating accessible tools.'); assert.equal(studio.profile.industry, 'Professional services');
  assert.equal(studio.profile.foundedYear, '2001'); assert.equal(studio.profile.locations[0].address, '10 Main Street, Cleveland, Ohio, 44101, USA');
  assert.ok(studio.externalSources.includes(sourceUrl)); assert.equal(created.filter(record => record.className === 'org').length, 2);
  assert.ok(person.profile.occupations.every(job => job.organizationId === studio.id));
  await store.updatePersonalRecord(studio.id, { profile: { context: 'My curated description', teamSize: '', foundedYear: '1999' } });
  const current = (await store.readPersonalRecords()).find(record => record.id === person.id);
  const linkedResult = { ...enriched, organizations: enriched.organizations.map(item => ({ ...item, organizationId: afterOrganizationId(item.name) })) };
  function afterOrganizationId(name) { return created.find(record => record.className === 'org' && record.title === name)?.id; }
  assert.ok(personAutofillHasChanges(current.profile, linkedResult), 'Autofill can enrich an already linked organization');
  const secondDraft = applyPersonAutofill(current.profile, linkedResult);
  const blockedProfile = { ...result, occupations: [], education: [], message: 'Profile requires sign-in' };
  const retries = [];
  const recovered = await enrichPersonOrganizations(current.profile, blockedProfile, async (name, _website, id) => {
    retries.push({ name, id }); return { suggestions: [suggestion('teamSize', '50')], message: 'Public organization details found' };
  }, new AbortController().signal);
  assert.equal(retries.length, 2, 'Saved work and education are enriched even if the person source is blocked');
  assert.ok(retries.every(item => item.id));
  assert.ok(applyPersonAutofill(current.profile, recovered).autofill.organizations.every(plan => plan.suggestions?.length));
  const wrongReference = { ...recovered, organizations: recovered.organizations.map(item => ({ ...item, organizationId: 'different-organization' })) };
  assert.ok(applyPersonAutofill(current.profile, wrongReference).autofill.organizations.every(plan => !plan.suggestions?.length), 'Results from a different explicit organization are never reused');
  await store.updatePersonalRecord(person.id, { profile: secondDraft }, { expectedUpdatedAt: current.updatedAt, autofill: secondDraft.autofill });
  const after = await store.readPersonalRecords(), updated = after.find(record => record.id === studio.id);
  assert.equal(updated.profile.context, 'My curated description'); assert.equal(updated.profile.foundedYear, '1999'); assert.equal(updated.profile.teamSize, '50');
  assert.equal(after.filter(record => record.className === 'org').length, 2, 'Re-running autofill reuses existing organizations');
  const removed = { ...draft, occupations: [], education: [] };
  await store.createPersonalRecord({ domain: 'notes-docs', className: 'person', title: 'Canceled Suggestions', profile: removed }, { autofill: pending });
  assert.equal((await store.readPersonalRecords()).filter(record => record.className === 'org').length, 2);
  for (const [raw, expected] of [['Administration of Justice', 'Judicial / legal'], ['Federal Government', 'Federal'], ['State Government', 'State / provincial'], ['Local Government', 'Local / municipal'], ['Police Department', 'Public safety']]) assert.equal(normalizeOrganizationIndustry('Government', raw), expected);
  assert.equal(normalizeOrganizationIndustry('Business', 'Courtney Retail'), 'Retail & consumer');
  const courtName = 'Cuyahoga County Juvenile Court';
  const court = await discoverOrganization(courtName, [sourceUrl], { fetchPage: async (url) => ({ sourceUrl: url, html: ld({ '@type': 'GovernmentOrganization', name: courtName, url: sourceUrl, industry: 'Government Administration' }) }) });
  assert.equal(court.suggestions.find(item => item.field === 'industry').value, 'Judicial / legal');
  assert.equal(emptyOrganizationSuggestions([suggestion('industry', 'Judicial / legal')], { industry: 'Other' }).length, 1);
  assert.equal(emptyOrganizationSuggestions([suggestion('industry', 'Judicial / legal')], { industry: 'Public safety' }).length, 0);
  assert.ok(matchesOrganizationWebsiteIdentity('<title>Example Studio | Official website</title>', sourceUrl, 'Example Studio'));
  assert.ok(!matchesOrganizationWebsiteIdentity('<title>Company directory</title><p>Example Studio</p>', sourceUrl, 'Example Studio'));
  assert.ok(!matchesOrganizationWebsiteIdentity('<title>Example Studio</title>', sourceUrl + '/directory/example-studio', 'Example Studio'));
  let discoveryUrl = '';
  const lookup = await discoverImportedEmployer('Example Studio', '', {
    fetchPage: async (url) => ({ sourceUrl: url, html: url.includes('wikidata') ? '{"search":[]}' : url.includes('bing.com') ? `<li class="b_algo"><a href="${sourceUrl}">Example Studio</a></li>` : '<title>Example Studio | Official website</title>' }),
    discover: async (_name, urls) => { discoveryUrl = urls[0]; return { suggestions: [suggestion('context', 'Verified')], message: 'Matched' }; }
  });
  assert.equal(discoveryUrl, sourceUrl); assert.equal(lookup.suggestions.length, 1);
  const ambiguous = await discoverImportedEmployer('Example Studio', '', {
    fetchPage: async (url) => ({ sourceUrl: url, html: url.includes('wikidata') ? '{"search":[]}' : url.includes('bing.com') ? '<li class="b_algo"><a href="https://one.example">One</a></li><li class="b_algo"><a href="https://two.example">Two</a></li>' : '<title>Example Studio</title>' }),
    discover: async () => { throw Error('Ambiguous identity must not be used'); }
  });
  assert.equal(ambiguous.suggestions.length, 0);
  console.log('PASS: organization enrichment, bounded/deduplicated requests, partial failure, cancellation, atomic persistence/reuse, no overwrite, validation, judicial classification and verified name lookup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
