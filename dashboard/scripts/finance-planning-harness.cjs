/* Isolated synthetic records only; no credentials or provider calls. */
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), ts = require('typescript');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'fremen-planning-test-'));
Object.assign(process.env, { FREMEN_DATA_DIR: fixture, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', FREMEN_REQUIRE_SUPABASE: 'false' });
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const store = require('../lib/modules/finance/store.ts'), { buildFinancePlan } = require('../lib/modules/finance/planning.ts');
const { financeStateToDataset } = require('../lib/modules/finance/native-view-model.ts');
const { buildFinanceTransactionsViewModel } = require('../lib/modules/finance/transactions-view-model.ts');
const { parseFinanceUrlState, normalizeFinanceUrlStateForView } = require('../lib/native-objects/url-state.ts');
const native = require('../lib/file-store.ts');
const now = new Date().toISOString(), today = now.slice(0, 10);
const common = { createdAt: now, updatedAt: now, createdBy: 'test', currency: 'USD', entityScope: 'personal' };
const account = { ...common, id: 'a', name: 'Fixture checking', kind: 'Checking', currentBalance: 1000, balanceAsOf: today, balanceSource: 'manual' };
const txn = (id, occurredOn, amount, more = {}) => ({ ...common, id, occurredOn, amount, accountId: 'a', category: 'Food and drink groceries', merchant: id, direction: 'expense', reviewed: false, status: 'cleared', memo: '', reimbursable: false, source: { kind: 'plaid' }, ...more });
let passed = 0; async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
async function main() {
  const state = store.createEmptyFinanceState(); state.accounts = [account];
  state.transactions = [txn('first', '2026-06-15', 999), txn('jul', '2026-07-03', 100), txn('aug', '2026-08-03', 200), txn('pending', '2026-09-03', 500, { status: 'pending' }), txn('transfer', '2026-07-04', 9999, { direction: 'transfer' }), txn('business', '2026-07-05', 50, { entityScope: 'business' })];
  const subscription = (id, d, amount = 20, extra = {}) => txn(id, d, amount, { merchant: 'Design subscription', category: 'General services other general services', ...extra });
  state.transactions.push(subscription('sub-jul', '2026-07-31'), subscription('sub-aug', '2026-08-31'));
  await check('planning excludes partial months, pending, transfers and preserves entity scopes', () => {
    const before = JSON.stringify(state), plan = buildFinancePlan(state, '2026-09-11');
    assert.deepEqual(plan.periods, ['2026-07', '2026-08']);
    assert.equal(plan.budgets.find(b => b.category === 'Groceries' && b.entityScope === 'personal').limit, 150);
    assert.equal(plan.budgets.find(b => b.category === 'Groceries' && b.entityScope === 'business').limit, 25);
    assert.equal(plan.bills.length, 1); assert.equal(plan.bills[0].dueDate, '2026-09-30');
    assert.deepEqual(plan.bills[0].evidence.transactionIds, ['sub-jul', 'sub-aug']);
    assert.equal(JSON.stringify(state), before);
  });
  await check('repeated purchases, single charges, fees and archived data are not subscriptions', () => {
    const s = structuredClone(state);
    const noPurchases = buildFinancePlan(s, '2026-09-11');
    assert(!noPurchases.bills.some(b => b.category === 'Food and drink groceries'));
    s.transactions.push(subscription('sub-extra', '2026-08-20'), txn('single', '2026-08-25', 500));
    s.transactions.push(subscription('archived', '2026-09-03', 20, { archivedAt: now }));
    assert.equal(buildFinancePlan(s, '2026-09-11').bills.length, 0);
    assert.equal(buildFinancePlan({ ...s, transactions: s.transactions.map(t => ({ ...t, category: 'Bank fees foreign transaction fees' })) }, '2026-09-11').bills.length, 0);
  });
  await check('posted chart coverage and review status are independent of settlement', () => {
    const s = structuredClone(state); s.transactions.find(t => t.id === 'pending').reviewed = true;
    const dataset = financeStateToDataset(s);
    assert.deepEqual(dataset.snapshot.cashflow.periods, ['2026-06', '2026-07', '2026-08', '2026-09']);
    assert.equal(dataset.snapshot.monthSpend, 0);
    assert(!buildFinanceTransactionsViewModel(dataset, { filter: 'unreviewed' }).rows.some(t => t.id === 'pending'));
    assert.equal(buildFinanceTransactionsViewModel(dataset, { filter: 'pending' }).rows.length, 1);
    assert.deepEqual(buildFinanceTransactionsViewModel(dataset, { filter: 'transfer' }).rows.map(t => t.id), ['transfer']);
    for (const filter of ['unreviewed', 'transfer', 'pending']) assert.equal(normalizeFinanceUrlStateForView('transactions', parseFinanceUrlState(new URLSearchParams({ filter }))).filter, filter);
  });
  await native.writeJsonFile('finance.json', state);
  await check('stale previews reject without a partial write', async () => {
    const preview = await store.previewFinancePlan();
    await store.createFinanceRecord({ kind: 'transaction', merchant: 'New payment', accountId: 'a', amount: 3, direction: 'expense' }, { idempotencyKey: 'extra', actorId: 'test' });
    await assert.rejects(store.applyFinancePlan({ fingerprint: preview.fingerprint, budgets: true, bills: true, review: true }, { idempotencyKey: 'stale' }), e => e.code === 'stale');
    const read = await store.readFinanceState(); assert.equal(read.budgets.length, 0); assert.equal(read.bills.length, 0); assert(read.transactions.some(t => !t.reviewed));
  });
  let result, payload;
  await check('atomic apply validates records, records per-item evidence, preserves pending and audits all approvals', async () => {
    const preview = await store.previewFinancePlan(); payload = { fingerprint: preview.fingerprint, budgets: true, bills: true, review: true };
    result = await store.applyFinancePlan(payload, { idempotencyKey: 'apply' });
    assert.equal(result.counts.reviewed, state.transactions.length + 1);
    assert(result.state.transactions.every(t => t.reviewed)); assert.equal(result.state.transactions.find(t => t.id === 'pending').status, 'pending');
    assert.equal(result.state.auditEvents.filter(e => e.action === 'finance.transaction.reviewed').length, result.counts.reviewed);
    assert.equal(result.counts.budgets, result.state.budgets.length);
    assert(result.state.budgets.every(b => b.categoryGroup && b.evidence.transactionIds.length));
    const groceries = financeStateToDataset(result.state).budgets.find(b => b.category === 'Groceries' && b.limit === 150);
    if (today.startsWith('2026-09')) assert.equal(groceries.spent, 500, 'pending spending reserves budget capacity');
  });
  await check('same-key retries are idempotent, key reuse and repeat previews cannot create duplicates', async () => {
    const retry = await store.applyFinancePlan(payload, { idempotencyKey: 'apply' });
    assert(retry.replayed); assert.deepEqual(retry.counts, result.counts); assert.equal(retry.state.auditEvents.length, result.state.auditEvents.length);
    await assert.rejects(store.applyFinancePlan({ ...payload, bills: false }, { idempotencyKey: 'apply' }), e => e.code === 'conflict');
    const fresh = await store.previewFinancePlan(); assert.equal(fresh.budgets.length, 0); assert.equal(fresh.bills.length, 0); assert.equal(fresh.reviewIds.length, 0);
  });
  await check('group budgets prevent overlapping manual category budgets', async () => {
    await assert.rejects(store.createFinanceRecord({ kind: 'budget', category: 'Food and drink groceries', period: today.slice(0, 7), limit: 100 }, { idempotencyKey: 'overlap' }), e => e.code === 'conflict');
  });
  await check('concurrent approvals commit once and reject a stale competing snapshot', async () => {
    await store.createFinanceRecord({ kind: 'transaction', merchant: 'Concurrent fixture', accountId: 'a', amount: 1, direction: 'expense' }, { idempotencyKey: 'concurrent-new' });
    const preview = await store.previewFinancePlan();
    const input = { fingerprint: preview.fingerprint, budgets: false, bills: false, review: true };
    const outcomes = await Promise.allSettled(['one', 'two'].map(id => store.applyFinancePlan(input, { idempotencyKey: `concurrent-${id}` })));
    assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
    assert(outcomes.some(o => o.status === 'rejected' && o.reason.code === 'stale'));
    assert.equal((await store.readFinanceState()).transactions.filter(t => !t.reviewed).length, 0);
  });
  console.log(`Finance planning: ${passed} checks passed.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => fs.rmSync(fixture, { recursive: true, force: true }));
