// Isolated project inspections: synthetic local records, with external services disabled.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const { chromium, expect } = require('@playwright/test');
const app = path.resolve(__dirname, '..'), out = path.join(app, 'output', 'projects-inspection');
const base = 'http://localhost:3249', secret = 'local-project-inspection';
fs.mkdirSync(out, { recursive: true });
const data = fs.mkdtempSync(path.join(out, 'fixture-'));
const server = spawn(process.execPath, [path.join(app, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3249'], { cwd: app, env: { ...process.env, ADMIN_PASSWORD: 'test', ADMIN_SESSION_SECRET: secret, FREMEN_DATA_DIR: data, FREMEN_REQUIRE_SUPABASE: 'false', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', RESEND_API_KEY: '', VERCEL: '' }, stdio: 'ignore' });
let browser, page;
(async () => {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
  browser = await chromium.launch();
  const context = await browser.newContext(), payload = `v1.${Date.now() + 3600000}.qa`;
  await context.addCookies([{ name: 'admin_session', value: payload + '.' + crypto.createHmac('sha256', secret).update(payload).digest('base64url'), url: base }, { name: 'admin_csrf', value: 'fixture-csrf', url: base }]);
  const headers = { origin: base, 'x-csrf-token': 'fixture-csrf' };
  const post = async (family, input, route = '/api/projects') => { const response = await context.request.post(base + route, { headers, data: { ...(route === '/api/projects' ? { operation: 'create' } : {}), family, input } }); assert(response.ok(), await response.text()); return (await response.json()).item; };
  const patch = async (family, item, changes) => { const response = await context.request.patch(base + '/api/projects', { headers, data: { family, id: item.id, expectedUpdatedAt: item.updatedAt, patch: changes } }); assert(response.ok(), await response.text()); return (await response.json()).item; };
  const read = async (family, id) => (await (await context.request.get(base + '/api/projects?family=' + family + '&id=' + id)).json()).item;
  let project = await post('projects', { name: 'Garden inspection', description: 'Coordinate the courtyard planting.', lifecycle: 'active' });
  const milestone = await post('milestones', { projectId: project.id, title: 'First planting day', description: 'Plant the courtyard beds with volunteers.', dueAt: '2026-12-12', completionCriteria: ['Plants in place', 'Watering schedule agreed'] });
  const blocker = await post('blockers', { projectId: project.id, title: 'Water access', condition: 'The outdoor tap needs a replacement fitting.', severity: 'high', dueAt: '2026-12-10' });
  await post('interactions', { projectId: project.id, title: 'Volunteer planning', body: 'Three neighbors can help on Saturday.\nConfirm the tool list before Friday.', occurredAt: '2026-11-03T14:30:00Z' });
  const source = { module: 'projects', objectType: 'project', objectId: project.id, label: project.name, route: '/admin/projects/' + project.id };
  const decision = await post('decisions', { title: 'Choose planting layout', question: 'Which layout leaves room for the path?', linkedRefs: [source] }, '/api/personal/ops');
  const linkedProject = await post('projects', { name: 'Reference planting plan' });
  const link = await post('links', { projectId: project.id, source: { ...source, objectId: linkedProject.id, label: linkedProject.name, route: '/admin/projects/' + linkedProject.id }, relationship: 'source_material' });
  await patch('links', link, { linkState: 'removed', removalReason: 'Superseded by the final plan.' });
  project = await patch('projects', await read('projects', project.id), { description: 'Plant the courtyard with neighbors.', completionTarget: '2026-12-12' });
  const state = (await (await context.request.get(base + '/api/projects')).json()).state;
  const event = kind => state.timelineEvents.find(item => item.projectId === project.id && item.eventType === kind);
  page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https:\/\//, route => route.abort());
  const inspect = async (id, name) => {
    await page.goto(base + '/admin/projects/' + project.id + '?tab=activity&item=' + id);
    const panel = page.getByRole('region', { name, exact: true });
    await expect(panel).toBeVisible();
    return panel;
  };
  const cases = [
    [milestone.id, milestone.title, 'milestone'], [blocker.id, blocker.title, 'blocker'],
    [event('project_updated').id, event('project_updated').title, 'project-update'],
    [event('link_removed').id, event('link_removed').title, 'link-removed'],
    [event('interaction_logged').id, event('interaction_logged').title, 'interaction'],
    ['decision-' + decision.id, decision.title, 'decision']
  ];
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [id, name, kind] of cases) {
      const panel = await inspect(id, name);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), kind + ' overflow ' + width);
      await panel.screenshot({ path: path.join(out, kind + '-' + width + '.png'), animations: 'disabled' });
      if (kind === 'milestone') {
        await expect(panel.getByText('Plants in place', { exact: true })).toBeVisible();
        await panel.getByRole('button', { name: 'Linked work', exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(panel.getByRole('heading', { name: 'Decisions', exact: true })).toBeVisible();
        await panel.getByText('Record details', { exact: true }).click();
        await expect(panel.getByText(milestone.id, { exact: true })).toBeVisible();
      }
      if (kind === 'project-update') {
        await expect(panel.getByText('What changed', { exact: true })).toBeVisible();
        await expect(panel.getByText('Plant the courtyard with neighbors.', { exact: true })).toBeVisible();
        await expect(panel.locator('form')).toBeHidden();
        await panel.getByText('Event details', { exact: true }).click();
        await expect(panel.getByLabel('Date and time')).toBeVisible();
      }
      if (kind === 'link-removed') await expect(panel.getByText('Superseded by the final plan.', { exact: true })).toBeVisible();
      if (kind === 'interaction') {
        await expect(panel.getByRole('region', { name: 'Change log', exact: true })).toBeHidden();
        await panel.getByText('Update history', { exact: true }).click();
        await expect(panel.getByRole('region', { name: 'Change log', exact: true })).toBeVisible();
      }
      await panel.getByRole('button', { name: 'Close inspection', exact: true }).click();
      await expect(panel).toHaveCount(0);
      await expect.poll(() => new URL(page.url()).searchParams.get('item'), { message: 'close clears the inspection URL' }).toBeNull();
    }
  }
  // Saving event details keeps the original source change and adds an audit entry.
  let panel = await inspect(event('project_updated').id, event('project_updated').title);
  await panel.getByText('Event details', { exact: true }).click();
  await panel.getByLabel('Date and time').fill('2026-11-04T11:45');
  await panel.getByRole('button', { name: 'Save event details', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Timeline event details were updated' })).toBeVisible();
  await page.reload();
  panel = page.getByRole('region', { name: event('project_updated').title, exact: true });
  await expect(panel.getByText('Date and time', { exact: true }).first()).toBeVisible();
  await expect(panel.getByText('Plant the courtyard with neighbors.', { exact: true })).toBeVisible();
  project = await patch('projects', await read('projects', project.id), { lifecycle: 'archived', archiveReason: 'Local read-only verification.', archiveConfirmed: true });
  panel = await inspect(blocker.id, blocker.title);
  await expect(panel.getByRole('button', { name: 'Resolve blocker' })).toBeDisabled();
  panel = await inspect(event('project_updated').id, event('project_updated').title);
  await panel.getByText('Event details', { exact: true }).click();
  await expect(panel.getByLabel('Date and time')).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Save event details' })).toHaveCount(0);
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ passed: true, widths: [320, 390, 1440], checks: ['six inspection types', 'readable audit changes and historical removal reason', 'event edit save and reload', 'keyboard follow-through and record disclosure', 'close clears selection', 'archived read-only controls', 'no page errors or horizontal overflow'] }, null, 2));
  console.log('PASS: local project inspections.');
})().catch(async error => { console.error(error); await page?.screenshot({ path: path.join(out, 'failure.png'), fullPage: true, animations: 'disabled' }).catch(() => {}); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.kill(); });
