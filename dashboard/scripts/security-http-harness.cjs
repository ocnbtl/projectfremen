const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtemp } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createServer } = require('node:net');
(async () => {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://localhost:${port}`;
  const data = await mkdtemp(path.join(tmpdir(), 'fremen-security-'));
  const password = 'isolated-security-regression-password';
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: path.resolve(__dirname, '..'), stdio: 'ignore',
    env: { ...process.env, ADMIN_PASSWORD: password, ADMIN_SESSION_SECRET: 'isolated-security-session-secret', FREMEN_DATA_DIR: data, FREMEN_REQUIRE_SUPABASE: 'false', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', RESEND_API_KEY: '', VERCEL: '' }
  });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base)).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'Isolated server starts');
    const login = (form, agent = 'test-browser', ip = '198.51.100.77') => fetch(`${base}/api/admin/login`, {
      method: 'POST', redirect: 'manual', headers: { origin: base, 'user-agent': agent, 'x-vercel-forwarded-for': ip }, body: new URLSearchParams(form)
    });
    assert.equal((await fetch(`${base}/api/vault/time`)).status, 401);
    const legacy = createHash('sha256').update(`admin-session:${password}`).digest('hex');
    assert.equal((await fetch(`${base}/api/vault/time`, { headers: { cookie: `admin_session=${legacy}` } })).status, 401);
    const valid = await login({ password, successPath: '/admin/map' });
    assert.equal(valid.status, 303);
    assert.equal(valid.headers.get('location'), `${base}/admin/map`);
    const session = valid.headers.getSetCookie().find(value => value.startsWith('admin_session='));
    assert.match(session, /HttpOnly/i);
    assert.match(session, /Max-Age=43200/i);
    assert.equal((await fetch(`${base}/api/vault/time`, { headers: { cookie: session.split(';')[0] } })).status, 200);
    const badRedirect = await login({ password: 'wrong', errorPath: '/\\outside.example' }, 'test', '198.51.100.78');
    assert.equal(new URL(badRedirect.headers.get('location')).origin, base);
    for (let i = 0; i < 8; i++) await login({ password: 'wrong' }, `rotating-${i}`, '198.51.100.79');
    const blocked = await login({ password }, 'fresh-agent', '198.51.100.79');
    assert.equal(blocked.headers.getSetCookie().length, 0, 'Correct password cannot bypass blocked bucket by changing User-Agent');
    assert.equal(new URL(blocked.headers.get('location')).searchParams.get('error'), '1');
    console.log('PASS: real HTTP login sets expiring signed cookies; protected route accepts them and rejects legacy cookies; external redirect blocked; changing User-Agent cannot bypass throttling. Isolated temporary data only.');
  } finally { child.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
