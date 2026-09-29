/* Saved icon choices and additive registry coverage, using an isolated store only. */
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const ts = require("typescript");
const { chromium, expect } = require("@playwright/test");
const root = path.resolve(__dirname, "..");
const fixture = fs.mkdtempSync(
  path.join(os.tmpdir(), "unigentamos-icon-selections-"),
);
const env = {
  FREMEN_DATA_DIR: fixture,
  ADMIN_PASSWORD: "local-icon-fixture",
  ADMIN_SESSION_SECRET: "local-icon-session",
  FREMEN_REQUIRE_SUPABASE: "false",
  FREMEN_REQUIRE_PERSISTENT_DATA: "false",
  SUPABASE_URL: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  CENSUS_API_KEY: "",
  MORGEN_API_KEY: "",
  OPENROUTESERVICE_API_KEY: "",
  GITHUB_TOKEN: "",
  NEXT_TELEMETRY_DISABLED: "1",
};
Object.assign(process.env, env);
// Match TypeScript's extensionless resolution when a role registry also has a JSON source.
const Module = require("node:module");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith(".") && !path.extname(request) && parent?.filename) {
    const candidate = path.resolve(
      path.dirname(parent.filename),
      `${request}.ts`,
    );
    if (fs.existsSync(candidate)) return candidate;
  }
  return resolveFilename.call(this, request, parent, ...rest);
};
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );

(async () => {
  const {
    ICON_REGISTRY,
    selectedIconMap,
  } = require("../lib/icons/icon-registry.ts");
  const {
    defaultStyleGuideState,
    readStyleGuideState,
    saveStyleGuideState,
    selectStyleGuideIcon,
  } = require("../lib/modules/style-guide/store.ts");
  const protectedRoles = [
    "projects",
    "notes",
    "people",
    "media",
    "personal",
    "reviews",
    "resources",
    "finance",
    "vault",
  ].map((id) => `module-${id}`);
  const selected = Object.fromEntries(
    protectedRoles.map((role) => [
      role,
      ICON_REGISTRY.find((entry) => entry.id === role).candidates[1],
    ]),
  );
  const original = defaultStyleGuideState();
  original.modules = original.modules.filter(
    (module) => !["map", "calendar"].includes(module.id),
  );
  original.modules[0].tokens.icon = "#3A5160";
  original.colors[0].value = "#13252B";
  original.icons = protectedRoles.map((role) => ({
    id: `icon-${role}`,
    icon: role,
    selection: selected[role],
    resourceId: `fixture-${role}`,
    usage: "Saved module selection",
  }));
  original.createdAt = original.updatedAt = "2026-01-01T00:00:00.000Z";
  const storePath = path.join(fixture, "personal-style-guide.json");
  const source = JSON.stringify(original);
  fs.writeFileSync(storePath, source);
  let state = await readStyleGuideState();
  assert.equal(
    fs.readFileSync(storePath, "utf8"),
    source,
    "Reading a larger registry does not rewrite saved data",
  );
  assert.equal(
    state.modules.length,
    11,
    "New module palettes appear additively",
  );
  assert.deepEqual(
    selectedIconMap(state.icons),
    selected,
    "All nine saved selections survive registry expansion",
  );
  state = await saveStyleGuideState(state, state.updatedAt);
  state = await selectStyleGuideIcon(
    "module-map",
    "compass",
    "fixture-map",
    state.updatedAt,
  );
  state = await readStyleGuideState();
  for (const assignment of original.icons)
    assert.deepEqual(
      state.icons.find((item) => item.icon === assignment.icon),
      assignment,
      "Selecting a new role preserves each existing assignment and Resource identity",
    );
  assert.equal(
    state.modules.find((module) => module.id === original.modules[0].id).tokens
      .icon,
    "#3A5160",
    "Saved palette survives the expanded module count",
  );
  assert.equal(state.colors[0].value, "#13252B", "Saved system colors survive");
  for (const entry of ICON_REGISTRY)
    assert.equal(
      new Set(entry.candidates).size,
      5,
      `${entry.id} has five distinct options`,
    );
  console.log(
    "PASS additive registry reads/saves preserve nine selections, Resource IDs and saved palettes",
  );

  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(
    process.execPath,
    [
      path.join(root, "node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: root,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
    },
  );
  let output = "",
    browser;
  server.stdout.on("data", (chunk) => (output += chunk));
  server.stderr.on("data", (chunk) => (output += chunk));
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        if ((await fetch(`${base}/admin/login`)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    assert.ok(ready, output);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage(),
      errors = [],
      mutations = [];
    await page.request.post(`${base}/api/admin/login`, {
      form: { password: env.ADMIN_PASSWORD },
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()))
        mutations.push(request.url());
    });
    await page.goto(`${base}/admin/personal/style-guide`, {
      waitUntil: "networkidle",
    });
    for (const role of protectedRoles)
      await expect(
        page.locator(`.admin-global-nav-link [data-icon-role="${role}"]`),
      ).toHaveAttribute("data-icon-candidate", selected[role]);
    await expect(
      page.locator('#modules summary [data-icon-role="module-calendar"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('#modules summary [data-icon-role="module-map"]'),
    ).toHaveAttribute("data-icon-candidate", "compass");
    for (const role of [
      "module-map",
      "module-calendar",
      "reminder",
      "warning",
    ]) {
      const row = page
        .locator("article")
        .filter({ has: page.getByText(role, { exact: true }) });
      const change = row.getByRole("button", { name: "Change", exact: true });
      if (await change.count()) await change.click();
      await expect(
        row.getByRole("button", { name: /^(Select|Keep)$/ }),
      ).toHaveCount(5);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(
      mutations,
      [],
      "Viewing options never changes selected icons",
    );
    await page.reload({ waitUntil: "networkidle" });
    for (const role of protectedRoles)
      await expect(
        page.locator(`.admin-global-nav-link [data-icon-role="${role}"]`),
      ).toHaveAttribute("data-icon-candidate", selected[role]);
    await context.close();
    console.log(
      "PASS navigation and Style Guide retain selected module marks and expose five options for all additions",
    );
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
