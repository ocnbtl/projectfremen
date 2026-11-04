/* Synthetic local persistence only. Network access fails the test. */
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), ts = require('typescript');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'fremen-merchant-test-'));
Object.assign(process.env, { FREMEN_DATA_DIR: fixture, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', FREMEN_REQUIRE_SUPABASE: 'false' });
global.fetch = async () => { throw new Error('Network is forbidden in merchant tests'); };
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const store = require('../lib/modules/finance/store.ts');
const native = require('../lib/file-store.ts');
const links = require('../lib/native-objects/link-store.ts');
const matcher = require('../lib/modules/finance/merchant-matching.ts');
const matchingStore = require('../lib/modules/finance/merchant-matching-store.ts');
const organizationsStore = require('../lib/modules/finance/merchant-store.ts');
const now = '2026-11-04T12:00:00.000Z';
const common = { createdAt: now, updatedAt: now, createdBy: 'test', currency: 'USD', entityScope: 'personal' };
const tx = (id, merchant, more = {}) => ({ ...common, id, merchant, occurredOn: '2026-11-04', amount: 12.34, accountId: 'a', direction: 'expense', category: 'Coffee', memo: 'Keep this note', status: 'pending', reviewed: false, reimbursable: true, source: { kind: 'manual' }, ...more });
const orgs = [{ id: 'coffee', title: '7 Brew Coffee' }, { id: 'pizza', title: "Domino’s (company)" }, { id: 'branch', title: 'Domino’s · Ohio Pike' }, { id: 'openai', title: 'OpenAI' }];
const ref = (row, org, kind = 'transaction') => ({ source: { module: 'finance', objectType: kind, objectId: row.id, label: row.merchant || row.name, route: `/admin/finance/${kind === 'bill' ? 'bills' : 'transactions'}?selected=${row.id}` }, target: { module: 'people', objectType: 'organization', objectId: org.id, label: org.title, route: `/admin/people/${org.id}` }, relationship: 'merchant' });
const evidence = (row, org, more = {}) => ({ ...ref(row, org), id: `link-${row.id}`, status: 'active', provenance: 'manual', createdAt: now, createdBy: 'test', ...more });
const base = () => {
  const state = store.createEmptyFinanceState();
  state.accounts = [{ ...common, id: 'a', name: 'Fixture checking', kind: 'Checking', institution: 'Fixture', mask: '', currentBalance: 1000, balanceAsOf: '2026-11-04', balanceSource: 'manual' }];
  state.transactions = [tx('seed-coffee', 'Brew Coffee Sb'), tx('seed-pizza', 'Dominos'), tx('old-unlinked', 'OpenAI')];
  return state;
};
const seedLinks = state => [evidence(state.transactions[0], orgs[0]), evidence(state.transactions[1], orgs[1])];
async function reset(state = base(), savedLinks = seedLinks(state)) {
  await native.writeJsonFile('finance.json', state);
  await native.writeJsonFile('native-object-links.json', { schemaVersion: 1, links: savedLinks });
  await native.writeJsonFile('personal-records.json', orgs.map(org => ({ ...org, className: 'org', domain: 'notes-docs', profile: {} })));
  return state;
}
const activeFor = async id => (await links.readNativeObjectLinks()).filter(link => link.source.objectId === id && link.status === 'active');
let passed = 0;
async function check(label, fn) { await fn(); passed++; console.log(`PASS ${label}`); }
async function main() {
  await check('exact normalized identities and learned aliases; no substring or branch guesses', () => {
    const state = base();
    state.transactions.push(tx('exact', ' OPENAI '), tx('alias', 'brew coffee sb'), tx('pizza', 'Domino’s'), tx('unknown', 'OpenAI Store 123'), tx('branch-word', 'Domino’s Eastgate'), tx('transfer', 'OpenAI', { direction: 'transfer' }), tx('archived', 'OpenAI', { archivedAt: now }));
    const before = JSON.stringify(state);
    const result = matcher.matchTransactionMerchants(state, new Set(state.transactions.slice(3).map(row => row.id)), orgs, seedLinks(state));
    assert.deepEqual(result.map(link => [link.source.objectId, link.target.objectId]), [['exact', 'openai'], ['alias', 'coffee'], ['pizza', 'pizza']]);
    assert.equal(JSON.stringify(state), before);
  });
  await check('ambiguous names/aliases, inferred evidence, stale labels and generic names stay unlinked', () => {
    const state = base(); state.transactions.push(tx('new', 'Brew Coffee Sb'));
    const match = (companies, saved) => matcher.matchTransactionMerchants(state, new Set(['new']), companies, saved);
    assert.equal(match(orgs, [...seedLinks(state), evidence(state.transactions[0], orgs[2], { id: 'conflict' })]).length, 0);
    assert.equal(match([...orgs, { id: 'collision', title: 'Brew Coffee Sb' }], seedLinks(state)).length, 0);
    assert.equal(match(orgs, [evidence(state.transactions[0], orgs[0], { provenance: 'inferred' })]).length, 0);
    state.transactions[0].merchant = 'Renamed merchant';
    assert.equal(match(orgs, seedLinks(base())).length, 0);
    state.transactions[3].merchant = 'Organization';
    assert.equal(match([{ id: 'generic', title: 'Organization' }], []).length, 0);
  });
  await check('active recurring bill aliases can teach a match without changing the bill', () => {
    const state = base(); state.bills = [{ ...common, id: 'bill', name: 'AI Subscription' }];
    state.transactions.push(tx('new', 'AI Subscription'));
    const before = JSON.stringify(state);
    const result = matcher.matchTransactionMerchants(state, new Set(['new']), orgs, [evidence(state.bills[0], orgs[3], { ...ref(state.bills[0], orgs[3], 'bill') })]);
    assert.equal(result[0].target.objectId, 'openai'); assert.equal(JSON.stringify(state), before);
  });
  await check('atomic concurrent inference adds one link and leaves every financial byte unchanged', async () => {
    const state = base(); state.transactions.push(tx('new', 'Brew Coffee Sb')); await reset(state);
    const before = fs.readFileSync(path.join(fixture, 'finance.json'), 'utf8');
    await Promise.all(Array.from({ length: 6 }, () => matchingStore.linkNewTransactionMerchants(state, new Set(['new']))));
    const saved = await activeFor('new'); assert.equal(saved.length, 1); assert.equal(saved[0].provenance, 'inferred');
    assert.equal(saved[0].target.objectId, 'coffee');
    assert.equal(fs.readFileSync(path.join(fixture, 'finance.json'), 'utf8'), before);
    assert.equal((await activeFor('old-unlinked')).length, 0);
  });
  await check('removed links block inference; explicit choices replace or confirm inferred links', async () => {
    const state = base(); state.transactions.push(tx('new', 'OpenAI')); await reset(state);
    await matchingStore.linkNewTransactionMerchants(state, new Set(['new']));
    const inferred = (await activeFor('new'))[0];
    await links.createNativeObjectRelationship({ ...ref(state.transactions.at(-1), orgs[3]), actorId: 'admin' });
    assert.equal((await activeFor('new'))[0].id, inferred.id);
    assert.equal((await activeFor('new'))[0].provenance, 'manual');
    await links.removeNativeObjectRelationship({ id: inferred.id });
    await matchingStore.linkNewTransactionMerchants(state, new Set(['new']));
    assert.equal((await activeFor('new')).length, 0);
    await reset(state); await matchingStore.linkNewTransactionMerchants(state, new Set(['new']));
    await links.createNativeObjectRelationship(ref(state.transactions.at(-1), orgs[0]));
    assert.deepEqual((await activeFor('new')).map(link => link.target.objectId), ['coffee']);
    await matchingStore.linkNewTransactionMerchants(state, new Set(['new']));
    assert.deepEqual((await activeFor('new')).map(link => link.target.objectId), ['coffee']);
  });
  await check('archived organizations are excluded and no organization is ever created', async () => {
    const state = base(); state.transactions.push(tx('new', 'OpenAI')); await reset(state);
    const records = orgs.map(org => ({ ...org, className: 'org', domain: 'notes-docs', archivedAt: now }));
    await native.writeJsonFile('personal-records.json', records);
    await matchingStore.linkNewTransactionMerchants(state, new Set(['new']));
    assert.equal((await activeFor('new')).length, 0);
    assert.deepEqual(await native.readJsonFile('personal-records.json', []), records);
  });
  await check('manual create persists a match, preserves financial input and retries without duplicates', async () => {
    const initial = await reset();
    const input = { kind: 'transaction', merchant: 'Brew Coffee Sb', occurredOn: '2026-11-04', accountId: 'a', amount: 17.43, direction: 'expense', status: 'pending', reviewed: false, memo: 'Preserve me' };
    const first = await store.createFinanceRecord(input, { idempotencyKey: 'manual', actorId: 'test' });
    assert.equal(first.item.amount, 17.43); assert.equal(first.item.status, 'pending'); assert.equal(first.item.memo, 'Preserve me');
    assert.equal((await activeFor(first.item.id))[0].target.objectId, 'coffee');
    const before = await store.readFinanceState();
    const retry = await store.createFinanceRecord(input, { idempotencyKey: 'manual', actorId: 'test' });
    assert.equal(retry.item.id, first.item.id); assert.deepEqual(await store.readFinanceState(), before);
    assert.deepEqual(before.transactions.slice(0, 3), initial.transactions);
    assert.equal((await activeFor(first.item.id)).length, 1); assert.equal((await activeFor('old-unlinked')).length, 0);
  });
  await check('CSV preview does not link; confirmed rows match once and keep pending/unreviewed status', async () => {
    await reset();
    const preview = await store.previewFinanceCsv({ accountId: 'a', sourceFilename: 'fixture.csv', csvText: 'Date,Description,Amount,Category\n2026-11-03,OpenAI,-23.45,Software\n2026-11-02,Unknown merchant,-6.78,Food' }, { actorId: 'test' });
    assert.equal((await links.readNativeObjectLinks()).length, 2);
    const input = { previewId: preview.previewId, selectedFingerprints: preview.rows.map(row => row.fingerprint) };
    await store.confirmFinanceImport(input, { actorId: 'test', idempotencyKey: 'csv' });
    const state = await store.readFinanceState(), imported = state.transactions.filter(row => row.source.kind === 'csv_import');
    assert.equal(imported.length, 2);
    const ai = imported.find(row => row.merchant === 'OpenAI');
    assert.equal(ai.amount, 23.45); assert.equal(ai.status, 'pending'); assert.equal(ai.reviewed, false);
    assert.equal((await activeFor(ai.id)).length, 1);
    assert.equal((await activeFor(imported.find(row => row.merchant === 'Unknown merchant').id)).length, 0);
    await store.confirmFinanceImport(input, { actorId: 'test', idempotencyKey: 'csv' });
    assert.deepEqual(await store.readFinanceState(), state);
    assert.equal((await activeFor(ai.id)).length, 1);
  });
  await check('bank additions and pending-to-posted updates retain transaction and link identity', async () => {
    await reset();
    const bank = { id: 'external', name: 'Checking', mask: '1234', kind: 'Checking', balance: 123.45, supported: true, currency: 'USD' };
    const mapping = await store.connectFinanceBankAccounts('fixture-bank', 'Fixture', [bank], { external: 'a' });
    const provider = require('../lib/modules/finance/banking-provider.ts');
    const source = { transaction_id: 'pending', account_id: 'external', date: '2026-11-04', name: 'OpenAI', merchant_name: 'OpenAI', amount: 11.11, pending: true, iso_currency_code: 'USD', personal_finance_category: { detailed: 'GENERAL_SERVICES_OTHER_GENERAL_SERVICES', primary: 'GENERAL_SERVICES' } };
    await store.applyFinanceBankBatch('fixture-bank', mapping, [bank], [provider.normalizeTransaction(source)], []);
    const pending = (await store.readFinanceState()).transactions.find(row => row.source.bank);
    assert(pending); const originalLink = (await activeFor(pending.id))[0]; assert(originalLink);
    const posted = provider.normalizeTransaction({ ...source, transaction_id: 'posted', pending_transaction_id: 'pending', pending: false });
    await store.applyFinanceBankBatch('fixture-bank', mapping, [bank], [posted], ['pending']);
    await store.applyFinanceBankBatch('fixture-bank', mapping, [bank], [posted], []);
    const state = await store.readFinanceState();
    assert.equal(state.transactions.filter(row => row.source.bank).length, 1);
    assert.equal(state.transactions.find(row => row.id === pending.id).amount, 11.11);
    assert.equal(state.transactions.find(row => row.id === pending.id).status, 'cleared');
    assert.deepEqual(await activeFor(pending.id), [originalLink]);
  });
  await check('optional matching failure cannot undo a saved transaction or cause a duplicate on retry', async () => {
    await reset(); const original = organizationsStore.readFinanceOrganizations, warn = console.warn;
    let warnings = 0; organizationsStore.readFinanceOrganizations = async () => { throw new Error('Synthetic identity storage failure'); }; console.warn = () => { warnings++; };
    try {
      const input = { kind: 'transaction', merchant: 'OpenAI', accountId: 'a', amount: 8, direction: 'expense' };
      const result = await store.createFinanceRecord(input, { idempotencyKey: 'failure' });
      await store.createFinanceRecord(input, { idempotencyKey: 'failure' });
      assert.equal((await store.readFinanceState()).transactions.filter(row => row.id === result.item.id).length, 1);
      assert.equal((await activeFor(result.item.id)).length, 0); assert.equal(warnings, 1);
    } finally { organizationsStore.readFinanceOrganizations = original; console.warn = warn; }
  });
  console.log(`${passed} merchant matching checks passed; synthetic local records only.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
