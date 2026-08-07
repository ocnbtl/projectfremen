import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, devices } from "@playwright/test";

const dashboardRoot = process.cwd();
const repositoryRoot = path.resolve(dashboardRoot, "..");
const nextCli = path.join(dashboardRoot, "node_modules", "next", "dist", "bin", "next");
const companionEntrypoint = path.join(repositoryRoot, "vault-companion", "src", "server.mjs");

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
  const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
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

const tempRoot = await mkdtemp(path.join(tmpdir(), "unigentamos-vault-browser-"));
const vaultRoot = path.join(tempRoot, "vault");
const backupRoot = path.join(tempRoot, "backups");
const dataRoot = path.join(tempRoot, "data");
const webPort = await freePort();
const companionPort = await freePort();
const baseUrl = `http://127.0.0.1:${webPort}`;
const companionBaseUrl = `http://127.0.0.1:${companionPort}`;
const artifactRoot = path.join(dashboardRoot, "output", "playwright");
const relayEnvelopes = [];
const deviceStatuses = new Map();
let companion;
let application;
let browser;

function jsonResponse(route, body) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { Date: new Date().toUTCString(), "Cache-Control": "no-store" },
    body: JSON.stringify(body)
  });
}

function deviceStatusPayload() {
  return {
    ok: true,
    relayHeadSequence: relayEnvelopes.at(-1)?.sequence || 0,
    devices: [...deviceStatuses.values()].sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt)),
    serverTime: new Date().toISOString()
  };
}

