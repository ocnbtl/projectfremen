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
const baseUrl = `http://127.0.0.1:${webPort}`;
const artifactRoot = path.join(dashboardRoot, "output", "playwright");
let companion;
let application;
let browser;

try {
  try {
    const existing = await fetch("http://127.0.0.1:43127/health", { signal: AbortSignal.timeout(300) });
    if (existing.ok) throw new Error("Port 43127 is already in use; stop the running Vault Companion before this isolated test");
  } catch (error) {
    if (error instanceof Error && error.message.includes("already in use")) throw error;
  }

  companion = spawnCaptured(process.execPath, [companionEntrypoint], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      UNIGENTAMOS_VAULT_DIR: vaultRoot,
      UNIGENTAMOS_VAULT_BACKUP_DIR: backupRoot,
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
    waitFor("http://127.0.0.1:43127/health"),
    waitFor(`${baseUrl}/vault`)
  ]);
  await mkdir(artifactRoot, { recursive: true });

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const unexpectedFailures = [];
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (response.status() >= 500 && pathname !== "/api/vault/sync") unexpectedFailures.push(`${response.status()} ${pathname}`);
  });

  await page.goto(`${baseUrl}/vault`, { waitUntil: "domcontentloaded" });
  const master = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Create your desktop vault" }) });
  await master.getByText("Companion found").waitFor();
  await master.getByLabel("Six-digit pairing code").fill("123456");
  await master.getByLabel("Vault password").fill("correct horse battery staple");
  await page.screenshot({ path: path.join(artifactRoot, "vault-onboarding-desktop.png"), fullPage: true });
  await master.getByRole("button", { name: "Create and unlock my vault" }).click();
  await page.getByText("Desktop master vault created and unlocked.").waitFor();

  await page.getByLabel("Title").fill("Offline continuity note");
  await page.getByRole("textbox", { name: "Note", exact: true }).fill("first encrypted version");
  await page.getByRole("button", { name: "Save encrypted version" }).last().click();
  await page.getByText("Note saved locally and queued for encrypted sync.").waitFor();
  await page.getByRole("textbox", { name: "Note", exact: true }).fill("second encrypted version");
  await page.getByRole("button", { name: "Save encrypted version" }).last().click();
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="Version history"] > div').length === 2);
  assert.equal(await page.getByLabel("Version history").locator(":scope > div").count(), 2);

  await page.getByRole("button", { name: "Create desktop backup" }).click();
  await page.getByText(/Created backup .* configured encrypted backup directory/).waitFor();
  assert.equal((await readdir(backupRoot)).length, 1);

  const recoveryDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export recovery package" }).click();
  const recoveryDownload = await recoveryDownloadPromise;
  const recoveryPath = await recoveryDownload.path();
  assert.ok(recoveryPath);

  const appleContext = await browser.newContext({ ...devices["iPhone 15"], acceptDownloads: true });
  const applePage = await appleContext.newPage();
  await applePage.goto(`${baseUrl}/vault`, { waitUntil: "domcontentloaded" });
  await applePage.getByRole("heading", { name: "Connect this Apple device" }).waitFor();
  await applePage.locator('input[type="file"]').setInputFiles(recoveryPath);
  await applePage.getByText("Encrypted recovery file ready.", { exact: false }).waitFor();
  await applePage.getByLabel("Vault password").fill("correct horse battery staple");
  await applePage.screenshot({ path: path.join(artifactRoot, "vault-onboarding-iphone.png"), fullPage: true });
  await applePage.getByRole("button", { name: "Connect this device" }).click();
  await applePage.getByText("This device joined the encrypted vault.").waitFor();
  assert.equal(await applePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
  await appleContext.close();

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Unlock this device" }).waitFor();
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Unlock this device" }).waitFor();
  await page.getByLabel("Vault password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Unlock vault" }).click();
  await page.getByText("Offline continuity note", { exact: true }).waitFor();
  await page.getByText(/Offline.*local saves safe/i).first().waitFor();

  await page.getByText("Offline continuity note", { exact: true }).click();
  await page.getByRole("textbox", { name: "Note", exact: true }).fill("third encrypted version saved offline");
  await page.getByRole("button", { name: "Save encrypted version" }).last().click();
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="Version history"] > div').length === 3);
  assert.equal(await page.getByLabel("Version history").locator(":scope > div").count(), 3);
  assert.deepEqual(unexpectedFailures, []);

  await context.setOffline(false);
  await context.close();
  console.log("[pass] guided desktop setup, Apple recovery-file join, encrypted history, backup, service-worker offline reload, and offline save passed");
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
