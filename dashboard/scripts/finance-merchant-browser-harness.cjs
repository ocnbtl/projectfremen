/* Local production build + synthetic records. All browser traffic is loopback-only. */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { webkit, expect } = require('@playwright/test');
const app = path.resolve(__dirname, '..'), data = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-merchant-browser-'));
const output = path.join(app, 'output/finance-auto-merchants'); fs.mkdirSync(output, { recursive: true });
const today = new Date().toISOString().slice(0, 10), common = { createdAt: today + 'T12:00:00Z', updatedAt: today + 'T12:00:00Z', createdBy: 'fixture', currency: 'USD', entityScope: 'personal' };
const account = { ...common, id: 'a', name: 'Fixture Checking', kind: 'Checking', institution: 'Fixture Bank', mask: '', currentBalance: 1000, balanceAsOf: today, balanceSource: 'manual' };
const seed = { ...common, id: 'seed', occurredOn: today, merchant: 'Example billing', accountId: 'a', category: 'Software', amount: 20, direction: 'expense', memo: 'Fixture only', status: 'cleared', reviewed: true, reimbursable: false, source: { kind: 'manual' } };
const state = { schemaVersion: 1, updatedAt: null, accounts: [account], transactions: [seed], bills: [], budgets: [], rules: [], closePeriods: [], savingsMovements: [], transfers: [], auditEvents: [], importBatches: [], importPreviews: [], idempotency: [] };
fs.writeFileSync(path.join(data, 'finance.json'), JSON.stringify(state));
const port = String(20000 + crypto.randomInt(30000)), base = 'http://localhost:' + port, secret = crypto.randomBytes(24).toString('hex');
const server = spawn(process.execPath, [path.join(app, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', port], { cwd: app, env: { ...process.env, ADMIN_PASSWORD: 'test', ADMIN_SESSION_SECRET: secret, FREMEN_DATA_DIR: data, FREMEN_REQUIRE_SUPABASE: 'false', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', RESEND_API_KEY: '', VERCEL: '', PLAID_SECRET: '', COINBASE_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
const ready = new Promise((resolve, reject) => { let text = ''; const timer = setTimeout(() => reject(new Error('Local server timeout')), 15000); timer.unref(); server.stdout.on('data', b => { text += b; if (text.includes('Ready in')) { clearTimeout(timer); resolve(); } }); server.stderr.on('data', () => {}); server.once('error', reject); server.once('exit', code => reject(new Error('Local server exit ' + code))); });
let browser;
(async () => {
  await ready;
  browser = await webkit.launch({ executablePath: process.env.WEBKIT_EXECUTABLE });
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
  const payload = 'v1.' + (Date.now() + 3600000) + '.qa', csrf = crypto.randomBytes(24).toString('hex');
  await context.addCookies([{ name: 'admin_session', value: payload + '.' + crypto.createHmac('sha256', secret).update(payload).digest('base64url'), url: base }, { name: 'admin_csrf', value: csrf, url: base }]);
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const page = await context.newPage(), errors = []; let identityReads = 0;
  page.setDefaultTimeout(10000);
  const navigate=page.goto.bind(page); page.goto=async (...args)=>{const result=await navigate(...args);await page.waitForTimeout(700);return result;};
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url() === base + '/api/native-links' && request.method() === 'GET') identityReads++; });
  const image = (await require('sharp')({ create: { width: 96, height: 96, channels: 3, background: '#156b55' } }).png().toBuffer()).toString('base64');
  const companies = [];
  for (const title of ['Fixture Merchant', 'Other Merchant']) {
    const response = await context.request.post(base + '/api/personal/records', { headers: { 'x-csrf-token': csrf }, data: { domain: 'notes-docs', className: 'org', title, profile: { fullName: title, organizationType: 'Business', industry: 'Technology' }, body: 'Synthetic local organization.', initialPhoto: 'data:image/png;base64,' + image } });
    assert.equal(response.status(), 200); companies.push((await response.json()).items.find(row => row.title === title));
  }
  const response = await context.request.post(base + '/api/native-links', { headers: { 'x-csrf-token': csrf }, data: { source: { module: 'finance', objectType: 'transaction', objectId: 'seed', label: seed.merchant, route: '/admin/finance/transactions?selected=seed' }, target: { module: 'people', objectType: 'organization', objectId: companies[0].id, label: companies[0].title, route: '/admin/people/' + companies[0].id }, relationship: 'merchant' } });
  assert.equal(response.status(), 201);
  await page.goto(base + '/admin/finance/transactions'); await expect(page.getByRole('button', { name: 'Add transaction', exact: true })).toBeVisible();
  assert.equal(identityReads, 0, 'No identity refresh on page load');
  async function add(amount, explicitOrganization, mobile = false) {
    console.log(`Checking ${mobile ? 'mobile' : 'desktop'} save ${amount}`);
    if (mobile) await page.getByRole('button', { name: 'Finance actions', exact: true }).click();
    await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Add transaction', exact: true });
    await dialog.locator('input[name=merchant]').fill('Example billing'); await dialog.locator('input[name=amount]').fill(String(amount));
    if (explicitOrganization) { await dialog.getByRole('combobox', { name: 'Merchant organization', exact: true }).click(); await page.getByRole('option', { name: explicitOrganization, exact: true }).click(); }
    await dialog.getByRole('button', { name: 'Save', exact: true }).click(); await expect(dialog).toHaveCount(0);
    const saved = (await (await context.request.get(base + '/api/finance')).json()).state;
    const transaction = saved.transactions.find(row => row.amount === amount); assert(transaction); assert.equal(transaction.status, 'cleared');
    assert.deepEqual(saved.accounts, [account]); assert.deepEqual(saved.transactions.find(row => row.id === 'seed'), seed);
    const card = page.locator(`[data-finance-transaction-id="${transaction.id}"]`);
    await expect(card.locator('img').first()).toBeVisible();
    assert(await card.locator('img').first().evaluate(img => img.complete && img.naturalWidth > 0), 'Matched logo loaded without reloading');
    await card.getByRole('button', { name: /^Inspect / }).click();
    await expect(page.locator('#finance-inspector')).toContainText(explicitOrganization || 'Fixture Merchant');
    const savedLinks = (await (await context.request.get(base + '/api/native-links')).json()).items.filter(link => link.source.objectId === transaction.id && link.status === 'active');
    assert.equal(savedLinks.length, 1); assert.equal(savedLinks[0].target.objectId, companies[explicitOrganization ? 1 : 0].id);
    return transaction;
  }
  const first = await add(12.34); assert.equal(identityReads, 1);
  await page.screenshot({ path: path.join(output, 'desktop-auto-link.png') });
  await page.getByRole('button', { name: 'Edit transaction', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Edit transaction', exact: true });
  await dialog.getByRole('combobox', { name: 'Merchant organization', exact: true }).click(); await page.getByRole('option', { name: 'No organization', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click(); await expect(dialog).toHaveCount(0);
  assert.equal(identityReads, 1, 'Ordinary edits do not scan identities');
  let savedLinks = (await (await context.request.get(base + '/api/native-links')).json()).items;
  assert(!savedLinks.some(link => link.source.objectId === first.id && link.status === 'active'));
  await page.goto(base + '/admin/finance/transactions');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await add(13.45, null, true); assert.equal(identityReads, 2);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(output, 'mobile-auto-link.png') });
  await page.goto(base + '/admin/finance/transactions'); await page.setViewportSize({ width: 1440, height: 1000 });
  await add(14.56, 'Other Merchant'); assert.equal(identityReads, 3);
  const finalCompanies = JSON.parse(fs.readFileSync(path.join(data, 'personal-records.json'), 'utf8')).filter(row => row.className === 'org'); assert.equal(finalCompanies.length, 2);
  assert.deepEqual(errors, []);
  console.log('PASS local WebKit desktop/mobile: automatic logo/organization appears without reload, one refresh per addition, no refresh on edits or navigation, explicit override wins, removal persists, existing amounts/statuses/accounts unchanged, no duplicate organizations, no browser errors.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.kill(); });
