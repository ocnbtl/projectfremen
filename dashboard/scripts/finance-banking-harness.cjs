/* Isolated fake-provider tests. Never creates a Plaid Item or contacts a real institution. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'fremen-banking-test-'));
Object.assign(process.env, { PLAID_ENV: 'sandbox', PLAID_PLAN: 'trial', PLAID_CLIENT_ID: 'test-client', PLAID_SECRET: 'test-secret',
  FINANCE_BANKING_KEY: crypto.randomBytes(32).toString('base64'), FINANCE_BANKING_ORIGIN: 'http://localhost:3025',
  FREMEN_DATA_DIR: fixture, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', FREMEN_REQUIRE_SUPABASE: 'false' });
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, filename);
const provider = require('../lib/modules/finance/banking-provider.ts');
const ledger = require('../lib/modules/finance/banking-ledger.ts');
const store = require('../lib/modules/finance/store.ts');
const service = require('../lib/modules/finance/banking-service.ts');
const models = require('../lib/modules/finance/native-view-model.ts');
const native = require('../lib/file-store.ts');
const now = '2026-09-10T20:00:00.000Z';
const bank = { id: 'bank-account', name: 'Checking', mask: '1234', kind: 'Checking', balance: 123.45, supported: true, currency: 'USD' };
const source = changes => ({ transaction_id: 'bank-tx', account_id: bank.id, date: '2026-09-01', name: 'Coffee shop', amount: 12.5, pending: true,
  iso_currency_code: 'USD', personal_finance_category: { detailed: 'FOOD_AND_DRINK_COFFEE', primary: 'FOOD_AND_DRINK' }, ...changes });
const tx = changes => provider.normalizeTransaction(source(changes));
const newState = () => store.createEmptyFinanceState();
let passed = 0;
function check(label, fn) { fn(); passed++; console.log(`PASS ${label}`); }
async function checkAsync(label, fn) { await fn(); passed++; console.log(`PASS ${label}`); }
async function main() {
  check('encrypted credentials: random nonces, authenticated tamper detection, environment binding', () => {
    const value = { accessToken: 'access-sandbox-private-test', cursor: 'private-cursor' };
    const encrypted = provider.encryptBanking(value);
    assert(!JSON.stringify(encrypted).includes(value.accessToken));
    assert.deepEqual(provider.decryptBanking(encrypted), value);
    assert.notEqual(encrypted.nonce, provider.encryptBanking(value).nonce);
    assert.throws(() => provider.decryptBanking({ ...encrypted, tag: Buffer.alloc(16).toString('base64') }));
    const key = process.env.FINANCE_BANKING_KEY;
    process.env.FINANCE_BANKING_KEY = crypto.randomBytes(32).toString('base64');
    assert.throws(() => provider.decryptBanking(encrypted)); process.env.FINANCE_BANKING_KEY = key;
  });
  check('production fails closed without durable storage and strict secure configuration', () => {
    process.env.PLAID_ENV = 'production'; assert.equal(provider.bankingConfig().configured, false); process.env.PLAID_ENV = 'sandbox';
    process.env.PLAID_PLAN = 'paid'; assert.equal(provider.bankingConfig().configured, false); process.env.PLAID_PLAN = 'trial';
    assert.equal(provider.bankingConfig().configured, true);
  });
  check('currency, calendar date, bounded money and transfer normalization', () => {
    for (const patch of [{ amount: 0 }, { amount: Infinity }, { amount: 1e20 }, { iso_currency_code: 'EUR' }, { date: '2026-02-30' }, { date: '2026-99-99' }]) assert.throws(() => tx(patch));
    assert.equal(tx({ amount: -20 }).direction, 'income');
    assert.equal(tx({ personal_finance_category: { primary: 'TRANSFER_OUT' } }).direction, 'transfer');
    assert.equal(tx({ personal_finance_category: { detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' } }).direction, 'transfer');
  });
  check('mapping protects ownership and avoids duplicate accounts', () => {
    const state = newState();
    assert.throws(() => ledger.bindBankAccounts(state, 'c', 'Test bank', [bank], {}, now));
    const map = ledger.bindBankAccounts(state, 'c', 'Test bank', [bank], { [bank.id]: 'new' }, now);
    ledger.bindBankAccounts(state, 'c', 'Test bank', [bank], { [bank.id]: 'new' }, now);
    assert.equal(state.accounts.length, 1);
    assert.throws(() => ledger.bindBankAccounts(state, 'other', 'Bank', [bank], { [bank.id]: map[bank.id] }, now));
    assert.throws(() => ledger.bindBankAccounts(state, 'c', 'Bank', [{ ...bank, supported: false }], { [bank.id]: 'new' }, now));
  });
  check('pending to posted preserves identity and edits across pagination and replay', () => {
    const state = newState(), mapping = ledger.bindBankAccounts(state, 'c', 'Bank', [bank], { [bank.id]: 'new' }, now);
    ledger.reconcileBankBatch(state, 'c', mapping, [bank], [tx()], [], now);
    const originalId = state.transactions[0].id;
    Object.assign(state.transactions[0], { merchant: 'My coffee', category: 'My category', memo: 'Personal note', reviewed: true });
    const posted = tx({ transaction_id: 'posted', pending_transaction_id: 'bank-tx', amount: 14, pending: false });
    ledger.reconcileBankBatch(state, 'c', mapping, [bank], [posted], ['bank-tx'], now);
    assert.equal(state.transactions.length, 1); assert.equal(state.transactions[0].id, originalId);
    assert.equal(state.transactions[0].status, 'cleared'); assert.equal(state.transactions[0].amount, 14);
    assert.equal(state.transactions[0].memo, 'Personal note'); assert.equal(state.transactions[0].merchant, 'My coffee');
    assert.equal(state.transactions[0].category, 'My category'); assert.equal(state.transactions[0].reviewed, false);
    assert(!state.transactions[0].archivedAt);
    const auditCount = state.auditEvents.length;
    ledger.reconcileBankBatch(state, 'c', mapping, [bank], [posted], ['bank-tx'], now);
    assert.equal(state.transactions.length, 1); assert.equal(state.auditEvents.length, auditCount);
    ledger.reconcileBankBatch(state, 'c', mapping, [bank], [], ['posted'], now);
    assert.equal(state.transactions[0].archivedBy, 'plaid');
    ledger.reconcileBankBatch(state, 'c', mapping, [bank], [posted], [], now);
    assert(!state.transactions[0].archivedAt);
    state.transactions[0].archivedAt = now; state.transactions[0].archivedBy = 'admin';
    ledger.reconcileBankBatch(state, 'c', mapping, [bank], [posted], [], now);
    assert.equal(state.transactions[0].archivedBy, 'admin');
  });
  check('possible duplicates remain outside totals until explicit match; replay is safe', () => {
    const state = newState(), mapping = ledger.bindBankAccounts(state, 'c', 'Bank', [bank], { [bank.id]: 'new' }, now);
    ledger.reconcileBankBatch(state, 'c', mapping, [bank], [tx()], [], now);
    const manual = state.transactions[0]; manual.source = { kind: 'csv_import', importBatchId: 'existing-batch', sourceRowFingerprint: 'original-row' }; manual.memo = 'Keep me'; manual.category = 'Custom';
    ledger.reconcileBankBatch(state, 'c', mapping, [bank], [tx()], [], now);
    assert.equal(state.transactions.length, 1); assert.equal(state.bankReviews.length, 1);
    ledger.resolveBankReview(state, state.bankReviews[0].id, 'match', manual.id, now);
    assert.equal(state.transactions.length, 1); assert.equal(state.transactions[0].memo, 'Keep me'); assert.equal(state.transactions[0].category, 'Custom');
    assert.equal(state.transactions[0].source.importBatchId, 'existing-batch'); assert.equal(state.transactions[0].source.sourceRowFingerprint, 'original-row');
    ledger.reconcileBankBatch(state, 'c', mapping, [bank], [tx()], [], now); assert.equal(state.transactions.length, 1);
    assert.throws(() => ledger.resolveBankReview(state, state.bankReviews[0].id, 'import', undefined, now));
  });
  check('negative bank credit balance becomes an asset rather than invented debt', () => {
    const state = newState(); ledger.bindBankAccounts(state, 'c', 'Bank', [{ ...bank, kind: 'Credit', balance: -50 }], { [bank.id]: 'new' }, now);
    assert.equal(models.financeStateToDataset(state).accounts[0].balance, 50);
  });

  const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  let calls = [], mode = 'normal', syncCalls = 0;
  const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
  global.fetch = async (url, options) => {
    assert(String(url).startsWith('https://sandbox.plaid.com/'), 'No real provider, Supabase or institution network access in this harness');
    const endpoint = new URL(url).pathname, body = JSON.parse(options.body);
    calls.push({ endpoint, body });
    if (endpoint === '/webhook_verification_key/get') return response({ key: { ...pair.publicKey.export({ format: 'jwk' }), alg: 'ES256', expired_at: null } });
    if (endpoint === '/link/token/create') return response({ link_token: 'link-sandbox-test', expiration: new Date(Date.now() + 1800000).toISOString() });
    if (endpoint === '/item/public_token/exchange') return response({ access_token: 'access-sandbox-private-test', item_id: 'item-test' });
    if (endpoint === '/accounts/get') return response({ accounts: [{ account_id: bank.id, name: 'Checking', mask: '1234', type: 'depository', subtype: 'checking', balances: { current: 123.45, iso_currency_code: 'USD' } }], item: { institution_id: 'ins-test' } });
    if (endpoint === '/institutions/get_by_id') return response({ institution: { name: 'Test institution' } });
    if (endpoint === '/item/remove') return response({ removed: true });
    if (endpoint === '/transactions/sync') {
      syncCalls++;
      if (mode === 'failure' && syncCalls === 2) return response({ error_code: 'INSTITUTION_NOT_RESPONDING', error_message: 'DO NOT EXPOSE access-sandbox-private-test' }, 400);
      if (mode === 'pagination-restart' && syncCalls === 2) return response({ error_code: 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' }, 400);
      const more = mode !== 'normal' && !body.cursor;
      return response({ added: [source()], modified: [], removed: [], has_more: more, next_cursor: 'cursor-test', transactions_update_status: 'HISTORICAL_UPDATE_COMPLETE' });
    }
    throw new Error(`Unexpected provider endpoint ${endpoint}`);
  };
  await checkAsync('webhooks authenticate signature, exact raw body, algorithm and freshness', async () => {
    const raw = JSON.stringify({ webhook_type: 'TRANSACTIONS', item_id: 'item-test' });
    const jwt = patch => {
      const head = Buffer.from(JSON.stringify({ alg: 'ES256', kid: 'test-key' })).toString('base64url');
      const body = Buffer.from(JSON.stringify({ iat: Math.floor(Date.now()/1000), request_body_sha256: crypto.createHash('sha256').update(raw).digest('hex'), ...patch })).toString('base64url');
      return `${head}.${body}.${crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
    };
    await provider.verifyPlaidWebhook(raw, jwt({}));
    await assert.rejects(provider.verifyPlaidWebhook(raw + ' ', jwt({})));
    await assert.rejects(provider.verifyPlaidWebhook(raw, jwt({ iat: Math.floor(Date.now()/1000)-301 })));
    await assert.rejects(provider.verifyPlaidWebhook(raw, jwt({ iat: Math.floor(Date.now()/1000)+60 })));
    await assert.rejects(provider.verifyPlaidWebhook(raw, 'invalid'));
  });
  let connectionId;
  await checkAsync('Link exchange is one-use/idempotent and credentials stay encrypted and out of DTOs', async () => {
    const link = await service.createBankLink();
    assert(calls.find(call => call.endpoint === '/link/token/create').body.account_filters.depository.account_subtypes.includes('paypal'));
    const results = await Promise.allSettled([service.exchangeBankLink(link.sessionId, 'public-test'), service.exchangeBankLink(link.sessionId, 'public-test')]);
    assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
    connectionId = results.find(item => item.status === 'fulfilled').value;
    assert.equal(await service.exchangeBankLink(link.sessionId, 'public-test'), connectionId);
    assert.equal(calls.filter(item => item.endpoint === '/item/public_token/exchange').length, 1);
    const view = await service.bankingView(); assert.equal(view.connectionsUsed, 1); assert.equal(view.connections[0].name, 'Test institution');
    for (const secret of ['access-sandbox-private-test', 'test-secret', 'item-test', 'cursor-test', 'link-sandbox-test']) assert(!JSON.stringify(view).includes(secret));
    const raw = fs.readFileSync(path.join(fixture, 'finance-banking-sandbox.json'), 'utf8');
    assert(!raw.includes('access-sandbox-private-test')); assert(!raw.includes('Test institution'));
    await service.mapBankAccounts(connectionId, { [bank.id]: 'new' });
  });
  await checkAsync('failed pagination does not mutate the ledger or advance the cursor', async () => {
    mode = 'failure'; syncCalls = 0;
    await assert.rejects(service.syncBankConnection(connectionId), error => !error.message.includes('access-sandbox-private-test'));
    assert.equal((await store.readFinanceState()).transactions.length, 0);
    const data = provider.decryptBanking(JSON.parse(fs.readFileSync(path.join(fixture, 'finance-banking-sandbox.json'), 'utf8')));
    assert.equal(data.connections[0].cursor, undefined);
  });
  const realNow = Date.now; let clock = realNow(); Date.now = () => clock;
  await checkAsync('pagination mutation restarts from the original cursor; repeated sync is idempotent', async () => {
    clock += 61000; mode = 'pagination-restart'; syncCalls = 0;
    await service.syncBankConnection(connectionId);
    assert.equal(syncCalls, 4);
    assert.equal((await store.readFinanceState()).transactions.length, 1);
    clock += 61000; mode = 'normal';
    await service.syncBankConnection(connectionId); assert.equal((await store.readFinanceState()).transactions.length, 1);
    await assert.rejects(service.syncBankConnection(connectionId), error => error.status === 429);
  });
  await checkAsync('native API edits cannot overwrite bank facts but retain editable annotations', async () => {
    let state = await store.readFinanceState(), tx = state.transactions[0], account = state.accounts[0];
    await assert.rejects(store.updateFinanceRecord({ kind: 'transaction', id: tx.id, action: 'update', expectedUpdatedAt: tx.updatedAt, fields: { amount: 999 } }, { actorId: 'admin' }));
    await assert.rejects(store.updateFinanceRecord({ kind: 'account', id: account.id, action: 'archive', expectedUpdatedAt: account.updatedAt, reason: 'test' }, { actorId: 'admin' }));
    await store.updateFinanceRecord({ kind: 'transaction', id: tx.id, action: 'update', expectedUpdatedAt: tx.updatedAt, fields: { category: 'My budget', reviewed: true } }, { actorId: 'admin' });
    assert.equal((await store.readFinanceState()).transactions[0].category, 'My budget');
  });
  await checkAsync('reconnect uses update mode without creating or purchasing another Item', async () => {
    clock += 61000;
    const link = await service.createBankLink(connectionId);
    const request = calls.filter(item => item.endpoint === '/link/token/create').at(-1).body;
    assert.equal(request.access_token, 'access-sandbox-private-test'); assert(!request.products); assert(!request.transactions); assert(!request.account_filters);
    await service.exchangeBankLink(link.sessionId, 'update-mode');
    assert.equal((await service.bankingView()).connectionsUsed, 1);
  });
  await checkAsync('disconnect revokes access, erases token and preserves Finance history and Trial count', async () => {
    await service.disconnectBankConnection(connectionId);
    await service.disconnectBankConnection(connectionId);
    const view = await service.bankingView(); assert.equal(view.connections[0].status, 'disconnected'); assert.equal(view.connectionsUsed, 1);
    const state = await store.readFinanceState(); assert.equal(state.transactions.length, 1); assert(!state.accounts[0].bankLink);
    const data = provider.decryptBanking(JSON.parse(fs.readFileSync(path.join(fixture, 'finance-banking-sandbox.json'), 'utf8')));
    assert(!JSON.stringify(data).includes('access-sandbox-private-test'));
  });
  await checkAsync('Trial cap stops new Link sessions before any provider call', async () => {
    const raw = JSON.parse(fs.readFileSync(path.join(fixture, 'finance-banking-sandbox.json'), 'utf8'));
    const data = provider.decryptBanking(raw); data.connectionsUsed = 10; data.lastLinkAt = undefined;
    await native.writeJsonFile('finance-banking-sandbox.json', provider.encryptBanking(data));
    const count = calls.length;
    await assert.rejects(service.createBankLink(), error => error.code === 'trial_limit'); assert.equal(calls.length, count);
  });
  Date.now = realNow;
  console.log(`Finance banking: ${passed} checks passed. No real provider requests or Trial connections used.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  // This path was created by this harness and is the only directory eligible for cleanup.
  if (path.dirname(fixture) === os.tmpdir() && path.basename(fixture).startsWith('fremen-banking-test-')) fs.rmSync(fixture, { recursive: true, force: true });
});
