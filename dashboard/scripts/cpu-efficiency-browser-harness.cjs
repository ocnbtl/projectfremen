/* Local production build only. No production records or external services. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { chromium } = require('@playwright/test');
const sharp = require('sharp');
const app = path.resolve(__dirname, '..'), data = fs.mkdtempSync(path.join(os.tmpdir(), 'fremen-cpu-browser-'));
const base = 'http://localhost:3238', secret = 'local-cpu-test-only', stamp = '2026-10-01T12:00:00.000Z';
const output = path.join(app, 'output', 'cpu-efficiency'); fs.mkdirSync(output, { recursive: true });
const recordFile = path.join(data, 'personal-records.json');
let server, browser;
const results = [];
(async () => {
  const bytes = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#15516c' } }).png().toBuffer();
  const records = Array.from({ length: 240 }, (_, i) => {
    const id = `personal-00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    fs.writeFileSync(path.join(data, `people-profile-photo-${id}.json`), JSON.stringify({ personId: id, mimeType: 'image/png', bytesBase64: bytes.toString('base64'), byteLength: bytes.length, updatedAt: stamp }));
    return { id, className: i % 8 ? 'person' : 'org', domain: 'family', title: `Synthetic ${String(i).padStart(3, '0')}`, createdAt: stamp, updatedAt: stamp, profile: { fullName: `Synthetic ${String(i).padStart(3, '0')}`, photoUrl: `/api/people/photos/${id}`, photoUpdatedAt: stamp } };
  });
  fs.writeFileSync(recordFile, JSON.stringify(records));
  fs.writeFileSync(path.join(data, 'planning-records.json'), JSON.stringify({ schemaVersion: 1, places: [], events: [], connections: [], reminders: [], savedViews: [] }));
  const initialRecords = fs.readFileSync(recordFile, 'utf8');
  server = spawn(process.execPath, [path.join(app, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3238'], { cwd: app, env: { ...process.env, ADMIN_PASSWORD: 'isolated-password', ADMIN_SESSION_SECRET: secret, FREMEN_DATA_DIR: data, FREMEN_REQUIRE_SUPABASE: 'false', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', RESEND_API_KEY: '', MORGEN_API_KEY: '', VERCEL: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; server.stdout.on('data', b => logs += b); server.stderr.on('data', b => logs += b);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  assert(ready, 'local production server starts');
  const payload = `v1.${Date.now() + 3600000}.${crypto.randomBytes(12).toString('base64url')}`;
  const token = payload + '.' + crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const headers = { Cookie: `admin_session=${token}; admin_csrf=isolated-csrf-token` };
  const url = base + records[1].profile.photoUrl;
  const first = await fetch(url, { headers }); assert.equal(first.status, 200);
  assert.deepEqual(Buffer.from(await first.arrayBuffer()), bytes);
  const etag = first.headers.get('etag'); assert(etag);
  assert.match(first.headers.get('cache-control'), /private.*no-cache.*must-revalidate/);
  assert(first.headers.get('vary').split(',').map(value => value.trim().toLowerCase()).includes('cookie'));
  for (const validator of [etag, 'W/' + etag, '"other", ' + etag]) {
    const response = await fetch(url, { headers: { ...headers, 'If-None-Match': validator } });
    assert.equal(response.status, 304); assert.equal((await response.arrayBuffer()).byteLength, 0);
  }
  assert.equal((await fetch(url, { headers: { 'If-None-Match': etag } })).status, 401, 'cached image cannot bypass sign-in');
  const expired = `v1.${Date.now() - 10000}.expired`;
  assert.equal((await fetch(url, { headers: { Cookie: 'admin_session=' + expired + '.' + crypto.createHmac('sha256', secret).update(expired).digest('base64url'), 'If-None-Match': etag } })).status, 401);
  const edit = await fetch(url + '?edit=1', { headers: { ...headers, 'If-None-Match': etag } });
  assert.equal(edit.status, 200); assert.match(edit.headers.get('cache-control'), /no-store/);
  assert.equal((await edit.json()).source, 'data:image/png;base64,' + bytes.toString('base64'));
  results.push('HTTP: exact image bytes, private revalidation, strong/weak validators, anonymous/expired-session denial, uncached editor source');

  browser = await chromium.launch({ headless: true });
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport });
    await context.addCookies([{ name: 'admin_session', value: token, url: base }]);
    // Route interception would disable Chromium's HTTP cache. Instead block only
    // off-origin traffic; revalidation itself is exercised explicitly above.
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage(), requests = [], errors = [];
    page.on('request', request => requests.push(new URL(request.url()).pathname));
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/admin/people', { waitUntil: 'domcontentloaded' });
    await page.locator('.people-directory-row-body').first().waitFor();
    await page.waitForTimeout(1200);
    const navPaths = [...new Set(requests.filter(p => p.startsWith('/admin/') || p === '/vault'))];
    assert.deepEqual(navPaths, ['/admin/people'], 'idle page must not preload other modules');
    const initialPhotos = requests.filter(p => p.startsWith('/api/people/photos/')).length;
    const images = page.locator('.people-directory-panel img');
    assert(await images.count() > 50, 'large fixture exercises offscreen images');
    assert(initialPhotos < await images.count(), 'offscreen pictures are deferred');
    await page.waitForFunction(() => { const img = document.querySelector('.people-directory-panel img'); return img?.complete && img.naturalWidth > 0; });
    await page.screenshot({ path: path.join(output, name + '-people.png') });
    const last = page.locator('.people-directory-row-body').last(); await last.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => { const images = document.querySelectorAll('.people-directory-panel img'); const img = images[images.length - 1]; return img?.complete && img.naturalWidth > 0; });
    assert(requests.filter(p => p.startsWith('/api/people/photos/')).length > initialPhotos, 'scroll loads deferred pictures');
    for (const [label, pathname] of [['Calendar', '/admin/calendar'], ['Map', '/admin/map'], ['Projects', '/admin/projects'], ['Notes', '/admin/notes'], ['Media', '/admin/media'], ['Personal', '/admin/personal'], ['Reviews', '/admin/reviews'], ['Resources', '/admin/resources'], ['Finance', '/admin/finance'], ['Vault', '/vault']]) {
      await page.getByRole('link', { name: label, exact: true }).click();
      await page.waitForURL(base + pathname);
      try { await page.waitForFunction(expected => [...document.querySelectorAll('.app-top-nav__links a')].some(a => a.getAttribute('href') === expected && a.getAttribute('aria-current') === 'page'), pathname, { timeout: 10000 }); }
      catch (error) { await page.screenshot({ path: path.join(output, name + '-navigation-failure.png') }); console.error({ name, label, pathname: page.url(), errors }); throw error; }
    }
    await page.getByRole('link', { name: 'People', exact: true }).click();
    await page.waitForURL('**/admin/people');
    await page.locator('.people-directory-row-body').first().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    results.push(`${name}: ${initialPhotos} initial picture requests for ${await images.count()} directory images; idle module preloads=0; deferred images, all module links and layout pass`);
    await context.close();
  }
  assert.equal(fs.readFileSync(recordFile, 'utf8'), initialRecords, 'all viewing/navigation leaves record storage unchanged');
  const mutationHeaders = { ...headers, Origin: base, 'Content-Type': 'application/json', 'x-csrf-token': 'isolated-csrf-token' };
  const crop = await fetch(url, { method: 'PATCH', headers: mutationHeaders, body: JSON.stringify({ expectedUpdatedAt: stamp, crop: { zoom: 1, panX: 0, panY: 0, outputSize: 256 } }) });
  assert.equal(crop.status, 200, await crop.text());
  const updated = await fetch(url, { headers: { ...headers, 'If-None-Match': etag } });
  assert.equal(updated.status, 200); assert.notEqual(updated.headers.get('etag'), etag, 'crop immediately changes cached representation');
  const source = await (await fetch(url + '?edit=1', { headers })).json();
  assert.equal(source.source, 'data:image/png;base64,' + bytes.toString('base64'), 'original source retained after crop');
  const stale = await fetch(url, { method: 'PATCH', headers: mutationHeaders, body: JSON.stringify({ expectedUpdatedAt: stamp, crop: { zoom: 2, panX: 0, panY: 0, outputSize: 256 } }) });
  assert.equal(stale.status, 409);
  const denied = await fetch(url, { method: 'DELETE', headers }); assert.equal(denied.status, 403, 'CSRF still enforced');
  const removed = await fetch(url, { method: 'DELETE', headers: mutationHeaders }); assert.equal(removed.status, 200);
  assert.equal((await fetch(url, { headers: { ...headers, 'If-None-Match': updated.headers.get('etag') } })).status, 404, 'deleted image cannot return 304');
  fs.writeFileSync(recordFile, JSON.stringify(records.filter(r => r.id !== records[2].id)));
  assert.equal((await fetch(base + records[2].profile.photoUrl, { headers: { ...headers, 'If-None-Match': etag } })).status, 404, 'removed profile denies its stored picture');
  results.push('Local mutation fixtures: crop invalidation, original preservation, stale-edit conflict, CSRF denial, photo/profile deletion visibility');
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ at: new Date().toISOString(), base, results }, null, 2));
  console.log(results.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server && server.exitCode === null) { server.kill(); await new Promise(resolve => server.once('exit', resolve)); }
  // Only the mkdtemp directory created above contains these synthetic records.
  fs.rmSync(data, { recursive: true, force: true });
});
