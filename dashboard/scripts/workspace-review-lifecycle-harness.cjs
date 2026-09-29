/* Isolated adverse historical records; never loads production data or environment files. */
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
  path.join(os.tmpdir(), "unigentamos-review-lifecycle-"),
);
const env = {
  FREMEN_DATA_DIR: fixture,
  ADMIN_PASSWORD: "local-review-fixture",
  ADMIN_SESSION_SECRET: "local-review-session",
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
  const { createReviewRun } = require("../lib/modules/reviews/store.ts");
  const { item } = await createReviewRun({
    cadence: "weekly",
    title: "Historical review fixture",
    periodStart: "2026-09-07",
    periodEnd: "2026-09-13",
    current: false,
  });
  const sourceRef = {
    module: "projects",
    objectType: "project",
    objectId: "historical-source",
    label: "Historical source",
    route: "/admin/projects/historical-source",
  };
  const stamp = item.updatedAt;
  const longSummary = Array.from(
    { length: 12 },
    (_, i) =>
      `Saved paragraph ${i + 1}: The courtyard review retained its decisions and supporting evidence, including incomplete historical relationships.`,
  ).join("\n\n");
  item.summary.summary = longSummary;
  item.decisions = [
    {
      id: "decision-candidate",
      title: "Unlinked historical decision",
      question: "Which entrance?",
      sourceRef,
      destinationModule: "personal_ops",
      destinationObjectType: "decision",
      state: "open",
      ownerId: "admin",
      risk: "low",
      impact: "low",
      confidence: "low",
      reversibility: "reversible",
      rationale: "",
      recommendation: "",
      alternatives: [],
      reversalCondition: "",
      evidenceIds: [],
      required: false,
      blocksCompletion: false,
      resolution: {},
      createdAt: stamp,
      updatedAt: stamp,
    },
  ];
  item.followUps = [
    {
      id: "follow-up-candidate",
      title: "Unlinked historical follow-up",
      sourceRef,
      destinationModule: "personal_ops",
      ownerId: "admin",
      state: "open",
      required: false,
      blocksCompletion: false,
      createdAt: stamp,
      updatedAt: stamp,
    },
  ];
  const states = ["completed", "archived", "canceled"];
  const runs = states.map((lifecycle) => ({
    ...structuredClone(item),
    id: `${item.id}-${lifecycle}`,
    title: `${lifecycle} review fixture`,
    lifecycle,
    ...(lifecycle === "archived"
      ? { archivedAt: stamp, lifecycleBeforeArchive: "in_progress" }
      : {}),
  }));
  fs.writeFileSync(
    path.join(fixture, "review-runs.json"),
    JSON.stringify({
      schemaVersion: 1,
      runs,
      auditEvents: [],
      legacyMappings: [],
    }),
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
    const out = path.join(root, "output/workspace-review");
    fs.mkdirSync(out, { recursive: true });
    for (const run of runs) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`${base}/admin/reviews/${run.id}`, {
        waitUntil: "networkidle",
      });
      const summary = page.locator("#review-item-summary");
      assert.equal(
        await summary.locator("input,textarea,button").count(),
        0,
        `${run.lifecycle} summary is readable text`,
      );
      assert.ok(
        (await summary.innerText()).includes("Saved paragraph 12"),
        "Long saved content is retained",
      );
      assert.equal(
        await summary
          .locator("dd")
          .first()
          .evaluate((el) => getComputedStyle(el).userSelect),
        "auto",
        "Saved content permits selection",
      );
      if (run.lifecycle === "completed")
        await page.screenshot({
          path: path.join(out, "completed-review-desktop.png"),
        });
      for (const name of ["Checklist", "Decisions", "Follow-ups"]) {
        await page.getByRole("tab", { name: new RegExp(`^${name}`) }).click();
        const panel = page.locator('[role="tabpanel"]:visible');
        const enabledMutations = panel
          .getByRole("button", {
            name: /^(Add candidate|Add follow-up|Carry forward|Mark complete|Reopen|Link exact|Choose linked|Link filed|Link current|Link existing|Record owner completion)/,
          })
          .locator(":scope:not(:disabled)");
        assert.equal(
          await enabledMutations.count(),
          0,
          `${run.lifecycle} ${name} cannot mutate`,
        );
        assert.equal(
          await panel
            .getByRole("link", {
              name: /Create once|Create current replacement/,
            })
            .count(),
          0,
          "No unusable creation handoff",
        );
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${base}/admin/reviews/${run.id}`, {
        waitUntil: "networkidle",
      });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Phone reflow",
      );
      if (run.lifecycle === "completed")
        await page.screenshot({
          path: path.join(out, "completed-review-phone.png"),
        });
      await page
        .getByRole("button", { name: "Review details", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Review completion rail",
        exact: true,
      });
      await dialog.waitFor();
      assert.equal(
        await dialog.getByRole("button", { name: /Close/ }).count(),
        1,
        "One close control",
      );
      await dialog
        .getByRole("button", { name: "View checklist", exact: true })
        .click();
      await dialog.waitFor({ state: "hidden" });
      await expect(
        page.getByRole("tab", { name: /^Checklist/ }),
      ).toHaveAttribute("aria-selected", "true");
      console.log(
        `PASS ${run.lifecycle} review: readable summary, immutable controls, phone close and section navigation`,
      );
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(mutations, []);
    await context.close();
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
