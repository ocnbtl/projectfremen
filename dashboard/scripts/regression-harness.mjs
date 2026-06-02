import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const dashboardDir = process.cwd();
const steps = [];
const skips = [];
const testRunId = `regression-${Date.now()}`;

function logStep(message) {
  console.log(`\n[regress] ${message}`);
}

function pass(message) {
  steps.push(message);
  console.log(`[pass] ${message}`);
}

function skip(message) {
  skips.push(message);
  console.log(`[skip] ${message}`);
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function describeStatus(response) {
  return `${response.status} ${response.statusText}`.trim();
}

async function runCommand(args, options = {}) {
  const env = options.env ? { ...process.env, ...options.env } : process.env;

  await new Promise((resolve, reject) => {
    const child = spawn(npmCommand, args, {
      cwd: dashboardDir,
      env,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed: npm ${args.join(" ")} (${signal || code})`));
    });
  });
}

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 3100;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

function getSetCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }

  const raw = response.headers.get("set-cookie");
  if (!raw) {
    return [];
  }

  return raw.split(/,(?=\s*[^;,\s]+=)/g);
}

class CookieJar {
  #values = new Map();

  apply(response) {
    for (const header of getSetCookieHeaders(response)) {
      const firstSegment = header.split(";")[0]?.trim() || "";
      const splitIndex = firstSegment.indexOf("=");
      if (splitIndex <= 0) {
        continue;
      }

      const key = firstSegment.slice(0, splitIndex).trim();
      const value = firstSegment.slice(splitIndex + 1).trim();
      const isExpired = /max-age=0/i.test(header) || value === "";

      if (isExpired) {
        this.#values.delete(key);
        continue;
      }

      this.#values.set(key, value);
    }
  }

  headerValue() {
    return Array.from(this.#values.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }

  get(name) {
    return this.#values.get(name) || "";
  }
}

async function startServer({ port, env }) {
  const child = spawn(
    npmCommand,
    ["run", "start", "--", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: dashboardDir,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  let output = "";
  const capture = (chunk) => {
    output += chunk.toString();
    if (output.length > 16000) {
      output = output.slice(-16000);
    }
  };

  child.stdout.on("data", capture);
  child.stderr.on("data", capture);

  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error("[regress] Local server exited early.");
    }
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const startedAt = Date.now();

  while (Date.now() - startedAt < 30000) {
    if (child.exitCode !== null) {
      fail(`Local server failed to start.\n${output}`);
    }

    try {
      const response = await fetch(`${baseUrl}/admin/login`, { redirect: "manual" });
      if (response.ok) {
        return { baseUrl, child, getOutput: () => output };
      }
    } catch {
      // Server is still starting.
    }

    await delay(500);
  }

  fail(`Local server did not become ready within 30 seconds.\n${output}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }, 2000);
  });
}

async function requestJson(baseUrl, cookieJar, pathname, options = {}) {
  const headers = new Headers(options.headers || {});
  const cookieHeader = cookieJar.headerValue();
  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers,
    redirect: options.redirect || "manual"
  });

  cookieJar.apply(response);
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

