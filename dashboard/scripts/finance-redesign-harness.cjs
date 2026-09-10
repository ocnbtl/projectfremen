const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { financeChartScale } = require('../lib/modules/finance/chart-scale.ts');
const { financeStateToDataset } = require('../lib/modules/finance/native-view-model.ts');
const { buildFinanceTransactionsViewModel } = require('../lib/modules/finance/transactions-view-model.ts');
const { buildFinanceViewModel } = require('../lib/modules/finance/view-model.ts');
const { normalizeFinanceUrlStateForView, parseFinanceUrlState, serializeFinanceUrlState } = require('../lib/native-objects/url-state.ts');

for (const values of [[], [0, 0], [10500, 8100, -2500], [90000000000, -2], [.01, .25, -.15], [NaN, Infinity, 75]]) {
  const scale = financeChartScale(values);
  assert(Number.isFinite(scale.min) && Number.isFinite(scale.max) && scale.max > scale.min);
  assert(scale.min <= 0 && scale.max >= 0);
  for (const value of values.filter(Number.isFinite)) assert(value >= scale.min && value <= scale.max, `${value} is clipped`);
  assert(scale.ticks.length >= 2 && scale.ticks.length <= 7);
}
const common = { createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-10T12:00:00Z', createdBy: 'test', currency: 'USD', entityScope: 'personal' };
const tx = (id, changes = {}) => ({ ...common, id, occurredOn: '2026-09-04', merchant: id, accountId: 'checking', category: 'Food', amount: 40, direction: 'expense', status: 'cleared', reviewed: true, memo: '', reimbursable: false, source: { kind: 'manual' }, ...changes });
const state = { schemaVersion: 1, updatedAt: null, accounts: [{ ...common, id: 'checking', name: 'Checking', kind: 'Checking', institution: 'Test', mask: '', currentBalance: 500, balanceAsOf: '2026-09-10', balanceSource: 'manual' }], transactions: [tx('reviewed'), tx('pending', { status: 'pending' }), tx('unreviewed', { reviewed: false }), tx('business', { entityScope: 'business', amount: 100 }), tx('prior-month', { occurredOn: '2026-08-04', amount: 500 }), tx('archived', { archivedAt: '2026-09-09', amount: 900 })], budgets: [{ ...common, id: 'food-personal', period: '2026-09', category: 'Food', limit: 100 }, { ...common, id: 'food-business', period: '2026-09', category: 'Food', limit: 200, entityScope: 'business' }], bills: [], rules: [], closePeriods: [], savingsMovements: [], transfers: [], auditEvents: [], importBatches: [], importPreviews: [], idempotency: [] };
const before = JSON.stringify(state), dataset = financeStateToDataset(state);
assert.equal(dataset.budgets.find(item => item.id === 'food-personal').spent, 120);
assert.equal(dataset.budgets.find(item => item.id === 'food-business').spent, 100);
assert.deepEqual(buildFinanceTransactionsViewModel(dataset, { filter: 'unreviewed' }).rows.map(item => item.id).sort(), ['pending', 'unreviewed']);
assert.equal(buildFinanceViewModel(dataset).counts.pendingTransactions, 2);
assert.equal(buildFinanceViewModel(dataset).counts.attention, 3);
assert.equal(buildFinanceTransactionsViewModel(dataset, { sort: 'date-asc' }).rows[0].id, 'prior-month');
assert.equal(buildFinanceTransactionsViewModel(dataset, { sort: 'date-desc' }).rows.at(-1).id, 'prior-month');
assert.equal(JSON.stringify(state), before, 'Derived views must not mutate records');
const params = new URLSearchParams('filter=attention&probe=keep');
const normalized = normalizeFinanceUrlStateForView('overview', parseFinanceUrlState(params));
assert.equal(normalized.filter, 'attention');
assert.equal(serializeFinanceUrlState(normalized, params).get('filter'), 'attention');
assert.equal(serializeFinanceUrlState(normalized, params).get('probe'), 'keep');
assert.equal(normalizeFinanceUrlStateForView('accounts', normalized).filter, '');
console.log('Finance redesign: dynamic dollar domains, unreviewed scope, monthly/entity budget isolation and smart-view URLs passed.');
