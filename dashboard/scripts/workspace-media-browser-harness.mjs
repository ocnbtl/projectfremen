import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { chromium, devices } from "@playwright/test";

const dashboardRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = path.resolve(dashboardRoot, "..");
const nextCli = path.join(
  dashboardRoot,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);
const companionEntrypoint = path.join(
  repositoryRoot,
  "vault-companion",
  "src",
  "server.mjs",
);

async function freePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

function spawnCaptured(command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const capture = (chunk) => {
    output += chunk.toString();
    if (output.length > 12_000) output = output.slice(-12_000);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  return { child, output: () => output };
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    let finished = false;
    let forceTimer;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(forceTimer);
      resolve();
    };
    child.once("exit", finish);
    child.kill("SIGTERM");
    forceTimer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.unref();
      finish();
    }, 3000);
  });
}

async function waitFor(url, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function setLocalInboxRejection(page, rejectionReason) {
  return page.evaluate(async (reason) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("unigentamos-vault-v1", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const request = database
        .transaction("inbox", "readonly")
        .objectStore("inbox")
        .getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const candidate = rows.filter((row) => row.appliedAt).at(-1);
    if (!candidate) throw new Error("Applied recovery inbox row is missing");
    delete candidate.appliedAt;
    candidate.rejectedAt = new Date().toISOString();
    candidate.rejectionReason = reason;
    const transaction = database.transaction("inbox", "readwrite");
    transaction.objectStore("inbox").put(candidate);
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, rejectionReason);
}

async function clearLocalInboxRejections(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("unigentamos-vault-v1", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const request = database
        .transaction("inbox", "readonly")
        .objectStore("inbox")
        .getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("inbox", "readwrite");
    for (const row of rows) {
      if (!row.rejectedAt) continue;
      delete row.rejectedAt;
      delete row.rejectionReason;
      row.appliedAt = new Date().toISOString();
      transaction.objectStore("inbox").put(row);
    }
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  });
}

const tempRoot = await mkdtemp(
  path.join(tmpdir(), "unigentamos-media-browser-"),
);
const vaultRoot = path.join(tempRoot, "vault");
const backupRoot = path.join(tempRoot, "backups");
const dataRoot = path.join(tempRoot, "data");
const webPort = await freePort();
const companionPort = await freePort();
const baseUrl = `http://localhost:${webPort}`;
const companionBaseUrl = `http://127.0.0.1:${companionPort}`;
const artifactRoot = path.join(dashboardRoot, "output", "playwright");
const relayEnvelopes = [];
const mediaChunks = new Map();
const deviceStatuses = new Map();
const canonicalRecords = new Map();
const canonicalCommandAttempts = new Map();
let rejectMediaUploads = false;
let companion;
let application;
let browser;
let page;

function jsonResponse(route, body) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { Date: new Date().toUTCString(), "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  });
}

function deviceStatusPayload() {
  const devices = [...deviceStatuses.values()].sort((left, right) =>
    right.lastSeenAt.localeCompare(left.lastSeenAt),
  );
  const activeDevices = devices.filter(
    (device) => device.lifecycle === "active",
  );
  return {
    ok: true,
    relayHeadSequence: relayEnvelopes.at(-1)?.sequence || 0,
    devices,
    relayHealth: {
      relayRows: relayEnvelopes.length,
      relayBytes: relayEnvelopes.reduce(
        (total, envelope) => total + Number(envelope.byteLength || 0),
        0,
      ),
      rowLimit: 200_000,
      byteLimit: 201_326_592,
      activeDevices: activeDevices.length,
      retiredDevices: devices.length - activeDevices.length,
      safeCompactionSequence: activeDevices.length
        ? Math.min(
            ...activeDevices.map((device) => device.acknowledgedSequence),
          )
        : 0,
      lastCompactedAt: null,
      lastDeletedChanges: 0,
    },
    serverTime: new Date().toISOString(),
  };
}

async function rejectUnauthorizedVaultRequest(context, route, required) {
  if (!required) return false;
  const cookies = await context.cookies(baseUrl);
  if (cookies.some((cookie) => cookie.name === "admin_session" && cookie.value))
    return false;
  await route.fulfill({
    status: 401,
    contentType: "application/json",
    headers: { "Cache-Control": "no-store" },
    body: JSON.stringify({ ok: false, error: "Unauthorized" }),
  });
  return true;
}

async function mockVaultRuntime(
  context,
  { requireAdminSession = false, companionAvailable = true } = {},
) {
  await context.route("http://127.0.0.1:43127/**", async (route) => {
    if (!companionAvailable)
      return route.fulfill({ status: 404, body: "Not found" });
    const url = new URL(route.request().url());
    await route.continue({
      url: `${companionBaseUrl}${url.pathname}${url.search}`,
    });
  });
  await context.route("**/api/vault/sync*", async (route) => {
    if (
      await rejectUnauthorizedVaultRequest(context, route, requireAdminSession)
    )
      return;
    const request = route.request();
    if (request.method() === "POST") {
      const input = request.postDataJSON();
      const acceptedChangeIds = [];
      for (const envelope of input.envelopes || []) {
        acceptedChangeIds.push(envelope.changeId);
        if (
          relayEnvelopes.some(
            (item) =>
              item.vaultId === envelope.vaultId &&
              item.changeId === envelope.changeId,
          )
        )
          continue;
        relayEnvelopes.push({
          ...envelope,
          sequence: relayEnvelopes.length + 1,
          receivedAt: new Date().toISOString(),
        });
      }
      return jsonResponse(route, {
        ok: true,
        acceptedChangeIds,
        serverTime: new Date().toISOString(),
      });
    }
    const url = new URL(request.url());
    const since = Number(url.searchParams.get("since") || 0);
    const vaultId = url.searchParams.get("vaultId");
    return jsonResponse(route, {
      ok: true,
      envelopes: relayEnvelopes.filter(
        (item) => item.vaultId === vaultId && item.sequence > since,
      ),
      serverTime: new Date().toISOString(),
    });
  });
  await context.route("**/api/vault/devices*", async (route) => {
    if (
      await rejectUnauthorizedVaultRequest(context, route, requireAdminSession)
    )
      return;
    const request = route.request();
    if (request.method() === "POST") {
      const input = request.postDataJSON();
      const now = new Date().toISOString();
      const head = relayEnvelopes.at(-1)?.sequence || 0;
      const key = `${input.vaultId}:${input.deviceId}`;
      const existing = deviceStatuses.get(key);
      const acknowledgedSequence = Math.max(
        existing?.acknowledgedSequence || 0,
        Math.min(input.acknowledgedSequence, head),
      );
      const current =
        input.pendingChanges === 0 &&
        input.blockedChanges === 0 &&
        acknowledgedSequence >= head;
      deviceStatuses.set(key, {
        deviceId: input.deviceId,
        descriptor: input.descriptor,
        lifecycle: existing?.lifecycle || "active",
        retiredAt: existing?.retiredAt || null,
        acknowledgedSequence,
        pendingChanges: input.pendingChanges,
        blockedChanges: input.blockedChanges,
        lastSeenAt: now,
        lastSyncedAt: current ? now : existing?.lastSyncedAt || null,
      });
    } else if (request.method() === "DELETE") {
      const input = request.postDataJSON();
      const key = `${input.vaultId}:${input.targetDeviceId}`;
      const existing = deviceStatuses.get(key);
      if (existing)
        deviceStatuses.set(key, {
          ...existing,
          lifecycle: "retired",
          retiredAt: new Date().toISOString(),
        });
    }
    return jsonResponse(route, deviceStatusPayload());
  });
  await context.route("**/api/vault/compact", async (route) => {
    if (
      await rejectUnauthorizedVaultRequest(context, route, requireAdminSession)
    )
      return;
    const payload = deviceStatusPayload();
    return jsonResponse(route, {
      ok: true,
      safeSequence: payload.relayHealth.safeCompactionSequence,
      deletedChanges: 0,
      retainedChanges: relayEnvelopes.length,
      activeDevices: payload.relayHealth.activeDevices,
      outcome: "nothing_to_compact",
      relayHealth: payload.relayHealth,
      serverTime: new Date().toISOString(),
    });
  });
  await context.route("**/api/vault/records", async (route) => {
    if (
      await rejectUnauthorizedVaultRequest(context, route, requireAdminSession)
    )
      return;
    const { command } = route.request().postDataJSON();
    const [module, collection, ...recordParts] = command.canonicalId.split(":");
    const recordId = recordParts.join(":");
    const priorRecord = canonicalRecords.get(command.canonicalId);
    canonicalCommandAttempts.set(
      command.commandId,
      (canonicalCommandAttempts.get(command.commandId) || 0) + 1,
    );
    const commandIsNewest =
      !priorRecord ||
      Date.parse(command.queuedAt) >= Date.parse(priorRecord.commandAt);
    const now = commandIsNewest ? command.queuedAt : priorRecord.commandAt;
    const editableFields =
      collection === "person" || collection === "org"
        ? [
            { key: "title", label: "Name", control: "text" },
            { key: "profile.primaryEmail", label: "Email", control: "email" },
            { key: "profile.phoneNumber", label: "Phone", control: "tel" },
            { key: "profile.livesIn", label: "Location", control: "text" },
            { key: "body", label: "Context", control: "textarea" },
          ]
        : collection === "resource"
          ? [
              { key: "title", label: "Title", control: "text" },
              { key: "url", label: "URL", control: "url" },
              { key: "body", label: "Context", control: "textarea" },
            ]
          : [
              { key: "title", label: "Title", control: "text" },
              { key: "body", label: "Note", control: "textarea" },
            ];
    const fields = commandIsNewest
      ? {
          ...(priorRecord?.fields || {}),
          sourceModule: module,
          sourceCollection: collection,
          id: recordId,
          className: collection,
          ...command.patch,
          updatedAt: now,
          __unigentamosCanonicalRecordV1: {
            format: "unigentamos-canonical-record-v1",
            canonicalId: command.canonicalId,
            module,
            collection,
            recordId,
            sourceUpdatedAt: now,
            route:
              collection === "note"
                ? `/admin/notes/${recordId}`
                : "/admin/personal",
            editableFields,
          },
        }
      : priorRecord.fields;
    if (commandIsNewest)
      canonicalRecords.set(command.canonicalId, { fields, commandAt: now });
    const result = {
      ok: true,
      canonicalId: command.canonicalId,
      objectKind:
        collection === "note"
          ? "note"
          : collection === "resource"
            ? "resource"
            : "contact",
      fields,
      mergedFields: [],
      keptNewerFields: [],
    };
    return jsonResponse(route, result);
  });
  await context.route("**/api/vault/bootstrap", async (route) => {
    if (
      await rejectUnauthorizedVaultRequest(context, route, requireAdminSession)
    )
      return;
    return jsonResponse(route, {
      ok: true,
      objects: [],
      generatedAt: new Date().toISOString(),
    });
  });
  await context.route("**/api/vault/media*", async (route) => {
    if (
      await rejectUnauthorizedVaultRequest(context, route, requireAdminSession)
    )
      return;
    const request = route.request();
    if (request.method() === "POST") {
      if (rejectMediaUploads) {
        return route.fulfill({
          status: 507,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            error: "Encrypted relay storage is temporarily full",
          }),
        });
      }
      const input = request.postDataJSON();
      const chunk = input.chunk;
      mediaChunks.set(
        `${chunk.vaultId}:${chunk.mediaId}:${chunk.chunkIndex}`,
        chunk,
      );
      return jsonResponse(route, { ok: true, alreadyStored: false });
    }
    const url = new URL(request.url());
    const key = `${url.searchParams.get("vaultId")}:${url.searchParams.get("mediaId")}:${url.searchParams.get("chunkIndex")}`;
    const chunk = mediaChunks.get(key);
    return chunk
      ? jsonResponse(route, { ok: true, chunk })
      : route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, error: "Not found" }),
        });
  });
}

