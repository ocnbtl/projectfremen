const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { chromium } = require("@playwright/test");
const root = path.resolve(__dirname, "..");
(async () => {
  const chunkDir = path.join(root, ".next", "static", "chunks");
  const chunks = fs.readdirSync(chunkDir).filter((n) => n.endsWith(".js"));
  const mapChunks = chunks.filter((n) =>
    fs
      .readFileSync(path.join(chunkDir, n), "utf8")
      .includes("/vendor/maplibre/maplibre-gl-worker.mjs"),
  );
  const calendarChunks = chunks.filter((n) =>
    fs
      .readFileSync(path.join(chunkDir, n), "utf8")
      .includes("This recurrence is too large to display"),
  );
  assert.ok(
    mapChunks.length && calendarChunks.length,
    "Find built owner runtime chunks",
  );
  const probe = createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const base = `http://127.0.0.1:${port}`;
  const fixture = fs.mkdtempSync(
    path.join(os.tmpdir(), "unigentamos-bundle-review-"),
  );
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
      env: {
        ...process.env,
        FREMEN_DATA_DIR: fixture,
        ADMIN_PASSWORD: "local-bundle-fixture",
        ADMIN_SESSION_SECRET: "local-bundle-session",
        FREMEN_REQUIRE_SUPABASE: "false",
        FREMEN_REQUIRE_PERSISTENT_DATA: "false",
        SUPABASE_URL: "",
        SUPABASE_SERVICE_ROLE_KEY: "",
        CENSUS_API_KEY: "",
        MORGEN_API_KEY: "",
        OPENROUTESERVICE_API_KEY: "",
        GITHUB_TOKEN: "",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  );
  let output = "";
  server.stdout.on("data", (x) => (output += x));
  server.stderr.on("data", (x) => (output += x));
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(`${base}/admin/login`);
        if (r.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 150));
    }
    assert.ok(ready, output);
    browser = await chromium.launch({ headless: true });
    const results = [];
    for (const route of [
      "/admin/projects",
      "/admin/notes",
      "/admin/finance",
      "/admin/calendar",
      "/admin/map",
    ]) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      const page = await context.newPage();
      await page.request.post(`${base}/api/admin/login`, {
        form: { password: "local-bundle-fixture" },
      });
      const scripts = new Set();
      page.on("request", (r) => {
        if (r.resourceType() === "script")
          scripts.add(new URL(r.url()).pathname.split("/").pop());
      });
      await page.goto(base + route, { waitUntil: "domcontentloaded" });
      await page.locator("h1").first().waitFor();
      if (route.endsWith("/map"))
        await page.locator(".maplibregl-canvas").waitFor();
      await page.waitForTimeout(1600);
      const mapLoaded = mapChunks.some((n) => scripts.has(n)),
        calendarLoaded = calendarChunks.some((n) => scripts.has(n));
      assert.equal(
        mapLoaded,
        route.endsWith("/map"),
        `${route} Map runtime loading`,
      );
      assert.equal(
        calendarLoaded,
        route.endsWith("/calendar"),
        `${route} Calendar runtime loading`,
      );
      results.push({
        route,
        mapLoaded,
        calendarLoaded,
        scriptRequests: scripts.size,
      });
      await context.close();
    }
    const report = {
      build: "optimized production",
      mapChunks,
      calendarChunks,
      results,
    };
    fs.writeFileSync(
      path.join(root, "output/workspace-review/bundle-isolation.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      "PASS Production Map and Calendar runtime isolation across five fresh route contexts",
    );
    console.log(JSON.stringify(report));
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
