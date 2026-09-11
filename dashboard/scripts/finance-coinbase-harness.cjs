/* Isolated provider-shaped fixtures: never contacts Coinbase or production storage. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'fremen-coinbase-test-'));
Object.assign(process.env, { FINANCE_BANKING_KEY: crypto.randomBytes(32).toString('base64'), FINANCE_BANKING_ORIGIN: 'http://localhost:3026',
  FINANCE_COINBASE_TEST_MODE: 'true', VERCEL: '', FREMEN_DATA_DIR: fixture, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', FREMEN_REQUIRE_SUPABASE: 'false' });
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, filename);
const provider = require('../lib/modules/finance/coinbase-provider.ts');
const service = require('../lib/modules/finance/coinbase-service.ts');
const ledger = require('../lib/modules/finance/coinbase-ledger.ts');
const store = require('../lib/modules/finance/store.ts');
const native = require('../lib/file-store.ts');
const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const credentials = { keyName: 'organizations/test-org/apiKeys/test-key', privateKey: pair.privateKey.export({ type: 'sec1', format: 'pem' }) };
let passed = 0, mode = 'normal', calls = [], price = '80000';
// Match Coinbase's documented response: there is no can_receive field.
const permissions = { can_view: true, can_trade: false, can_transfer: false, portfolio_uuid: 'test-portfolio', portfolio_type: 'DEFAULT' };
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const page = (data, next = null) => response({ data, pagination: { next_uri: next } });
global.fetch = async (input, options) => {
  const url = new URL(input);
  assert.equal(url.origin, 'https://api.coinbase.com', 'No real provider or unrelated destination');
  assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
  calls.push(url.pathname);
  if (url.pathname.startsWith('/v2/prices/')) {
    assert(!options.headers.Authorization, 'Public prices receive no credential');
    if (mode === 'missing-price') return response({}, 404);
    return response({ data: { amount: url.pathname.includes('BTC-') ? price : '0.95', currency: 'USD' } });
  }
  const token = options.headers.Authorization.slice(7), [head, body, signature] = token.split('.');
  assert(crypto.verify('sha256', Buffer.from(`${head}.${body}`), { key: pair.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')));
  const claims = JSON.parse(Buffer.from(body, 'base64url')); assert.equal(claims.uri, `GET api.coinbase.com${url.pathname}`);
  if (url.pathname === '/api/v3/brokerage/key_permissions') return response(mode === 'trade' ? { ...permissions, can_trade: true } : permissions);
  if (url.pathname === '/v2/accounts') {
    if (mode === 'empty') return page([]);
    if (url.searchParams.has('starting_after')) {
      if (mode === 'second-page-fails') return response({ message: credentials.privateKey }, 500);
      return page([{ id: 'usd-wallet', name: 'US dollar', balance: { amount: '12.50', currency: 'USD' } }]);
    }
    return page([{ id: 'btc-wallet', name: 'Bitcoin', balance: { amount: '0.123456789012345678', currency: 'BTC' } },
      { id: 'usdc-wallet', name: 'USDC', balance: { amount: '100', currency: 'USDC' } }], mode === 'hostile-page' ? 'https://evil.example/steal' : '/v2/accounts?limit=100&starting_after=usdc-wallet');
  }
  if (/\/transactions$/.test(url.pathname)) {
    if (mode === 'tx-failure') return response({ message: credentials.privateKey }, 500);
    const id = url.pathname.split('/')[3];
    return page([{ id: 'tx-1', type: 'buy', status: 'completed', created_at: '2026-09-10T12:00:00Z', amount: { amount: '0.01', currency: 'BTC' }, native_amount: { amount: '800', currency: 'USD' }, description: 'Unneeded private description', account: id }]);
  }
  throw new Error('Unexpected test endpoint');
};
async function check(label, fn) { await fn(); passed++; console.log(`PASS ${label}`); }
const encryptedFile = () => JSON.parse(fs.readFileSync(path.join(fixture, 'finance-coinbase-personal.json'), 'utf8'));
async function cooldown() {
  const state = service.decryptCoinbase(encryptedFile()); delete state.lastAttempt;
  await native.writeJsonFile('finance-coinbase-personal.json', service.encryptCoinbase(state));
}
async function main() {
  await check('strict ECDSA key input and request-bound JWT signatures with unique nonces', () => {
    assert(provider.coinbaseCredentials(credentials.keyName, credentials.privateKey.replaceAll('\n', '\\n')).privateKey === credentials.privateKey.trim(), 'Escaped newlines are normalized');
    assert.throws(() => provider.coinbaseCredentials('invalid', credentials.privateKey));
    assert.throws(() => provider.coinbaseCredentials(credentials.keyName, 'bad-secret'));
    const first = provider.coinbaseJwt(credentials, '/v2/accounts?limit=100'), second = provider.coinbaseJwt(credentials, '/v2/accounts?limit=100');
    assert.notEqual(first, second); const claims = JSON.parse(Buffer.from(first.split('.')[1], 'base64url'));
    assert.equal(claims.iss, 'cdp'); assert.equal(claims.exp - claims.nbf, 120);
  });
  await check('documented permission responses pass; write or ambiguous capabilities are rejected', () => {
    provider.assertCoinbaseViewOnly(permissions);
    provider.assertCoinbaseViewOnly({ ...permissions, can_receive: false });
    for (const key of ['can_trade', 'can_transfer']) {
      const missing = { ...permissions }; delete missing[key]; assert.throws(() => provider.assertCoinbaseViewOnly(missing));
    }
    for (const key of ['can_trade', 'can_transfer', 'can_receive', 'can_export', 'can_manage']) {
      for (const value of [true, null, 'false', 0]) assert.throws(() => provider.assertCoinbaseViewOnly({ ...permissions, [key]: value }));
    }
    for (const value of [false, undefined, null, 'true', 1]) assert.throws(() => provider.assertCoinbaseViewOnly({ ...permissions, can_view: value }));
  });
  await check('no arbitrary host, transfer endpoint, fragment or query can be signed', () => {
    for (const url of ['https://evil.example/v2/accounts', '//evil.example/v2/accounts', '/v2/accounts/btc/addresses', '/api/v3/brokerage/orders', '/v2/accounts?callback=https://evil.example', '/v2/accounts#private']) assert.throws(() => provider.coinbasePath(url));
  });
  await check('encryption is authenticated, randomized and bound to the site; production fails closed', () => {
    const value = { version: 1, credentials }, encrypted = service.encryptCoinbase(value);
    assert(!JSON.stringify(encrypted).includes('PRIVATE KEY')); assert.notEqual(encrypted.nonce, service.encryptCoinbase(value).nonce);
    assert(service.decryptCoinbase(encrypted).credentials.privateKey === credentials.privateKey, 'Encrypted key round-trip');
    assert.throws(() => service.decryptCoinbase({ ...encrypted, tag: Buffer.alloc(16).toString('base64') }));
    process.env.FINANCE_BANKING_ORIGIN = 'http://localhost:3027'; assert.throws(() => service.decryptCoinbase(encrypted)); process.env.FINANCE_BANKING_ORIGIN = 'http://localhost:3026';
    process.env.VERCEL = '1'; assert.equal(service.coinbaseConfig().configured, false); process.env.VERCEL = '';
  });
  await check('full account pagination, exact asset quantities, priced stablecoins and bounded separate activity', async () => {
    const result = await provider.retrieveCoinbase(credentials);
    assert.equal(result.holdings.length, 3); assert.equal(result.holdings[0].quantity, '0.123456789012345678');
    assert.equal(result.holdings[1].valueUsd, 95); assert.equal(result.totalUsd, 9984.04);
    assert.equal(result.activity.length, 3); assert(!JSON.stringify(result).includes('private description'));
  });
  await check('hostile pagination, later-page failure, empty access and activity errors fail without a snapshot', async () => {
    for (mode of ['hostile-page', 'second-page-fails', 'empty', 'tx-failure']) await assert.rejects(provider.retrieveCoinbase(credentials), error => !error.message.includes('PRIVATE KEY'));
    mode = 'normal';
  });
  await check('matching preserves an existing account and syncing never creates spending transactions', async () => {
    const state = store.createEmptyFinanceState(), now = new Date().toISOString();
    state.accounts.push({ id: 'existing', name: 'My crypto', institution: 'My label', kind: 'Brokerage', currency: 'USD', entityScope: 'personal', mask: '', balanceAsOf: '2026-09-01', balanceSource: 'manual', currentBalance: 4, createdAt: now, updatedAt: now, createdBy: 'admin' });
    // Resolve the actual owner filename without coupling this harness to its spelling.
    const storeText = fs.readFileSync(path.join(__dirname, '../lib/modules/finance/store.ts'), 'utf8');
    const filename = storeText.match(/const FILE_NAME = "([^"]+)"/)[1];
    await native.writeJsonFile(filename, state);
    const result = await service.operateCoinbase({ operation: 'connect', ...credentials, accountId: 'existing', personalUse: true });
    assert.equal(result.connected, true); assert.equal(result.accountId, 'existing');
    assert(!JSON.stringify(result).includes(credentials.keyName)); assert(!JSON.stringify(result).includes('PRIVATE KEY'));
    const saved = await store.readFinanceState(); assert.equal(saved.accounts.length, 1); assert.equal(saved.accounts[0].name, 'My crypto');
    assert.equal(saved.accounts[0].currentBalance, 9984.04); assert.equal(saved.transactions.length, 0);
    assert(!fs.readFileSync(path.join(fixture, 'finance-coinbase-personal.json'), 'utf8').includes('PRIVATE KEY'));
  });
  await check('retries and concurrent updates do not duplicate the portfolio; cooldown is enforced', async () => {
    await assert.rejects(service.operateCoinbase({ operation: 'sync' }), error => error.code === 'coinbase_cooldown');
    await cooldown();
    const result = await Promise.allSettled([service.operateCoinbase({ operation: 'sync' }), service.operateCoinbase({ operation: 'sync' })]);
    assert.equal(result.filter(item => item.status === 'fulfilled').length, 1); assert.equal((await store.readFinanceState()).accounts.length, 1);
  });
  await check('permission escalation stops retrieval and preserves the last good balance and snapshot', async () => {
    const before = await service.coinbaseView(); await cooldown(); mode = 'trade'; calls = [];
    await assert.rejects(service.operateCoinbase({ operation: 'sync' }), error => error.code === 'coinbase_permissions');
    assert.deepEqual(calls, ['/api/v3/brokerage/key_permissions']); assert.deepEqual((await service.coinbaseView()).snapshot, before.snapshot);
    mode = 'normal';
  });
  await check('missing USD prices preserve the previous dated balance instead of writing a partial total', async () => {
    await cooldown(); mode = 'missing-price'; const before = (await store.readFinanceState()).accounts[0];
    const result = await service.operateCoinbase({ operation: 'sync' }); assert.equal(result.snapshot.totalUsd, null);
    const after = (await store.readFinanceState()).accounts[0]; assert.equal(after.currentBalance, before.currentBalance); assert.equal(after.balanceAsOf, before.balanceAsOf); mode = 'normal';
  });
  await check('linked balances and archive are protected while user labels remain editable', async () => {
    const record = (await store.readFinanceState()).accounts[0];
    for (const input of [{ action: 'archive', reason: 'test' }, { action: 'update', fields: { currentBalance: 1 } }]) {
      await assert.rejects(store.updateFinanceRecord({ kind: 'account', id: record.id, expectedUpdatedAt: record.updatedAt, ...input }, {}));
    }
    await store.updateFinanceRecord({ kind: 'account', id: record.id, expectedUpdatedAt: record.updatedAt, action: 'update', fields: { name: 'Personal crypto' } }, {});
  });
  await check('disconnect deletes the saved key, preserves history, and makes the account editable again', async () => {
    const before = await service.coinbaseView(), result = await service.operateCoinbase({ operation: 'disconnect' });
    assert.equal(result.connected, false); assert.deepEqual(result.snapshot, before.snapshot); assert(!service.decryptCoinbase(encryptedFile()).credentials);
    const account = (await store.readFinanceState()).accounts[0]; assert(!account.coinbaseLink); assert.equal(account.name, 'Personal crypto');
    await store.updateFinanceRecord({ kind: 'account', id: account.id, expectedUpdatedAt: account.updatedAt, action: 'update', fields: { currentBalance: 200 } }, {});
  });
  console.log(`${passed} Coinbase checks passed; all provider traffic was mocked.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => fs.rmSync(fixture, { recursive: true, force: true }));
