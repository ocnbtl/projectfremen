/* Isolated fixtures only. No real Plaid calls, credentials or Trial Items. */
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto'), ts = require('typescript');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'fremen-investments-test-'));
Object.assign(process.env, { PLAID_ENV: 'sandbox', PLAID_PLAN: 'trial', PLAID_CLIENT_ID: 'fixture-client', PLAID_SECRET: 'fixture-secret',
  FINANCE_BANKING_KEY: crypto.randomBytes(32).toString('base64'), FINANCE_BANKING_ORIGIN: 'http://localhost:3028', FREMEN_DATA_DIR: fixture,
  SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', FREMEN_REQUIRE_SUPABASE: 'false' });
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, filename);
const provider = require('../lib/modules/finance/banking-provider.ts'), investments = require('../lib/modules/finance/investments-provider.ts');
const service = require('../lib/modules/finance/banking-service.ts'), store = require('../lib/modules/finance/store.ts');
const ledger = require('../lib/modules/finance/banking-ledger.ts'), matching = require('../lib/modules/finance/banking-matching.ts'), native = require('../lib/file-store.ts');
const realNow = Date.now; let clock = realNow(); Date.now = () => clock;
const today = new Date().toISOString().slice(0, 10), now = new Date().toISOString();
const rawAccount = { account_id: 'investment-account', name: 'Vanguard Roth IRA', type: 'investment', subtype: 'roth', mask: '2468', balances: { current: 12500, iso_currency_code: 'USD' } };
const security = { security_id: 'security-fund', name: 'Total Stock Market Index Fund', ticker_symbol: 'VTSAX' };
const holding = { account_id: rawAccount.account_id, security_id: security.security_id, quantity: 100.125, institution_value: 12000, institution_price: 119.85, institution_price_as_of: today, cost_basis: null, iso_currency_code: 'USD' };
const transaction = index => ({ investment_transaction_id: `activity-${index}`, account_id: rawAccount.account_id, security_id: security.security_id,
  date: today, name: 'Dividend received', type: 'cash', subtype: 'dividend', amount: -8.72, quantity: 0, iso_currency_code: 'USD', cancel_transaction_id: null });
let mode = 'normal', calls = [], passed = 0, connectionId;
global.fetch = async (url, options) => {
  assert.equal(new URL(url).hostname, 'sandbox.plaid.com'); assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
  const endpoint = new URL(url).pathname, body = JSON.parse(options.body); calls.push({ endpoint, body });
  const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
  if (endpoint === '/link/token/create') return reply({ link_token: 'link-fixture', expiration: new Date(clock + 1800000).toISOString() });
  if (endpoint === '/item/public_token/exchange') return reply({ access_token: 'access-investments-private-fixture', item_id: 'investment-item' });
  if (endpoint === '/accounts/get') return reply({ accounts: [rawAccount], item: { institution_id: 'vanguard-fixture' } });
  if (endpoint === '/institutions/get_by_id') return reply({ institution: { name: 'Vanguard' } });
  if (endpoint === '/item/remove') return reply({ removed: true });
  if (endpoint === '/investments/holdings/get') {
    assert.deepEqual(body.options.account_ids, [rawAccount.account_id]);
    const patch = mode === 'bad-currency' ? { iso_currency_code: 'EUR' } : mode === 'bad-value' ? { institution_value: 1e30 } :
      mode === 'bad-date' ? { institution_price_as_of: '2026-02-30' } : mode === 'unknown-account' ? { account_id: 'other-account' } :
      mode === 'negative' ? { quantity: -5, institution_value: -50 } : {};
    return reply({ accounts: mode === 'missing-account' ? [] : [{ ...rawAccount, balances: { ...rawAccount.balances, current: mode === 'missing-balance' ? null : 12500 } }],
      holdings: [{ ...holding, ...patch }], securities: [security] });
  }
  if (endpoint === '/investments/transactions/get') {
    assert.deepEqual(body.options.account_ids, [rawAccount.account_id]); assert.equal(body.options.count, 500);
    if (mode === 'pending') return reply({ error_code: 'PRODUCT_NOT_READY' }, 400);
    const offset = body.options.offset;
    if (mode === 'late-failure' && offset > 0) return reply({ error_code: 'INTERNAL_SERVER_ERROR', detail: 'private-secret-never-show' }, 500);
    const paged = ['pagination', 'late-failure', 'total-change', 'duplicate'].includes(mode);
    const entries = paged ? offset === 0 ? Array.from({ length: 500 }, (_, index) => transaction(index)) : [transaction(mode === 'duplicate' ? 0 : 500)] : [transaction(0)];
    if (mode === 'bad-activity') entries[0].date = '2026-02-30';
    if (mode === 'cancellation') entries.push({ ...transaction(1), cancel_transaction_id: 'activity-0', amount: 8.72 });
    return reply({ investment_transactions: entries, securities: [security], total_investment_transactions: mode === 'total-change' && offset > 0 ? 502 : paged ? 501 : entries.length });
  }
  throw new Error(`Unexpected mocked endpoint ${endpoint}`);
};
async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
const advance = () => { clock += 61000; };
const current = async () => (await service.bankingView()).connections.find(item => item.id === connectionId);
const encryptedState = () => provider.decryptBanking(JSON.parse(fs.readFileSync(path.join(fixture, 'finance-banking-sandbox.json'), 'utf8')));

async function main() {
  await check('investment and bank account eligibility are separated; unavailable balances remain null', () => {
    assert.equal(provider.normalizeAccounts([rawAccount])[0].supported, false);
    const account = provider.normalizeAccounts([rawAccount], 'investments')[0]; assert.equal(account.kind, 'Brokerage'); assert(account.supported);
    assert.equal(provider.normalizeAccounts([{ ...rawAccount, balances: { current: null, iso_currency_code: 'USD' } }], 'investments')[0].balance, null);
    assert.equal(provider.normalizeAccounts([{ ...rawAccount, balances: { current: 1, iso_currency_code: 'EUR' } }], 'investments')[0].supported, false);
  });
  await check('suggestions require a unique institution match and exclude Coinbase and other linked accounts', () => {
    const state = store.createEmptyFinanceState(), account = provider.normalizeAccounts([rawAccount], 'investments')[0];
    const connection = { id: 'test', name: 'Vanguard', product: 'investments', accounts: [account], mappings: {}, status: 'mapping' };
    const nativeAccount = { id: 'existing', name: 'Vanguard Investments', institution: 'Vanguard', kind: 'Brokerage', entityScope: 'personal', mask: '' };
    state.accounts = [nativeAccount]; assert.deepEqual(matching.suggestInvestmentMatches(connection, state), { [account.id]: 'existing' });
    state.accounts.push({ ...nativeAccount, id: 'ambiguous' }); assert.deepEqual(matching.suggestInvestmentMatches(connection, state), {});
    state.accounts[0].mask = account.mask; assert.equal(matching.suggestInvestmentMatches(connection, state)[account.id], 'existing');
    state.accounts = [{ ...nativeAccount, coinbaseLink: { connectionId: 'crypto' } }]; assert.deepEqual(matching.suggestInvestmentMatches(connection, state), {});
    state.accounts = [{ ...nativeAccount, bankLink: { connectionId: 'other', accountId: 'other' } }]; assert.deepEqual(matching.suggestInvestmentMatches(connection, state), {});
  });
  await check('Investments Link uses only Investments and preserves credentials before metadata and mapping', async () => {
    const link = await service.createBankLink(undefined, 'investments');
    const request = calls.at(-1).body; assert.deepEqual(request.products, ['investments']); assert.deepEqual(request.account_filters, { investment: { account_subtypes: ['all'] } });
    assert(!request.transactions); assert(!request.institution_id); assert.equal(link.product, 'investments');
    connectionId = await service.exchangeBankLink(link.sessionId, 'public-fixture');
    assert.equal(await service.exchangeBankLink(link.sessionId, 'public-fixture'), connectionId);
    assert.equal((await current()).product, 'investments'); assert.equal((await current()).name, 'Vanguard');
    assert.equal((await service.bankingView()).connectionsUsed, 1);
    const dto = JSON.stringify(await service.bankingView());
    for (const secret of ['access-investments-private-fixture', 'fixture-secret', 'investment-item', 'link-fixture']) assert(!dto.includes(secret));
    assert(!fs.readFileSync(path.join(fixture, 'finance-banking-sandbox.json'), 'utf8').includes('Vanguard'));
    await service.mapBankAccounts(connectionId, { [rawAccount.account_id]: 'new' });
  });
  await check('balances are counted once; holdings and signed activity do not become spending transactions', async () => {
    await service.syncBankConnection(connectionId);
    const state = await store.readFinanceState(), snapshot = (await current()).investments;
    assert.equal(state.accounts.length, 1); assert.equal(state.accounts[0].kind, 'Brokerage'); assert.equal(state.accounts[0].currentBalance, 12500);
    assert.equal(state.transactions.length, 0); assert.equal(snapshot.holdings[0].value, 12000); assert.equal(snapshot.activity[0].amount, -8.72);
    assert.equal(snapshot.holdings[0].costBasis, null); assert(snapshot.activityReady);
    assert(!calls.some(call => call.endpoint === '/transactions/sync'));
  });
  await check('complete pagination, signed quantities, zero activity quantities and cancellations are preserved', async () => {
    mode = 'pagination'; const result = await investments.fetchInvestments('fixture', [rawAccount.account_id]); assert.equal(result.snapshot.activity.length, 501);
    mode = 'negative'; assert.equal((await investments.fetchInvestments('fixture', [rawAccount.account_id])).snapshot.holdings[0].quantity, -5);
    mode = 'cancellation'; const snapshot = (await investments.fetchInvestments('fixture', [rawAccount.account_id])).snapshot;
    assert.equal(snapshot.activity[1].cancelTransactionId, 'activity-0'); assert.equal(snapshot.activity[0].quantity, 0);
  });
  await check('bad or incomplete provider responses preserve both the prior snapshot and Finance ledger', async () => {
    const snapshot = (await current()).investments, state = await store.readFinanceState();
    for (mode of ['late-failure', 'total-change', 'duplicate', 'bad-currency', 'bad-date', 'bad-value', 'bad-activity', 'unknown-account', 'missing-account']) {
      advance(); await assert.rejects(service.syncBankConnection(connectionId), error => !error.message.includes('private-secret'));
      assert.deepEqual((await current()).investments, snapshot); assert.deepEqual(await store.readFinanceState(), state);
    }
  });
  await check('preparing history preserves saved activity and missing balances preserve dated account balances', async () => {
    const snapshot = (await current()).investments;
    advance(); mode = 'pending'; await service.syncBankConnection(connectionId);
    assert.equal((await current()).investments.activityReady, false); assert.deepEqual((await current()).investments.activity, snapshot.activity);
    const timestamp = (await store.readFinanceState()).accounts[0].balanceRetrievedAt;
    advance(); mode = 'missing-balance'; await service.syncBankConnection(connectionId);
    const state = await store.readFinanceState(); assert.equal(state.accounts[0].currentBalance, 12500); assert.equal(state.accounts[0].balanceRetrievedAt, timestamp);
    assert.equal((await current()).accounts[0].balance, null); assert((await current()).investments.activityReady);
  });
  await check('investment webhooks update snapshots; Transactions webhooks cannot import investment activity', async () => {
    const count = calls.length; await service.handleBankWebhook({ item_id: 'investment-item', webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE' }); assert.equal(calls.length, count);
    mode = 'normal'; advance(); await service.handleBankWebhook({ item_id: 'investment-item', webhook_type: 'HOLDINGS', webhook_code: 'DEFAULT_UPDATE' });
    advance(); await service.handleBankWebhook({ item_id: 'investment-item', webhook_type: 'INVESTMENTS_TRANSACTIONS', webhook_code: 'DEFAULT_UPDATE' });
    assert.equal((await store.readFinanceState()).transactions.length, 0); assert.equal((await current()).error, undefined);
  });
  await check('connected investment fields retain native ownership and mapping guards', async () => {
    const state = await store.readFinanceState(), account = state.accounts[0];
    await assert.rejects(store.updateFinanceRecord({ kind: 'account', id: account.id, action: 'update', expectedUpdatedAt: account.updatedAt, fields: { currentBalance: 999 } }, { actorId: 'admin' }));
    await assert.rejects(service.mapBankAccounts(connectionId, { [rawAccount.account_id]: 'new' }), error => error.code === 'already_mapped');
    const other = { ...account, id: 'coinbase', bankLink: undefined, coinbaseLink: { connectionId: 'crypto' } }; state.accounts.push(other);
    assert.throws(() => ledger.bindBankAccounts(state, 'other', 'Vanguard', provider.normalizeAccounts([rawAccount], 'investments'), { [rawAccount.account_id]: 'coinbase' }, now));
  });
  await check('reconnect preserves the investment product and does not use a new Trial slot', async () => {
    advance(); const link = await service.createBankLink(connectionId);
    assert.equal(link.product, 'investments'); assert(!calls.at(-1).body.products); assert(calls.at(-1).body.access_token);
    await service.exchangeBankLink(link.sessionId, 'update-fixture'); assert.equal((await service.bankingView()).connectionsUsed, 1);
  });
  await check('banks and investments share the lifetime cap while existing Items can reconnect', async () => {
    const data = encryptedState(); data.connectionsUsed = 10; data.lastLinkAt = undefined;
    await native.writeJsonFile('finance-banking-sandbox.json', provider.encryptBanking(data));
    const count = calls.length;
    for (const product of ['transactions', 'investments']) await assert.rejects(service.createBankLink(undefined, product), error => error.code === 'trial_limit');
    assert.equal(calls.length, count); advance(); const link = await service.createBankLink(connectionId); await service.cancelBankLink(link.sessionId);
  });
  await check('disconnect revokes and erases credentials while retaining snapshot and lifetime usage', async () => {
    const snapshot = (await current()).investments;
    await service.disconnectBankConnection(connectionId); await service.disconnectBankConnection(connectionId);
    assert.equal((await current()).status, 'disconnected'); assert.deepEqual((await current()).investments, snapshot);
    assert.equal((await service.bankingView()).connectionsUsed, 10); assert(!encryptedState().connections[0].accessToken);
    assert(!(await store.readFinanceState()).accounts[0].bankLink); assert.equal((await store.readFinanceState()).accounts[0].currentBalance, 12500);
  });
  console.log(`Finance investments: ${passed} checks passed. No real provider requests or Trial connections used.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  Date.now = realNow;
  if (path.dirname(fixture) === os.tmpdir() && path.basename(fixture).startsWith('fremen-investments-test-')) fs.rmSync(fixture, { recursive: true, force: true });
});