try {
  companion = spawnCaptured(process.execPath, [companionEntrypoint], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      UNIGENTAMOS_VAULT_DIR: vaultRoot,
      UNIGENTAMOS_VAULT_BACKUP_DIR: backupRoot,
      UNIGENTAMOS_VAULT_PORT: String(companionPort),
      UNIGENTAMOS_SETUP_CODE: "123456",
      UNIGENTAMOS_ALLOWED_ORIGINS: baseUrl,
    },
  });
  application = spawnCaptured(
    process.execPath,
    [nextCli, "start", "--hostname", "127.0.0.1", "--port", String(webPort)],
    {
      cwd: dashboardRoot,
      env: {
        ...process.env,
        ADMIN_PASSWORD: "isolated-browser-test-password",
        ADMIN_SESSION_SECRET:
          "isolated-browser-test-session-secret-0123456789abcdef",
        FREMEN_DATA_DIR: dataRoot,
        FREMEN_REQUIRE_SUPABASE: "false",
        SUPABASE_URL: "",
        SUPABASE_SERVICE_ROLE_KEY: "",
        CENSUS_API_KEY: "",
        MORGEN_API_KEY: "",
        OPENROUTESERVICE_API_KEY: "",
        GITHUB_TOKEN: "",
        VERCEL: "",
      },
    },
  );
  await Promise.all([
    waitFor(`${companionBaseUrl}/health`),
    waitFor(`${baseUrl}/vault`),
  ]);
  await mkdir(artifactRoot, { recursive: true });

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
    recordVideo: { dir: path.join(artifactRoot, "media-recordings") },
  });
  await mockVaultRuntime(context);
  await context.unroute("**/api/vault/records");
  await context.unroute("**/api/vault/bootstrap");
  page = await context.newPage();
  const unexpectedFailures = [];
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (
      response.status() >= 500 &&
      pathname !== "/api/vault/sync" &&
      !(response.status() === 507 && pathname === "/api/vault/media")
    ) {
      unexpectedFailures.push(`${response.status()} ${pathname}`);
    }
  });

  await page.request.post(`${baseUrl}/api/admin/login`, {
    form: { password: "isolated-browser-test-password" },
  });
  await page.goto(`${baseUrl}/vault`, { waitUntil: "domcontentloaded" });
  const master = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Set up this Windows PC" }),
  });
  await master.getByText("Windows helper ready").waitFor();
  await master.getByLabel("Six-digit code").fill("123456");
  await master
    .getByLabel("Vault password")
    .fill("correct horse battery staple");
  await master.getByRole("button", { name: "Create my vault" }).click();
  await page.getByText("Your Windows vault is ready.").waitFor();
  const csrf = (await context.cookies()).find(
    (cookie) => cookie.name === "admin_csrf",
  ).value;
  const headers = { "x-csrf-token": csrf };
  async function seed(url, data) {
    const response = await page.request.post(`${baseUrl}${url}`, {
      headers,
      data,
    });
    assert.ok(response.ok(), await response.text());
    return response.json();
  }
  await seed("/api/personal/records", {
    domain: "notes-docs",
    className: "person",
    title: "Alexandra Morgan-Williams",
  });
  await seed("/api/planning", {
    operation: "save",
    collection: "places",
    input: {
      name: "Riverside studio",
      latitude: 39.1,
      longitude: -84.5,
      address: "Cincinnati",
      tags: [],
      linkedRefs: [],
      notes: "",
    },
  });
  await seed("/api/planning", {
    operation: "save",
    collection: "events",
    input: {
      title: "Studio review",
      description: "",
      start: "2026-10-02T09:00",
      end: "2026-10-02T10:00",
      timeZone: "America/New_York",
      allDay: false,
      calendarId: "native",
      location: "",
      linkedRefs: [],
      recurrence: "",
      exceptions: {},
      reminderMinutes: null,
      kind: "event",
    },
  });
  await seed("/api/personal/life", {
    collection: "trips",
    input: {
      name: "Riverside visit",
      place: "Cincinnati",
      region: "Ohio",
      status: "planned",
      travelMode: "walk",
      latitude: 39.1,
      longitude: -84.5,
      startDate: "2026-10-02",
      endDate: "2026-10-02",
      notes: "",
    },
  });
  await page.locator('a[href="/admin/media"]').first().click();
  await page.getByRole("heading", { name: "Media", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Add files", exact: true })
      .isEnabled(),
    true,
  );
  const file = path.join(tempRoot, "fixture-photo.png");
  // Intentionally synthetic architecture scenes with real dimensions and varied crops.
  const files = [];
  for (const [index, color] of [
    "#b99478",
    "#738c84",
    "#acb2b5",
    "#8d795f",
  ].entries()) {
    const filename = index
      ? path.join(tempRoot, `courtyard-${index}.png`)
      : file;
    const scene = `<svg xmlns="http://www.w3.org/2000/svg" width="${index === 1 ? 600 : 1000}" height="${index === 1 ? 900 : 700}"><rect width="100%" height="100%" fill="#dce5e7"/><path d="M0 460L1000 390V900H0Z" fill="#c8c2b5"/><path d="M120 180L750 110V520L120 610Z" fill="${color}"/><path d="M750 110L920 200V580L750 520Z" fill="#646f6e"/><path d="M210 265L630 217V435L210 495Z" fill="#264752"/><path d="M350 245V478M490 230V455" stroke="#d7cec0" stroke-width="14"/><rect x="45" y="548" width="128" height="45" fill="#6d7853"/><path d="M900 540V220" stroke="#6f614e" stroke-width="14"/><circle cx="900" cy="205" r="110" fill="#637f6c"/><text x="24" y="665" fill="#23383f" font-family="sans-serif" font-size="22">Synthetic QA fixture · ${index + 1}</text></svg>`;
    await writeFile(filename, await sharp(Buffer.from(scene)).png().toBuffer());
    files.push(filename);
  }
  assert.equal(
    await page
      .locator('input[type="file"]')
      .evaluate((n) => getComputedStyle(n).display),
    "none",
  );
  await page.locator('input[type="file"]').setInputFiles(files);
  await page.getByRole("button", { name: /courtyard-3.png/ }).waitFor();
  await page.getByRole("button", { name: /fixture-photo.png/ }).waitFor();
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent.trim() === "Add files",
      )?.disabled,
  );
  // A quota failure must keep encrypted bytes and a durable retryable queue.
  rejectMediaUploads = true;
  const queuedFile = path.join(tempRoot, "quota-retry-photo.png");
  await writeFile(queuedFile, await readFile(file));
  await page.locator('input[type="file"]').setInputFiles(queuedFile);
  const uploadQueue = page
    .locator("details")
    .filter({ hasText: "file upload pending" });
  await uploadQueue.locator("summary").click();
  await uploadQueue
    .getByRole("button", { name: "Pause upload", exact: true })
    .click();
  await uploadQueue
    .getByRole("button", { name: "Resume automatic upload", exact: true })
    .waitFor();
  await page.locator('a[href="/admin/calendar"]').first().click();
  await page.locator('a[href="/admin/media"]').first().click();
  await uploadQueue.locator("summary").click();
  await uploadQueue
    .getByRole("button", { name: "Resume automatic upload", exact: true })
    .waitFor();
  rejectMediaUploads = false;
  await uploadQueue
    .getByRole("button", { name: "Retry upload", exact: true })
    .click();
  await uploadQueue.waitFor({ state: "hidden" });
  console.log(
    "PASS Durable encrypted upload queue after quota failure, navigation, pause and retry",
  );
  await page.getByRole("button", { name: /fixture-photo.png/ }).click();
  await page.getByRole("dialog").locator("img").waitFor();
  await page
    .getByLabel("Image description", { exact: true })
    .fill("Isolated encrypted photo fixture");
  for (const label of [
    "Alexandra Morgan-Williams",
    "Riverside studio",
    "Studio review",
    "Riverside visit",
  ]) {
    await page.getByLabel("Link a record", { exact: true }).fill(label);
    await page
      .getByLabel("Matching records")
      .getByRole("button", { name: new RegExp(label) })
      .click();
  }
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await page
    .getByRole("button", { name: "Close details", exact: true })
    .click();
  await page.getByRole("button", { name: "Add files", exact: true }).waitFor();
  await page.waitForFunction(
    () => !document.querySelector('button[aria-busy="true"]'),
  );
  await page.screenshot({
    path: path.join(artifactRoot, "media-library-unlocked.png"),
  });
  const beforeSelect = await page
    .getByRole("button", { name: /fixture-photo.png/ })
    .boundingBox();
  await page.getByRole("button", { name: "Select files", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Select fixture-photo.png", exact: true })
    .check();
  const afterSelect = await page
    .getByRole("button", { name: /fixture-photo.png/ })
    .boundingBox();
  assert.equal(
    afterSelect.y,
    beforeSelect.y,
    "Selection does not move gallery",
  );
  await page
    .getByRole("button", { name: "Archive selected", exact: true })
    .click();
  await page
    .getByRole("button", { name: /fixture-photo.png/ })
    .waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Undo archive change", exact: true })
    .click();
  await page.getByRole("button", { name: /fixture-photo.png/ }).waitFor();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.locator('a[href="/vault"]').first().click();
  await page.getByRole("button", { name: "Check now" }).click();
  await page.getByText("Device status updated.").waitFor();
  const records = JSON.parse(
    await readFile(path.join(dataRoot, "personal-records.json"), "utf8"),
  );
  const record = records.find(
    (r) => r.className === "file" && r.title === "fixture-photo.png",
  );
  assert.ok(
    record?.mediaProfile?.manifest,
    "Photo reaches its canonical file owner",
  );
  assert.equal(record.mediaProfile.altText, "Isolated encrypted photo fixture");
  assert.equal(
    record.mediaProfile.linkedRefs.length,
    4,
    "Person, place, event and trip links persist through sync",
  );
  assert.ok(mediaChunks.size > 0, "Encrypted chunks reach isolated relay");
  const manifest = record.mediaProfile.manifest;
  assert.ok(
    [...mediaChunks.values()].some(
      (chunk) => chunk.mediaId === manifest.mediaId,
    ),
  );
  await page.locator('a[href="/admin/media"]').first().click();
  await page.getByRole("button", { name: /fixture-photo.png/ }).click();
  assert.equal(
    await page.getByLabel("Image description", { exact: true }).inputValue(),
    "Isolated encrypted photo fixture",
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download", exact: true }).click();
  const download = await downloadPromise;
  assert.deepEqual(
    await readFile(await download.path()),
    await readFile(file),
    "Reopened photo bytes match original",
  );
  await page.screenshot({
    path: path.join(artifactRoot, "media-photo-reopened.png"),
  });
  await page
    .getByRole("button", { name: "Close details", exact: true })
    .click();
  await page.locator('a[href="/admin/calendar"]').first().click();
  await page.getByRole("button", { name: "Add event", exact: true }).waitFor();
  // Prime the encrypted planning cache while the owner runtime is available.
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  await page
    .getByRole("dialog", { name: "New event" })
    .getByLabel("Title", { exact: true })
    .fill("Offline calendar persistence fixture");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await page
    .getByRole("dialog", { name: "New event" })
    .waitFor({ state: "hidden" });
  await page.getByText(/Saved on this device. Pending changes/).waitFor();
  await context.setOffline(false);
  await page.locator('a[href="/vault"]').first().click();
  await page.getByRole("button", { name: "Check now" }).click();
  await page.getByText("Device status updated.").waitFor();
  const planning = JSON.parse(
    await readFile(path.join(dataRoot, "planning-records.json"), "utf8"),
  );
  assert.equal(
    planning.events.filter(
      (event) => event.title === "Offline calendar persistence fixture",
    ).length,
    1,
    "Offline event synchronizes once to its canonical owner",
  );
  console.log(
    "PASS Calendar offline event validation, encrypted queue and canonical synchronization",
  );
  await context.close();
  console.log(
    "PASS Encrypted gallery upload, person/place/event/trip links, stable batch selection, archive/undo, canonical identity, sync, reopen and matching download; relay mocked, canonical API and crypto real.",
  );
} catch (error) {
  console.error("[media-browser]", error);
  console.error("[media-browser companion]", companion?.output());
  console.error("[media-browser app]", application?.output());
  if (page)
    await page
      .screenshot({ path: path.join(artifactRoot, "media-failure.png") })
      .catch(() => {});
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await stop(application?.child);
  await stop(companion?.child);
  await rm(tempRoot, { recursive: true, force: true });
}