async function requestText(baseUrl, cookieJar, pathname, options = {}) {
  const headers = new Headers(options.headers || {});
  const cookieHeader = cookieJar.headerValue();
  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers,
    redirect: options.redirect || "manual"
  });

  cookieJar.apply(response);
  const body = await response.text();
  return { response, body };
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "project-fremen-regression-"));
  const port = await getFreePort();
  const cookieJar = new CookieJar();
  const serverEnv = {
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    ADMIN_PASSWORD: "codex-regression-password",
    ADMIN_SESSION_SECRET: "codex-regression-session-secret",
    FREMEN_REQUIRE_SUPABASE: "false",
    SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    FREMEN_DATA_DIR: path.join(tempRoot, "data"),
    OBSIDIAN_EXPORT_DIR: path.join(tempRoot, "obsidian"),
    GITHUB_TOKEN: "",
    SENTRY_AUTH_TOKEN: "",
    SENTRY_ORG_SLUG: "",
    SENTRY_ORG_SLUG_PNGWN: "",
    SENTRY_ORG_SLUG_DIYESU: "",
    SENTRY_PROJECT_SLUG_PNGWN: "",
    SENTRY_PROJECT_SLUG_DIYESU: ""
  };

  let server;
  let preserveTempDir = false;

  try {
    logStep("Running typecheck");
    await runCommand(["run", "typecheck"], {
      env: { NEXT_TELEMETRY_DISABLED: "1" }
    });
    pass("TypeScript check passed");

    logStep("Running production build");
    await runCommand(["run", "build"], {
      env: { NEXT_TELEMETRY_DISABLED: "1" }
    });
    pass("Production build passed");

    logStep("Starting isolated local server");
    server = await startServer({ port, env: serverEnv });
    pass(`Isolated local server started at ${server.baseUrl}`);

    logStep("Checking public entry points");
    const landing = await requestText(server.baseUrl, cookieJar, "/");
    assert(landing.response.ok, `Landing page failed: ${describeStatus(landing.response)}`);
    assert(landing.body.includes("Unigentamos"), "Landing page did not include Unigentamos branding");
    pass("Public landing page loads");

    const loginPage = await requestText(server.baseUrl, cookieJar, "/admin/login");
    assert(loginPage.response.ok, `Login page failed: ${describeStatus(loginPage.response)}`);
    assert(loginPage.body.includes('name="password"'), "Login form password field missing");
    pass("Admin login page loads");

    logStep("Checking unauthenticated API protection");
    const unauthKpis = await requestJson(server.baseUrl, cookieJar, "/api/kpis");
    assert(unauthKpis.response.status === 401, `Expected /api/kpis to return 401, got ${describeStatus(unauthKpis.response)}`);
    pass("Unauthenticated KPI API is blocked");

    const unauthPersonalRecords = await requestJson(server.baseUrl, cookieJar, "/api/personal/records");
    assert(
      unauthPersonalRecords.response.status === 401,
      `Expected /api/personal/records to return 401, got ${describeStatus(unauthPersonalRecords.response)}`
    );
    pass("Unauthenticated Personal Ops records API is blocked");

    const unauthPersonal = await requestText(server.baseUrl, cookieJar, "/admin/personal");
    assert(
      unauthPersonal.response.status === 307,
      `Expected /admin/personal to redirect when unauthenticated, got ${describeStatus(unauthPersonal.response)}`
    );
    assert(
      unauthPersonal.response.headers.get("location")?.includes("/admin/login"),
      "Unauthenticated Personal Ops redirect did not point to admin login"
    );
    pass("Unauthenticated Personal Ops page redirects to login");

    const unauthPersonalDetail = await requestText(server.baseUrl, cookieJar, "/admin/personal/travel");
    assert(
      unauthPersonalDetail.response.status === 307,
      `Expected /admin/personal/travel to redirect when unauthenticated, got ${describeStatus(unauthPersonalDetail.response)}`
    );
    assert(
      unauthPersonalDetail.response.headers.get("location")?.includes("/admin/login"),
      "Unauthenticated Personal Ops detail redirect did not point to admin login"
    );
    pass("Unauthenticated Personal Ops detail page redirects to login");

    logStep("Logging in as admin");
    const loginBody = new URLSearchParams({
      password: serverEnv.ADMIN_PASSWORD,
      errorPath: "/admin/login",
      successPath: "/admin?welcome=1"
    });
    const login = await requestText(server.baseUrl, cookieJar, "/api/admin/login", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: loginBody.toString()
    });
    assert(login.response.status === 303, `Expected login redirect, got ${describeStatus(login.response)}`);
    assert(cookieJar.get("admin_session"), "Login did not set admin_session cookie");
    assert(cookieJar.get("admin_csrf"), "Login did not set admin_csrf cookie");
    pass("Admin login succeeded and set session cookies");

    logStep("Checking protected pages and locked navigation");
    const adminHome = await requestText(server.baseUrl, cookieJar, `/admin?run=${encodeURIComponent(testRunId)}`);
    assert(adminHome.response.ok, `Admin home failed: ${describeStatus(adminHome.response)}`);
    for (const expected of ["Projects", "Blacktube", "Fremen", "Iceflake", "Pacific", "Pint", "Notes", "People", "Media", "Resources", "Finance", "Current Goals", "Weekly", "Monthly", "AI"]) {
      assert(adminHome.body.includes(expected), `Admin home missing expected text: ${expected}`);
    }
    assert(adminHome.body.includes("Personal Ops"), "Admin home missing Personal Ops entry point");
    pass("Admin home renders locked nav and review shortcuts");

    const personalPage = await requestText(server.baseUrl, cookieJar, "/admin/personal");
    assert(personalPage.response.ok, `Personal Ops page failed: ${describeStatus(personalPage.response)}`);
    for (const expected of ["Projects", "Notes", "People", "Media", "Personal Ops", "AI Monitoring", "Finance", "Travel", "Architecture Guardrails", "Open Travel", "Native Database"]) {
      assert(personalPage.body.includes(expected), `Personal Ops page missing expected text: ${expected}`);
    }
    pass("Personal Ops shell loads with domain map and guardrails");

    const projectsPage = await requestText(server.baseUrl, cookieJar, "/admin/projects");
    assert(projectsPage.response.ok, `Projects page failed: ${describeStatus(projectsPage.response)}`);
    for (const expected of ["Projects", "Project Blacktube", "Project Fremen", "Project Iceflake", "Project Pacific", "Project Pint"]) {
      assert(projectsPage.body.includes(expected), `Projects page missing expected text: ${expected}`);
    }
    pass("Projects hub loads with top-level project navigation");

    const notesPage = await requestText(server.baseUrl, cookieJar, "/admin/notes");
    assert(notesPage.response.ok, `Notes page failed: ${describeStatus(notesPage.response)}`);
    assert(notesPage.body.includes("Vault"), "Notes page missing Vault section");
    pass("Notes hub loads");

    const peoplePage = await requestText(server.baseUrl, cookieJar, "/admin/people");
    assert(peoplePage.response.ok, `People page failed: ${describeStatus(peoplePage.response)}`);
    assert(peoplePage.body.includes("CRM"), "People page missing CRM text");
    pass("People hub loads");

    const mediaPage = await requestText(server.baseUrl, cookieJar, "/admin/media");
    assert(mediaPage.response.ok, `Media page failed: ${describeStatus(mediaPage.response)}`);
    assert(mediaPage.body.includes("Media Boundary"), "Media page missing boundary text");
    pass("Media hub loads");

    const resourcesPage = await requestText(server.baseUrl, cookieJar, "/admin/resources");
    assert(resourcesPage.response.ok, `Resources page failed: ${describeStatus(resourcesPage.response)}`);
    assert(resourcesPage.body.includes("Resource library"), "Resources page missing library text");
    pass("Resources hub loads");

    const financePage = await requestText(server.baseUrl, cookieJar, "/admin/finance");
    assert(financePage.response.ok, `Finance page failed: ${describeStatus(financePage.response)}`);
    assert(financePage.body.includes("Finance command view"), "Finance page missing command view text");
    pass("Finance hub loads");

    const personalTravelPage = await requestText(server.baseUrl, cookieJar, "/admin/personal/travel");
    assert(personalTravelPage.response.ok, `Personal Ops Travel page failed: ${describeStatus(personalTravelPage.response)}`);
    for (const expected of ["Travel", "Create Note", "Core Properties", "Time and Review", "Saved Notes", "Database Fields", "Privacy Boundary", "trip command board"]) {
      assert(personalTravelPage.body.includes(expected), `Personal Ops Travel page missing expected text: ${expected}`);
    }
    pass("Personal Ops detail route loads with workflows, sources, and privacy boundary");

    const entityPage = await requestText(server.baseUrl, cookieJar, "/admin/entities/unigentamos");
    assert(entityPage.response.ok, `Entity page failed: ${describeStatus(entityPage.response)}`);
    assert(entityPage.body.includes("Back to Home"), "Entity page missing Back to Home link");
    pass("Entity page loads with Back to Home");

    const docsPage = await requestText(server.baseUrl, cookieJar, "/admin/docs");
    assert(docsPage.response.ok, `Docs page failed: ${describeStatus(docsPage.response)}`);
    pass("Docs page loads");

    const obsidianPage = await requestText(server.baseUrl, cookieJar, "/admin/obsidian");
    assert(obsidianPage.response.ok, `Obsidian page failed: ${describeStatus(obsidianPage.response)}`);
    pass("Obsidian page loads");

    const csrfToken = cookieJar.get("admin_csrf");
    assert(csrfToken, "CSRF token missing after login");

    logStep("Checking Personal Ops record persistence");
    const personalRecordTitle = `${testRunId}-travel-record`;
    const createPersonalRecord = await requestJson(server.baseUrl, cookieJar, "/api/personal/records", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        domain: "travel",
        title: personalRecordTitle,
        className: "task",
        status: "idea",
        body: "Regression-created travel planning record.",
        areas: ["Travel"],
        subjects: ["VanLife"],
        projects: ["Project Fremen"],
        intents: ["implement", "retain"],
        time: {
          reviewCadence: "P1W"
        }
      })
    });
    assert(
      createPersonalRecord.response.ok && createPersonalRecord.payload?.ok,
      `Personal record create failed: ${JSON.stringify(createPersonalRecord.payload)}`
    );

    const personalRecords = await requestJson(server.baseUrl, cookieJar, "/api/personal/records?domain=travel");
    assert(personalRecords.response.ok && personalRecords.payload?.ok, "Personal records GET failed");
    const savedPersonalRecord = personalRecords.payload.items?.find(
      (item) =>
        item.title === personalRecordTitle &&
        item.domain === "travel" &&
        item.createdMeta?.uid &&
        item.createdMeta?.createdYearMonth &&
        item.createdMeta?.createdQuarter &&
        item.growth === "seed" &&
        item.time?.nextReview &&
        !("priority" in item) &&
        !("tags" in item) &&
        !("relatedDomains" in item)
    );
    assert(savedPersonalRecord, "Saved Personal Ops record was not returned by domain GET with the full property model");

    const personalTravelAfterSave = await requestText(server.baseUrl, cookieJar, `/admin/personal/travel?record=${Date.now()}`);
    assert(personalTravelAfterSave.body.includes(personalRecordTitle), "Saved Personal Ops record missing from Travel page");
    assert(personalTravelAfterSave.body.includes("All Properties"), "Travel page missing full properties disclosure");

    const personalRecordDetail = await requestText(
      server.baseUrl,
      cookieJar,
      `/admin/personal/records/${savedPersonalRecord.id}?record=${Date.now()}`
    );
    assert(personalRecordDetail.response.ok, `Personal record detail failed: ${describeStatus(personalRecordDetail.response)}`);
    for (const expected of [personalRecordTitle, "All Properties", "Created_YearMonth", "Created_Quarter", "Review_Cadence"]) {
      assert(personalRecordDetail.body.includes(expected), `Personal record detail missing expected text: ${expected}`);
    }
    pass("Personal Ops record create/read/render/detail flow works");

    logStep("Checking Current Goals persistence and sync");
    const goalMarker = `${testRunId}-goal`;
    const goalPayload = [
      { text: `${goalMarker}-1`, done: false },
      { text: `${goalMarker}-2`, done: true },
      { text: `${goalMarker}-3`, done: false }
    ];
    const updateGoals = await requestJson(server.baseUrl, cookieJar, "/api/entity-goals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        slug: "unigentamos",
        goals: goalPayload
      })
    });
    assert(updateGoals.response.ok && updateGoals.payload?.ok, `Entity goals update failed: ${JSON.stringify(updateGoals.payload)}`);

    const goalsState = await requestJson(server.baseUrl, cookieJar, "/api/entity-goals?slug=unigentamos");
    assert(goalsState.response.ok && goalsState.payload?.ok, "Entity goals GET failed after update");
    assert(
      JSON.stringify(goalsState.payload.goals) === JSON.stringify(goalPayload),
      "Entity goals API did not preserve text/done state"
    );

    const syncedHome = await requestText(server.baseUrl, cookieJar, `/admin?sync=${Date.now()}`);
    assert(syncedHome.body.includes(`${goalMarker}-1`), "Updated goal text missing from admin home");
    assert(syncedHome.body.includes(`${goalMarker}-2`), "Done goal text missing from admin home");

    const syncedEntityPage = await requestText(server.baseUrl, cookieJar, `/admin/entities/unigentamos?sync=${Date.now()}`);
    assert(syncedEntityPage.body.includes(`${goalMarker}-1`), "Updated goal text missing from entity page");
    assert(syncedEntityPage.body.includes(`${goalMarker}-2`), "Done goal text missing from entity page");
    pass("Current Goals update persists and syncs between entity and home views");

    logStep("Checking KPI read/write flow");
    const kpiName = `${testRunId}-kpi`;
    const updateKpi = await requestJson(server.baseUrl, cookieJar, "/api/kpis", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        entity: "Unigentamos",
        name: kpiName,
        value: "42",
        priority: "P1",
        link: "https://example.com"
      })
    });
    assert(updateKpi.response.ok && updateKpi.payload?.ok, `KPI update failed: ${JSON.stringify(updateKpi.payload)}`);

    const kpis = await requestJson(server.baseUrl, cookieJar, "/api/kpis");
    assert(kpis.response.ok && kpis.payload?.ok && Array.isArray(kpis.payload.items), "KPI GET failed");
    assert(kpis.payload.items.some((item) => item.name === kpiName && item.value === "42"), "New KPI not found after save");
    pass("KPI CRUD surface saves and reads data");

    logStep("Checking review create/update flow");
    const createReview = await requestJson(server.baseUrl, cookieJar, "/api/reviews", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        kind: "weekly",
        scheduledFor: "2026-03-08"
      })
    });
    assert(createReview.response.ok && createReview.payload?.ok && createReview.payload.item?.id, "Weekly review create failed");
    const reviewId = createReview.payload.item.id;

    const updateReview = await requestJson(server.baseUrl, cookieJar, "/api/reviews", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        id: reviewId,
        kind: "weekly",
        scheduledFor: "2026-03-08",
        values: {
          reviewer: "Codex",
          blockers: `${testRunId}-blocker`
        }
      })
    });
    assert(updateReview.response.ok && updateReview.payload?.ok, `Weekly review update failed: ${JSON.stringify(updateReview.payload)}`);

    const reviews = await requestJson(server.baseUrl, cookieJar, "/api/reviews?kind=weekly");
    assert(reviews.response.ok && reviews.payload?.ok && Array.isArray(reviews.payload.items), "Weekly review list failed");
    assert(
      reviews.payload.items.some((item) => item.id === reviewId && item.values?.blockers === `${testRunId}-blocker`),
      "Updated weekly review values were not persisted"
    );
    pass("Weekly review create and update flow works");

    logStep("Checking docs, export, and Sentry integration surfaces");
    const docsIndex = await requestJson(server.baseUrl, cookieJar, "/api/docs");
    assert(docsIndex.response.ok && docsIndex.payload?.ok && Array.isArray(docsIndex.payload.items), "Docs index GET failed");
    pass("Docs index API loads");

    const exportPreview = await requestJson(server.baseUrl, cookieJar, "/api/exports/obsidian");
    assert(exportPreview.response.ok && exportPreview.payload?.ok, `Obsidian preview failed: ${JSON.stringify(exportPreview.payload)}`);
    assert(typeof exportPreview.payload.itemCount === "number", "Obsidian preview missing itemCount");
    pass("Obsidian export preview works");

    const exportDryRun = await requestJson(server.baseUrl, cookieJar, "/api/exports/obsidian", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ dryRun: true })
    });
    assert(exportDryRun.response.ok && exportDryRun.payload?.ok, `Obsidian dry-run POST failed: ${JSON.stringify(exportDryRun.payload)}`);
    pass("Obsidian export dry-run POST works");

    const sentryStatus = await requestJson(server.baseUrl, cookieJar, "/api/kpis/integrations/sentry");
    assert(sentryStatus.response.ok && sentryStatus.payload?.ok, "Sentry integration status GET failed");
    assert(Array.isArray(sentryStatus.payload.missing), "Sentry integration status missing details");
    pass("Sentry integration status API loads");

    skip("Docs sync POST is not run by default because it depends on external GitHub network access");
    skip("Sentry sync POST is not run by default because it depends on external Sentry network access");

    logStep("Checking logout flow");
    const logout = await requestJson(server.baseUrl, cookieJar, "/api/admin/logout", {
      method: "POST",
      headers: {
        "x-csrf-token": csrfToken
      }
    });
    assert(logout.response.ok && logout.payload?.ok, `Logout failed: ${JSON.stringify(logout.payload)}`);

    const afterLogout = await requestJson(server.baseUrl, cookieJar, "/api/kpis");
    assert(afterLogout.response.status === 401, `Expected post-logout /api/kpis 401, got ${describeStatus(afterLogout.response)}`);
    pass("Logout clears admin access");

    console.log("\n[regress] Summary");
    for (const item of steps) {
      console.log(`  PASS ${item}`);
    }
    for (const item of skips) {
      console.log(`  SKIP ${item}`);
    }
    console.log(`\n[regress] Completed ${steps.length} checks with ${skips.length} skips.`);
    await stopServer(server.child);
  } catch (error) {
    preserveTempDir = true;
    if (server?.child) {
      await stopServer(server.child);
    }

    console.error("\n[regress] FAILED");
    console.error(error instanceof Error ? error.message : String(error));
    if (server?.getOutput) {
      console.error("\n[regress] Server output tail:");
      console.error(server.getOutput());
    }
    console.error(`\n[regress] Preserved regression data directory: ${tempRoot}`);
    process.exitCode = 1;
  } finally {
    if (!preserveTempDir) {
      await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

await main();