async function mockVaultRuntime(context) {
  await context.route("http://127.0.0.1:43127/**", async (route) => {
    const url = new URL(route.request().url());
    await route.continue({ url: `${companionBaseUrl}${url.pathname}${url.search}` });
  });
  await context.route("**/api/vault/sync*", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const input = request.postDataJSON();
      const acceptedChangeIds = [];
      for (const envelope of input.envelopes || []) {
        acceptedChangeIds.push(envelope.changeId);
        if (relayEnvelopes.some((item) => item.vaultId === envelope.vaultId && item.changeId === envelope.changeId)) continue;
        relayEnvelopes.push({ ...envelope, sequence: relayEnvelopes.length + 1, receivedAt: new Date().toISOString() });
      }
      return jsonResponse(route, { ok: true, acceptedChangeIds, serverTime: new Date().toISOString() });
    }
    const url = new URL(request.url());
    const since = Number(url.searchParams.get("since") || 0);
    const vaultId = url.searchParams.get("vaultId");
    return jsonResponse(route, {
      ok: true,
      envelopes: relayEnvelopes.filter((item) => item.vaultId === vaultId && item.sequence > since),
      serverTime: new Date().toISOString()
    });
  });
  await context.route("**/api/vault/devices*", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const input = request.postDataJSON();
      const now = new Date().toISOString();
      const head = relayEnvelopes.at(-1)?.sequence || 0;
      const key = `${input.vaultId}:${input.deviceId}`;
      const existing = deviceStatuses.get(key);
      const acknowledgedSequence = Math.max(existing?.acknowledgedSequence || 0, Math.min(input.acknowledgedSequence, head));
      const current = input.pendingChanges === 0 && input.blockedChanges === 0 && acknowledgedSequence >= head;
      deviceStatuses.set(key, {
        deviceId: input.deviceId,
        descriptor: input.descriptor,
        acknowledgedSequence,
        pendingChanges: input.pendingChanges,
        blockedChanges: input.blockedChanges,
        lastSeenAt: now,
        lastSyncedAt: current ? now : existing?.lastSyncedAt || null
      });
    }
    return jsonResponse(route, deviceStatusPayload());
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
      UNIGENTAMOS_ALLOWED_ORIGINS: baseUrl
    }
  });
  application = spawnCaptured(process.execPath, [nextCli, "start", "--hostname", "127.0.0.1", "--port", String(webPort)], {
    cwd: dashboardRoot,
    env: {
      ...process.env,
      ADMIN_PASSWORD: "isolated-browser-test-password",
      ADMIN_SESSION_SECRET: "isolated-browser-test-session-secret-0123456789abcdef",
      FREMEN_DATA_DIR: dataRoot,
      FREMEN_REQUIRE_SUPABASE: "false",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      VERCEL: ""
    }
  });
  await Promise.all([
    waitFor(`${companionBaseUrl}/health`),
    waitFor(`${baseUrl}/vault`)
  ]);
  await mkdir(artifactRoot, { recursive: true });

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await mockVaultRuntime(context);
  const page = await context.newPage();
  const unexpectedFailures = [];
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (response.status() >= 500 && pathname !== "/api/vault/sync") unexpectedFailures.push(`${response.status()} ${pathname}`);
  });

  const updatePage = await context.newPage();
  await updatePage.goto(`${baseUrl}/vault`, { waitUntil: "domcontentloaded" });
  await updatePage.waitForFunction(() => {
    window.dispatchEvent(new Event("unigentamos:update-ready"));
    return document.body.textContent?.includes("A newer version is ready.");
  });
  await updatePage.getByRole("button", { name: "Update now" }).waitFor();
  await updatePage.screenshot({ path: path.join(artifactRoot, "vault-update-ready-desktop.png"), fullPage: true });
  await updatePage.close();

  await page.goto(`${baseUrl}/vault`, { waitUntil: "domcontentloaded" });
  const master = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Set up this Windows PC" }) });
  await master.getByText("Windows helper ready").waitFor();
  await master.getByLabel("Six-digit code").fill("123456");
  await master.getByLabel("Vault password").fill("correct horse battery staple");
  await page.screenshot({ path: path.join(artifactRoot, "vault-onboarding-desktop.png"), fullPage: true });
  await master.getByRole("button", { name: "Create my vault" }).click();
  await page.getByText("Your Windows vault is ready.").waitFor();
  await page.getByRole("heading", { name: "Your devices" }).waitFor();

  await page.getByLabel("Title").fill("Offline continuity note");
  await page.getByRole("textbox", { name: "Note", exact: true }).fill("first encrypted version");
  await page.getByRole("button", { name: "Save version" }).last().click();
  await page.getByText("Note saved. It will sync automatically.").waitFor();
  await page.getByRole("textbox", { name: "Note", exact: true }).fill("second encrypted version");
  await page.getByRole("button", { name: "Save version" }).last().click();
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="Version history"] > div').length === 2);
  assert.equal(await page.getByLabel("Version history").locator(":scope > div").count(), 2);

  await page.getByRole("button", { name: "Back up this PC" }).click();
  await page.getByText("Backup created on this PC.").waitFor();
  assert.equal((await readdir(backupRoot)).length, 1);

  const recoveryDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download recovery file" }).click();
  const recoveryDownload = await recoveryDownloadPromise;
  const recoveryPath = await recoveryDownload.path();
  assert.ok(recoveryPath);

  const appleContext = await browser.newContext({ ...devices["iPhone 15"], acceptDownloads: true });
  await mockVaultRuntime(appleContext);
  const applePage = await appleContext.newPage();
  await applePage.goto(`${baseUrl}/vault`, { waitUntil: "domcontentloaded" });
  await applePage.getByRole("heading", { name: "Connect this Apple device" }).waitFor();
  await applePage.locator('input[type="file"]').setInputFiles(recoveryPath);
  await applePage.getByText("Recovery file ready.", { exact: false }).waitFor();
  await applePage.getByLabel("Vault password").fill("correct horse battery staple");
  await applePage.screenshot({ path: path.join(artifactRoot, "vault-onboarding-iphone.png"), fullPage: true });
  await applePage.getByRole("button", { name: "Connect this device" }).click();
  await applePage.getByText("This device is connected.").waitFor();
  await applePage.getByText("Offline continuity note", { exact: true }).waitFor();
  await applePage.getByRole("heading", { name: "Everything is up to date" }).waitFor();
  await applePage.screenshot({ path: path.join(artifactRoot, "vault-devices-iphone.png"), fullPage: true });
  assert.equal(await applePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);

  await page.getByRole("button", { name: "Check now" }).click();
  await page.getByText("Device status updated.").waitFor();
  await page.getByRole("heading", { name: "Everything is up to date" }).waitFor();
  assert.equal(await page.getByRole("list", { name: "Connected vault devices" }).getByRole("listitem").count(), 2);
  await page.screenshot({ path: path.join(artifactRoot, "vault-devices-desktop.png"), fullPage: true });
  await appleContext.close();

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Unlock your vault" }).waitFor();
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.screenshot({ path: path.join(artifactRoot, "vault-offline-reload.png"), fullPage: true });
  const offlineBody = await page.locator("body").innerText();
  if (!offlineBody.includes("Unlock your vault")) throw new Error(`Offline vault shell did not reach unlock state: ${offlineBody.slice(0, 600)}`);
  await page.getByRole("heading", { name: "Unlock your vault" }).waitFor();
  await page.getByLabel("Vault password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Unlock vault" }).click();
  await page.getByText("Offline continuity note", { exact: true }).waitFor();
  await page.getByText(/Offline.*your work is safe/i).first().waitFor();

  await page.getByText("Offline continuity note", { exact: true }).click();
  await page.getByRole("textbox", { name: "Note", exact: true }).fill("third encrypted version saved offline");
  await page.getByRole("button", { name: "Save version" }).last().click();
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="Version history"] > div').length === 3);
  assert.equal(await page.getByLabel("Version history").locator(":scope > div").count(), 3);
  assert.deepEqual(unexpectedFailures, []);

  await context.setOffline(false);
  await context.close();
  console.log("[pass] guided setup, visible device status, natural copy, app-update notice, cross-device sync, backup, offline reload, and offline save passed");
} catch (error) {
  console.error("[vault-browser] application output:\n", application?.output() || "");
  console.error("[vault-browser] companion output:\n", companion?.output() || "");
  throw error;
} finally {
  await browser?.close().catch(() => undefined);
  await stop(application?.child);
  await stop(companion?.child);
  await rm(tempRoot, { recursive: true, force: true });
}
