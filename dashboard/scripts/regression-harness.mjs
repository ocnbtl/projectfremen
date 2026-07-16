import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

function assertSelectedTab(body, tabId, message) {
  const marker = `id="${tabId}"`;
  const markerIndex = body.indexOf(marker);
  assert(markerIndex >= 0, `${message}: tab was not rendered`);
  const tagStart = body.lastIndexOf("<button", markerIndex);
  const tagEnd = body.indexOf(">", markerIndex);
  const openingTag = tagStart >= 0 && tagEnd >= markerIndex
    ? body.slice(tagStart, tagEnd + 1)
    : "";
  assert(openingTag.includes('aria-selected="true"'), `${message}: tab was not selected`);
}

function countRenderedToken(body, token) {
  const renderedMarkup = body.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  return renderedMarkup.split(token).length - 1;
}

function describeStatus(response) {
  return `${response.status} ${response.statusText}`.trim();
}

function isAdminLoginRedirect(response, body) {
  const location = response.headers.get("location") || "";
  if (response.status >= 300 && response.status < 400 && location.includes("/admin/login")) {
    return true;
  }

  // Next can discover a server-component redirect after streaming has started.
  // In that case it preserves the 200 transport status and emits a redirect marker.
  return (
    response.status === 200 &&
    body.includes("/admin/login") &&
    (body.includes("NEXT_REDIRECT") || body.includes("http-equiv=\"refresh\"") || body.includes("http-equiv=\"Refresh\""))
  );
}

function isAppRouterNotFound(response, body) {
  if (response.status === 404) return true;
  return (
    response.status === 200 &&
    (
      body.includes("NEXT_HTTP_ERROR_FALLBACK;404") ||
      body.includes("404: This page could not be found") ||
      body.includes('data-next-error-code="E404"')
    )
  );
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

async function checkFinanceBrowserState(baseUrl, cookieJar) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  const browserErrors = [];
  const failedResponses = [];
  const mutatingRequests = [];

  function observe(page) {
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) {
        browserErrors.push(message.text());
      }
    });
    page.on("requestfailed", (request) => {
      const url = new URL(request.url());
      const failure = request.failure()?.errorText || "";
      if (!url.pathname.startsWith("/_vercel/") && !failure.toLowerCase().includes("aborted")) {
        failedResponses.push(`requestfailed ${request.method()} ${request.url()}`);
      }
    });
    page.on("response", (response) => {
      const url = new URL(response.url());
      // Vercel Analytics is intentionally unavailable on the isolated local
      // production server; every application-owned failed response still fails.
      if (response.status() >= 400 && url.pathname !== "/_vercel/insights/script.js") {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        url.origin === new URL(baseUrl).origin
        && !["GET", "HEAD", "OPTIONS"].includes(request.method())
        && !url.pathname.startsWith("/_vercel/")
      ) {
        mutatingRequests.push(`${request.method()} ${url.pathname}`);
      }
    });
  }

  async function transactionIds(page) {
    return page.locator("[data-finance-transaction-id]").evaluateAll((rows) => (
      rows.map((row) => row.getAttribute("data-finance-transaction-id"))
    ));
  }

  async function metricValue(page, ariaLabel, metricLabel) {
    const metric = page.locator(`dl[aria-label="${ariaLabel}"] > div`).filter({
      has: page.locator("dt", { hasText: metricLabel })
    });
    assert(await metric.count() === 1, `Finance metric ${metricLabel} was not uniquely rendered`);
    return (await metric.locator("dd > strong").innerText()).trim();
  }

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies([
      {
        name: "admin_session",
        value: cookieJar.get("admin_session"),
        url: baseUrl,
        httpOnly: true,
        sameSite: "Lax"
      },
      {
        name: "admin_csrf",
        value: cookieJar.get("admin_csrf"),
        url: baseUrl,
        sameSite: "Lax"
      }
    ]);

    const page = await context.newPage();
    observe(page);

    await page.goto(
      `${baseUrl}/admin/finance/transactions?view=review&query=AWS&sort=amount-desc&selected=TX-7738&probe=keep`,
      { waitUntil: "domcontentloaded" }
    );
    await page.getByRole("heading", { level: 1, name: "Transactions" }).waitFor();
    await page.waitForFunction(() => {
      const params = new URL(window.location.href).searchParams;
      return !params.has("view") && params.get("selected") === "TX-7738";
    });

    const canonicalUrl = new URL(page.url());
    assert(canonicalUrl.pathname === "/admin/finance/transactions", "Finance browser check left the canonical Transactions route");
    assert(!canonicalUrl.searchParams.has("view"), "Finance browser check did not remove the conflicting legacy view query");
    assert(canonicalUrl.searchParams.get("query") === "AWS", "Finance browser check dropped query state");
    assert(canonicalUrl.searchParams.get("sort") === "amount-desc", "Finance browser check dropped sort state");
    assert(canonicalUrl.searchParams.get("selected") === "TX-7738", "Finance browser check did not deep-link the visible transaction selection");
    assert(canonicalUrl.searchParams.get("probe") === "keep", "Finance browser check dropped an unknown safe query parameter");
    assert(
      JSON.stringify(await transactionIds(page)) === JSON.stringify(["TX-7738"]),
      "Finance transaction search did not constrain the ledger to the AWS fixture row"
    );

    const transactionSearch = page.getByRole("textbox", { name: "Search transactions" });
    await transactionSearch.fill("");
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.has("query"));
    await page.waitForFunction(() => document.querySelectorAll("[data-finance-transaction-id]").length === 10);
    assert(
      (await transactionIds(page))[0] === "TX-7740",
      "Finance amount-desc sort did not put the highest signed amount first"
    );

    await page.getByRole("combobox", { name: "Sort transactions" }).selectOption("merchant-asc");
    await page.waitForFunction(() => new URL(window.location.href).searchParams.get("sort") === "merchant-asc");
    assert(
      JSON.stringify((await transactionIds(page)).slice(0, 3)) === JSON.stringify(["TX-7741", "TX-7738", "TX-7739"]),
      "Finance merchant sort did not produce deterministic fixture order"
    );

    await page.getByRole("button", { name: "Unreviewed", exact: true }).click();
    await page.waitForFunction(() => {
      const params = new URL(window.location.href).searchParams;
      return params.get("filter") === "unreviewed" && !params.has("selected");
    });
    assert(
      JSON.stringify(await transactionIds(page)) === JSON.stringify(["TX-7741"]),
      "Finance Unreviewed filter did not resolve to the one literal pending transaction"
    );
    assert(
      await page.locator("#finance-inspector").count() === 0,
      "Finance filter silently retargeted the inspector after hiding the selected transaction"
    );

    await page.getByRole("button", { name: "All", exact: true }).click();
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.has("filter"));
    await page.locator('[data-finance-transaction-id="TX-7738"] button[aria-controls="finance-inspector"]').click();
    await page.waitForFunction(() => new URL(window.location.href).searchParams.get("selected") === "TX-7738");
    const selectedBeforeCheckbox = new URL(page.url()).searchParams.get("selected");
    await page.locator('[data-finance-transaction-id="TX-7741"] input[type="checkbox"]').check();
    assert(
      new URL(page.url()).searchParams.get("selected") === selectedBeforeCheckbox,
      "Finance transaction checkbox selection changed inspector selection"
    );
    await page.getByText("1 selected", { exact: false }).first().waitFor();

    await page.getByRole("tab", { name: "Properties" }).click();
    await page.waitForFunction(() => new URL(window.location.href).searchParams.get("tab") === "properties");
    await page.getByRole("tabpanel").getByText("TX-7738", { exact: true }).waitFor();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { level: 2, name: "AWS" }).waitFor();
    assert(
      new URL(page.url()).searchParams.get("selected") === "TX-7738"
        && new URL(page.url()).searchParams.get("tab") === "properties",
      "Finance transaction refresh did not restore selected row and inspector tab"
    );

    await page.goBack();
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.has("selected"));
    await page.goForward();
    await page.waitForFunction(() => {
      const params = new URL(window.location.href).searchParams;
      return params.get("selected") === "TX-7738" && params.get("tab") === "properties";
    });
    assert(
      new URL(page.url()).searchParams.get("sort") === "merchant-asc",
      "Finance transaction history dropped the active sort"
    );

    await page.goto(
      `${baseUrl}/admin/finance/accounts?view=transactions&selected=operating&tab=transactions&probe=keep`,
      { waitUntil: "domcontentloaded" }
    );
    await page.getByRole("heading", { level: 1, name: "Accounts & Cashflow" }).waitFor();
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.has("view"));
    const accountUrl = new URL(page.url());
    assert(accountUrl.pathname === "/admin/finance/accounts", "Finance Accounts check left the canonical route");
    assert(accountUrl.searchParams.get("selected") === "operating", "Finance Accounts check dropped selected account state");
    assert(accountUrl.searchParams.get("tab") === "transactions", "Finance Accounts check dropped active inspector tab state");
    assert(accountUrl.searchParams.get("probe") === "keep", "Finance Accounts check dropped an unknown safe query parameter");
    assert(
      await page.locator('[data-finance-account-id="operating"][aria-pressed="true"]').count() === 1,
      "Finance Accounts check did not restore Operating row selection"
    );
    const accountActivityPanel = page.getByRole("tabpanel");
    for (const expectedMerchant of ["Stripe Payout", "Whole Foods", "Uber", "Notion"]) {
      assert(
        await accountActivityPanel.getByText(expectedMerchant, { exact: true }).count() === 1,
        `Finance Operating activity omitted its fixture-scoped ${expectedMerchant} transaction`
      );
    }
    assert(
      await accountActivityPanel.getByText("AWS", { exact: true }).count() === 0,
      "Finance Operating activity leaked a transaction from Unigentamos LLC"
    );

    await page.goto(`${baseUrl}/admin/finance/bills?selected=aws`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { level: 1, name: "Bills & Subscriptions" }).waitFor();
    assert(
      await metricValue(page, "Bill scope metrics", "Due this week") === "4",
      "Finance Bills due-this-week metric included overdue or paid fixture rows"
    );
    assert(
      await page.locator('[data-finance-bill-id="aws"][aria-pressed="true"]').count() === 1,
      "Finance Bills did not restore the AWS selection"
    );
    const billInspector = page.locator("#finance-inspector");
    for (const expected of ["Unigentamos LLC", "No payment execution", "Persistent Finance mutations are not connected"]) {
      assert(
        (await page.locator("body").innerText()).includes(expected),
        `Finance Bills omitted its account or persistence boundary: ${expected}`
      );
    }
    assert(
      await billInspector.getByRole("button", { name: "Record payment", exact: true }).getAttribute("aria-disabled") === "true",
      "Finance Bills exposed an enabled payment mutation"
    );

    await page.goto(`${baseUrl}/admin/finance/budgets?selected=travel`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { level: 1, name: "Budgets" }).waitFor();
    assert(
      await metricValue(page, "Budget scope metrics", "Forecast") === "Unavailable",
      "Finance Budgets presented a forecast despite the unresolved formula and source"
    );
    assert(
      await page.locator('[data-finance-budget-id="travel"][aria-pressed="true"]').count() === 1,
      "Finance Budgets did not restore the Travel selection"
    );
    assert(
      (await page.locator("body").innerText()).includes("No approved formula or durable forecast source"),
      "Finance Budgets omitted the explicit forecast boundary"
    );

    await page.goto(`${baseUrl}/admin/finance/monthly-review?selected=budget-overruns`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { level: 1, name: "Monthly Review" }).waitFor();
    assert(await metricValue(page, "Monthly close literal metrics", "Complete") === "2", "Finance Monthly Review did not show two literal completed checks");
    assert(await metricValue(page, "Monthly close literal metrics", "Open") === "4", "Finance Monthly Review did not show four literal open checks");
    assert(
      await metricValue(page, "Monthly close literal metrics", "Actual snapshot movement") === "+$3,900.00",
      "Finance Monthly Review changed the literal actual savings movement"
    );
    assert(
      await metricValue(page, "Monthly close literal metrics", "Readiness score") === "Not calculated",
      "Finance Monthly Review invented a weighted readiness result"
    );
    const monthlyReviewText = await page.locator("body").innerText();
    for (const expected of ["2 complete · 4 open", "Move $5k surplus -> Reserve", "proposal only · not recorded as movement"]) {
      assert(monthlyReviewText.includes(expected), `Finance Monthly Review omitted literal close evidence: ${expected}`);
    }
    assert(monthlyReviewText.includes("+$3,900.00"), "Finance Monthly Review omitted actual snapshot savings movement");
    assert(!monthlyReviewText.includes("72%"), "Finance Monthly Review rendered an undocumented weighted readiness percentage");
    const completeClose = page.getByRole("button", { name: "Complete Close", exact: true }).first();
    assert(await completeClose.getAttribute("aria-disabled") === "true", "Finance Monthly Review exposed an enabled close mutation");
    await completeClose.focus();
    assert(await completeClose.evaluate((button) => document.activeElement === button), "Finance Monthly Review unavailable close control is not focusable");
    await completeClose.click({ force: true });

    const disabledControls = page.locator('button[aria-disabled="true"]:visible');
    for (let index = 0; index < await disabledControls.count(); index += 1) {
      await disabledControls.nth(index).click({ force: true }).catch(() => {});
    }

    const visualOutputDir = path.join(dashboardDir, "output", "playwright", "finance-checkpoint-11");
    await mkdir(visualOutputDir, { recursive: true });
    const visualCases = [
      { name: "1920-transactions-properties", viewport: { width: 1920, height: 1080 }, route: "/admin/finance/transactions?selected=TX-7738&tab=properties" },
      { name: "1440-accounts-activity", viewport: { width: 1440, height: 900 }, route: "/admin/finance/accounts?selected=operating&tab=transactions" },
      { name: "1024-bills-detail", viewport: { width: 1024, height: 768 }, route: "/admin/finance/bills?selected=aws" },
      { name: "1024-budgets-list", viewport: { width: 1024, height: 768 }, route: "/admin/finance/budgets" },
      { name: "390-transactions-list", viewport: { width: 390, height: 844 }, route: "/admin/finance/transactions" },
      { name: "390-accounts-list", viewport: { width: 390, height: 844 }, route: "/admin/finance/accounts" },
      { name: "390-bills-list", viewport: { width: 390, height: 844 }, route: "/admin/finance/bills" },
      { name: "390-budgets-list", viewport: { width: 390, height: 844 }, route: "/admin/finance/budgets" },
      { name: "390-review-list", viewport: { width: 390, height: 844 }, route: "/admin/finance/monthly-review" },
      { name: "390-review-detail", viewport: { width: 390, height: 844 }, route: "/admin/finance/monthly-review?selected=budget-overruns" }
    ];
    const visualDiagnostics = [];

    for (const visualCase of visualCases) {
      const visualContext = await browser.newContext({ viewport: visualCase.viewport, reducedMotion: "reduce", colorScheme: "light" });
      await visualContext.addCookies([
        { name: "admin_session", value: cookieJar.get("admin_session"), url: baseUrl, httpOnly: true, sameSite: "Lax" },
        { name: "admin_csrf", value: cookieJar.get("admin_csrf"), url: baseUrl, sameSite: "Lax" }
      ]);
      const visualPage = await visualContext.newPage();
      observe(visualPage);
      await visualPage.goto(`${baseUrl}${visualCase.route}`, { waitUntil: "networkidle" });
      await visualPage.locator(".finance-main-workspace .finance-workspace-header h1").waitFor();
      await visualPage.evaluate(async () => { await document.fonts.ready; });
      await visualPage.waitForTimeout(150);
      await visualPage.screenshot({
        path: path.join(visualOutputDir, `${visualCase.name}.png`),
        fullPage: false
      });
      const diagnostics = await visualPage.evaluate(() => {
        const visible = (element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const intersect = (left, right) => !(
          left.right <= right.left || left.left >= right.right || left.bottom <= right.top || left.top >= right.bottom
        );
        const launcher = document.querySelector(".shared-ai-dock__launcher");
        const protectedActions = Array.from(document.querySelectorAll(
          ".inspector-rail__footer, .quick-action-bar.is-sticky, .finance-inspector-toggle"
        )).filter(visible);
        const launcherRect = launcher && visible(launcher) ? launcher.getBoundingClientRect() : null;
        const aiOverlapsActions = Boolean(launcherRect && protectedActions.some((element) => intersect(launcherRect, element.getBoundingClientRect())));
        const undersizedTargets = window.innerWidth <= 390
          ? Array.from(document.querySelectorAll("button, a[href], input, select, textarea, [role='tab']"))
              .filter(visible)
              .map((element) => element instanceof HTMLInputElement && element.type === "checkbox" && element.closest("label")
                ? element.closest("label")
                : element)
              .filter((element, index, all) => all.indexOf(element) === index)
              .map((element) => {
                const rect = element.getBoundingClientRect();
                return { label: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 60) || element.tagName, width: rect.width, height: rect.height };
              })
              .filter((target) => target.width < 44 || target.height < 44)
          : [];
        return {
          pathname: window.location.pathname,
          overflowX: document.documentElement.scrollWidth > window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          aiOverlapsActions,
          undersizedTargets
        };
      });
      visualDiagnostics.push({ name: visualCase.name, viewport: visualCase.viewport, ...diagnostics });
      assert(!diagnostics.overflowX, `Finance visual case ${visualCase.name} has document-level horizontal overflow`);
      assert(!diagnostics.aiOverlapsActions, `Finance visual case ${visualCase.name} lets the AI launcher overlap protected actions`);
      assert(
        diagnostics.undersizedTargets.length === 0,
        `Finance visual case ${visualCase.name} has mobile targets below 44px: ${JSON.stringify(diagnostics.undersizedTargets)}`
      );
      await visualContext.close();
    }
    await writeFile(
      path.join(visualOutputDir, "diagnostics.json"),
      `${JSON.stringify(visualDiagnostics, null, 2)}\n`,
      "utf8"
    );

    assert(mutatingRequests.length === 0, `Finance read-only interactions emitted mutations: ${mutatingRequests.join(" | ")}`);
    assert(browserErrors.length === 0, `Finance browser state check emitted errors: ${browserErrors.join(" | ")}`);
    assert(failedResponses.length === 0, `Finance browser state check received failed responses: ${failedResponses.join(" | ")}`);
  } finally {
    await browser.close();
  }
}

async function checkMediaDuplicatesBrowserState(baseUrl, cookieJar, duplicateToken) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  const browserErrors = [];
  const failedResponses = [];
  const mutatingRequests = [];

  async function authenticatedContext(viewport) {
    const context = await browser.newContext({ viewport });
    await context.addCookies([
      {
        name: "admin_session",
        value: cookieJar.get("admin_session"),
        url: baseUrl,
        httpOnly: true,
        sameSite: "Lax"
      },
      {
        name: "admin_csrf",
        value: cookieJar.get("admin_csrf"),
        url: baseUrl,
        sameSite: "Lax"
      }
    ]);
    return context;
  }

  function observe(page) {
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) {
        browserErrors.push(message.text());
      }
    });
    page.on("requestfailed", (request) => {
      const url = new URL(request.url());
      const failure = request.failure()?.errorText || "";
      if (!url.pathname.startsWith("/_vercel/") && !failure.toLowerCase().includes("aborted")) {
        failedResponses.push(`requestfailed ${request.method()} ${request.url()}`);
      }
    });
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (response.status() >= 400 && url.pathname !== "/_vercel/insights/script.js") {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        url.origin === new URL(baseUrl).origin &&
        !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
        !url.pathname.startsWith("/_vercel/")
      ) {
        mutatingRequests.push(`${request.method()} ${url.pathname}`);
      }
    });
  }

  try {
    const desktopContext = await authenticatedContext({ width: 1440, height: 900 });
    const page = await desktopContext.newPage();
    observe(page);
    await page.goto(
      `${baseUrl}/admin/media/duplicates?view=rights-usage&query=${encodeURIComponent(duplicateToken)}&selected=missing&tab=usage&issue=usage-unavailable&sort=title&probe=keep`,
      { waitUntil: "domcontentloaded" }
    );
    await page.getByRole("heading", { level: 1, name: "Duplicates" }).waitFor();
    await page.waitForFunction(() => {
      const params = new URL(window.location.href).searchParams;
      return !params.has("view") && !params.has("issue") && !params.has("selected") && !params.has("tab");
    });

    const canonicalUrl = new URL(page.url());
    assert(canonicalUrl.pathname === "/admin/media/duplicates", "Media Duplicates browser check left the canonical route");
    assert(canonicalUrl.searchParams.get("query") === duplicateToken, "Media Duplicates canonicalization dropped query state");
    assert(canonicalUrl.searchParams.get("sort") === "title", "Media Duplicates canonicalization dropped sort state");
    assert(canonicalUrl.searchParams.get("probe") === "keep", "Media Duplicates canonicalization dropped an unknown safe query parameter");

    const rows = page.locator("[data-media-duplicate-group] .dense-object-row__body");
    assert(await rows.count() === 2, "Media Duplicates browser check did not render two exact-source groups");
    await rows.nth(1).click();
    await page.waitForFunction(() => new URL(window.location.href).searchParams.has("selected"));
    const selectedAfterRow = new URL(page.url()).searchParams.get("selected");
    assert(selectedAfterRow, "Media Duplicates row selection did not become deep-linkable");
    await page.getByRole("complementary", { name: /duplicate evidence inspector/i }).waitFor();

    const firstCheckbox = page.locator("[data-media-duplicate-group] input[type=checkbox]").first();
    await firstCheckbox.check();
    assert(
      new URL(page.url()).searchParams.get("selected") === selectedAfterRow,
      "Media Duplicates checkbox selection changed inspector selection"
    );
    await page.getByText("1 selected", { exact: false }).first().waitFor();

    await page.getByRole("tab", { name: "Rights" }).click();
    await page.waitForFunction(() => new URL(window.location.href).searchParams.get("tab") === "rights");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "Rights" }).waitFor();
    assert(
      new URL(page.url()).searchParams.get("selected") === selectedAfterRow &&
        new URL(page.url()).searchParams.get("tab") === "rights",
      "Media Duplicates refresh did not restore selected evidence and active tab"
    );

    const disabledControls = page.locator('button[aria-disabled="true"]:visible');
    for (let index = 0; index < await disabledControls.count(); index += 1) {
      await disabledControls.nth(index).click({ force: true }).catch(() => {});
    }
    assert(mutatingRequests.length === 0, `Media Duplicates disabled actions emitted mutations: ${mutatingRequests.join(" | ")}`);

    await page.goBack();
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.has("selected"));
    await page.goForward();
    await page.waitForFunction(() => new URL(window.location.href).searchParams.has("selected"));
    assert(
      new URL(page.url()).searchParams.get("tab") === "rights" &&
        new URL(page.url()).searchParams.get("query") === duplicateToken,
      "Media Duplicates browser history did not restore route state"
    );
    await desktopContext.close();

    const mobileContext = await authenticatedContext({ width: 390, height: 844 });
    const mobile = await mobileContext.newPage();
    observe(mobile);
    await mobile.goto(
      `${baseUrl}/admin/media/duplicates?query=${encodeURIComponent(duplicateToken)}&sort=title`,
      { waitUntil: "domcontentloaded" }
    );
    await mobile.getByRole("heading", { level: 1, name: "Duplicates" }).waitFor();
    await mobile.locator("[data-media-duplicate-group] .dense-object-row__body").first().click();
    const mobileDialog = mobile.getByRole("dialog", { name: /duplicate evidence inspector/i });
    await mobileDialog.waitFor();
    await mobile.waitForFunction(() => document.querySelector("#media-duplicates-inspector")?.contains(document.activeElement));
    assert(
      new URL(mobile.url()).searchParams.has("selected"),
      "Media Duplicates mobile row selection did not push inspector state"
    );
    assert(
      await mobile.getByRole("button", { name: "Open AI assistant" }).count() === 0,
      "Media Duplicates AI dock remained exposed beneath the mobile inspector"
    );
    await mobile.keyboard.press("Shift+Tab");
    assert(
      await mobile.evaluate(() => Boolean(document.querySelector("#media-duplicates-inspector")?.contains(document.activeElement))),
      "Media Duplicates mobile focus escaped the modal inspector"
    );
    await mobile.keyboard.press("Escape");
    await mobile.locator('#media-duplicates-inspector[aria-hidden="true"]').waitFor();
    assert(
      await mobile.evaluate(() => document.activeElement?.classList.contains("dense-object-row__body")),
      "Media Duplicates mobile inspector did not restore focus to the selected row"
    );
    await mobile.goBack();
    await mobile.waitForFunction(() => !new URL(window.location.href).searchParams.has("selected"));
    await mobileContext.close();

    assert(browserErrors.length === 0, `Media Duplicates browser state check emitted errors: ${browserErrors.join(" | ")}`);
    assert(failedResponses.length === 0, `Media Duplicates browser state check received failed responses: ${failedResponses.join(" | ")}`);
  } finally {
    await browser.close();
  }
}

async function checkMediaInUseBrowserState(baseUrl, cookieJar, queryToken) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  const browserErrors = [];
  const failedResponses = [];
  const mutatingRequests = [];

  async function authenticatedContext(viewport) {
    const context = await browser.newContext({ viewport });
    await context.addCookies([
      {
        name: "admin_session",
        value: cookieJar.get("admin_session"),
        url: baseUrl,
        httpOnly: true,
        sameSite: "Lax"
      },
      {
        name: "admin_csrf",
        value: cookieJar.get("admin_csrf"),
        url: baseUrl,
        sameSite: "Lax"
      }
    ]);
    return context;
  }

  function observe(page) {
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) {
        browserErrors.push(message.text());
      }
    });
    page.on("requestfailed", (request) => {
      const url = new URL(request.url());
      const failure = request.failure()?.errorText || "";
      if (!url.pathname.startsWith("/_vercel/") && !failure.toLowerCase().includes("aborted")) {
        failedResponses.push(`requestfailed ${request.method()} ${request.url()}`);
      }
    });
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (response.status() >= 400 && url.pathname !== "/_vercel/insights/script.js") {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        url.origin === new URL(baseUrl).origin &&
        !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
        !url.pathname.startsWith("/_vercel/")
      ) {
        mutatingRequests.push(`${request.method()} ${url.pathname}`);
      }
    });
  }

  try {
    const desktopContext = await authenticatedContext({ width: 1440, height: 900 });
    const page = await desktopContext.newPage();
    observe(page);
    await page.goto(
      `${baseUrl}/admin/media/in-use?view=rights-usage&issue=usage-unavailable&selected=missing&query=${encodeURIComponent(queryToken)}&sort=locations-desc&probe=keep`,
      { waitUntil: "domcontentloaded" }
    );
    await page.getByRole("heading", { level: 1, name: "In Use" }).waitFor();
    await page.waitForFunction(() => {
      const params = new URL(window.location.href).searchParams;
      return !params.has("view") && !params.has("issue") && !params.has("selected");
    });
    const canonicalUrl = new URL(page.url());
    assert(canonicalUrl.pathname === "/admin/media/in-use", "Media In Use browser check left the canonical route");
    assert(canonicalUrl.searchParams.get("query") === queryToken, "Media In Use canonicalization dropped query state");
    assert(canonicalUrl.searchParams.get("sort") === "locations-desc", "Media In Use canonicalization dropped sort state");
    assert(canonicalUrl.searchParams.get("probe") === "keep", "Media In Use canonicalization dropped an unknown safe parameter");

    const rows = page.locator("[data-media-usage-record] .dense-object-row__body");
    assert(await rows.count() === 1, "Media In Use browser check did not render one scoped evidence record");
    await rows.first().click();
    await page.waitForFunction(() => new URL(window.location.href).searchParams.has("selected"));
    const selectedAfterRow = new URL(page.url()).searchParams.get("selected");
    assert(selectedAfterRow, "Media In Use row selection did not become deep-linkable");
    await page.getByRole("complementary", { name: /media usage evidence inspector/i }).waitFor();
    assert(await page.getByRole("link", { name: "Open owner" }).count() >= 3, "Media In Use did not expose the three target-owner reference locations");

    const checkbox = page.locator("[data-media-usage-record] input[type=checkbox]").first();
    await checkbox.check();
    assert(
      new URL(page.url()).searchParams.get("selected") === selectedAfterRow,
      "Media In Use checkbox selection changed inspector selection"
    );
    await page.getByText("1 selected", { exact: false }).first().waitFor();

    await page.getByRole("tab", { name: "Rights" }).click();
    await page.waitForFunction(() => new URL(window.location.href).searchParams.get("tab") === "rights");
    await page.reload({ waitUntil: "domcontentloaded" });
    assert(
      new URL(page.url()).searchParams.get("selected") === selectedAfterRow &&
        new URL(page.url()).searchParams.get("tab") === "rights",
      "Media In Use refresh did not restore selected asset and active tab"
    );

    const disabledControls = page.locator('button[aria-disabled="true"]:visible');
    for (let index = 0; index < await disabledControls.count(); index += 1) {
      await disabledControls.nth(index).click({ force: true }).catch(() => {});
    }
    assert(mutatingRequests.length === 0, `Media In Use disabled actions emitted mutations: ${mutatingRequests.join(" | ")}`);

    await page.goBack();
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.has("selected"));
    await page.goForward();
    await page.waitForFunction(() => new URL(window.location.href).searchParams.has("selected"));
    assert(new URL(page.url()).searchParams.get("tab") === "rights", "Media In Use browser history did not restore tab state");
    await desktopContext.close();

    const mobileContext = await authenticatedContext({ width: 390, height: 844 });
    const mobile = await mobileContext.newPage();
    observe(mobile);
    await mobile.goto(`${baseUrl}/admin/media/in-use?query=${encodeURIComponent(queryToken)}&sort=locations-desc`, { waitUntil: "domcontentloaded" });
    await mobile.getByRole("heading", { level: 1, name: "In Use" }).waitFor();
    await mobile.locator("[data-media-usage-record] .dense-object-row__body").first().click();
    const mobileDialog = mobile.getByRole("dialog", { name: /media usage evidence inspector/i });
    await mobileDialog.waitFor();
    await mobile.waitForFunction(() => document.querySelector("#media-in-use-inspector")?.contains(document.activeElement));
    assert(new URL(mobile.url()).searchParams.has("selected"), "Media In Use mobile selection did not push route state");
    await mobile.reload({ waitUntil: "domcontentloaded" });
    await mobileDialog.waitFor();
    await mobile.waitForFunction(() => document.querySelector("#media-in-use-inspector")?.contains(document.activeElement));
    assert(
      new URL(mobile.url()).searchParams.has("selected") &&
        await mobileDialog.isVisible(),
      "Media In Use mobile direct selection did not restore its inspector after refresh"
    );
    assert(await mobile.getByRole("button", { name: "Open AI assistant" }).count() === 0, "Media In Use AI dock remained exposed beneath the mobile inspector");
    await mobile.keyboard.press("Shift+Tab");
    assert(
      await mobile.evaluate(() => Boolean(document.querySelector("#media-in-use-inspector")?.contains(document.activeElement))),
      "Media In Use mobile focus escaped the modal inspector"
    );
    const mobileDiagnostics = await mobile.evaluate(() => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };
      const undersizedTargets = Array.from(document.querySelectorAll("button, a[href], input, select, [role=tab]"))
        .filter(visible)
        .map((element) => element instanceof HTMLInputElement && element.type === "checkbox" && element.closest("label") ? element.closest("label") : element)
        .filter((element, index, all) => all.indexOf(element) === index)
        .map((element) => ({ label: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 50), rect: element.getBoundingClientRect() }))
        .filter((item) => item.rect.width < 44 || item.rect.height < 44)
        .map((item) => ({ label: item.label, width: item.rect.width, height: item.rect.height }));
      return {
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
        undersizedTargets
      };
    });
    assert(!mobileDiagnostics.overflowX, "Media In Use mobile inspector has document-level horizontal overflow");
    assert(mobileDiagnostics.undersizedTargets.length === 0, `Media In Use mobile targets below 44px: ${JSON.stringify(mobileDiagnostics.undersizedTargets)}`);
    await mobile.keyboard.press("Escape");
    await mobile.locator('#media-in-use-inspector[aria-hidden="true"]').waitFor();
    await mobile.waitForFunction(() => (
      document.activeElement instanceof HTMLElement &&
      document.activeElement.matches("[data-media-usage-record] .dense-object-row__body.is-selected")
    ));
    assert(
      await mobile.evaluate(() => document.activeElement?.classList.contains("dense-object-row__body")),
      "Media In Use mobile inspector did not restore focus to its selected row"
    );
    await mobileContext.close();

    assert(browserErrors.length === 0, `Media In Use browser state check emitted errors: ${browserErrors.join(" | ")}`);
    assert(failedResponses.length === 0, `Media In Use browser state check received failed responses: ${failedResponses.join(" | ")}`);
  } finally {
    await browser.close();
  }
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
  const personalOpsDataPath = path.join(serverEnv.FREMEN_DATA_DIR, "personal-ops.json");
  const migratedSeedAt = "2026-01-01T00:00:00.000Z";
  const migratedSeedCommon = {
    domain: "Personal Admin",
    description: "Schema v1 regression seed retained through the additive migration.",
    lifecycle: "active",
    health: "healthy",
    review: "not_reviewed",
    cadence: "current",
    priority: "medium",
    owner: "You",
    sourceRefs: [],
    linkedRefs: [],
    createdAt: migratedSeedAt,
    updatedAt: migratedSeedAt,
    history: []
  };
  const migratedV1Seed = {
    schemaVersion: 1,
    goals: [
      {
        ...migratedSeedCommon,
        id: `${testRunId}-v1-goal`,
        objectType: "goal",
        title: `${testRunId}-v1-goal`,
        outcome: "Keep the pre-migration Goal intact.",
        keyResults: []
      }
    ],
    decisions: [
      {
        ...migratedSeedCommon,
        id: `${testRunId}-v1-decision`,
        objectType: "decision",
        title: `${testRunId}-v1-decision`,
        decisionState: "open",
        question: "Does the v1 Decision survive migration?",
        reversibility: "reversible",
        risk: "low",
        options: []
      }
    ],
    obligations: [
      {
        ...migratedSeedCommon,
        id: `${testRunId}-v1-obligation`,
        objectType: "obligation",
        title: `${testRunId}-v1-obligation`,
        obligationState: "open",
        consequence: "The additive migration must retain this obligation.",
        requiredEvidence: [],
        completionCriteria: []
      }
    ],
    followUps: [
      {
        ...migratedSeedCommon,
        id: `${testRunId}-v1-follow-up`,
        objectType: "follow_up",
        title: `${testRunId}-v1-follow-up`,
        followUpState: "open",
        followUpType: "other",
        context: "Verify the migrated Follow-up remains available."
      }
    ],
    auditEvents: [],
    legacyMappings: []
  };
  const migratedV1SeedJson = `${JSON.stringify(migratedV1Seed, null, 2)}\n`;
  await mkdir(serverEnv.FREMEN_DATA_DIR, { recursive: true });
  await writeFile(personalOpsDataPath, migratedV1SeedJson, "utf8");

  let server;
  let preserveTempDir = false;

  try {
    const mediaLocalIntakeSource = await Promise.all([
      "components/media/MediaUploadQueueWorkspace.tsx",
      "components/media/MediaUploadInspector.tsx",
      "lib/modules/media/upload-intake.ts"
    ].map((relativePath) => readFile(path.join(dashboardDir, relativePath), "utf8")));
    const mediaLocalIntakeImplementation = mediaLocalIntakeSource.join("\n");
    for (const forbiddenImplementation of [
      "FileReader",
      ".arrayBuffer(",
      "createObjectURL",
      "FormData",
      "fetch(",
      "localStorage",
      "sessionStorage"
    ]) {
      assert(
        !mediaLocalIntakeImplementation.includes(forbiddenImplementation),
        `Media local intake crossed its no-content/no-network boundary: ${forbiddenImplementation}`
      );
    }
    pass("Media local intake contains no file-content read, transport, preview URL, or browser-persistence path");

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

    const unauthPersonalOps = await requestJson(server.baseUrl, cookieJar, "/api/personal/ops");
    assert(
      unauthPersonalOps.response.status === 401,
      `Expected /api/personal/ops to return 401, got ${describeStatus(unauthPersonalOps.response)}`
    );
    pass("Unauthenticated native Personal Ops API is blocked");

    const unauthSecondaryCreate = await requestJson(server.baseUrl, cookieJar, "/api/personal/ops", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": "unauthenticated-regression-token"
      },
      body: JSON.stringify({
        secondaryFamily: "captures",
        input: { rawText: "This unauthenticated Capture must never persist." }
      })
    });
    assert(
      unauthSecondaryCreate.response.status === 401 && !unauthSecondaryCreate.payload?.ok,
      `Unauthenticated secondary Personal Ops create was not blocked: ${JSON.stringify(unauthSecondaryCreate.payload)}`
    );
    pass("Unauthenticated secondary Personal Ops mutations are blocked before CSRF or persistence");

    const unauthProjects = await requestJson(server.baseUrl, cookieJar, "/api/projects");
    assert(
      unauthProjects.response.status === 401,
      `Expected /api/projects to return 401, got ${describeStatus(unauthProjects.response)}`
    );
    pass("Unauthenticated native Projects API is blocked");

    const unauthReviewRuns = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs");
    assert(
      unauthReviewRuns.response.status === 401,
      `Expected /api/reviews/runs to return 401, got ${describeStatus(unauthReviewRuns.response)}`
    );
    pass("Unauthenticated native Reviews API is blocked");

    const unauthPersonal = await requestText(server.baseUrl, cookieJar, "/admin/personal");
    assert(
      isAdminLoginRedirect(unauthPersonal.response, unauthPersonal.body),
      `Expected /admin/personal to redirect to admin login when unauthenticated, got ${describeStatus(unauthPersonal.response)}`
    );
    pass("Unauthenticated Personal Ops page redirects to login");

    const unauthPersonalDetail = await requestText(server.baseUrl, cookieJar, "/admin/personal/travel");
    assert(
      isAdminLoginRedirect(unauthPersonalDetail.response, unauthPersonalDetail.body),
      `Expected /admin/personal/travel to redirect to admin login when unauthenticated, got ${describeStatus(unauthPersonalDetail.response)}`
    );
    pass("Unauthenticated Personal Ops detail page redirects to login");

    for (const pathname of [
      "/admin/personal/routines",
      "/admin/personal/inbox",
      "/admin/personal/templates"
    ]) {
      const unauthenticatedPage = await requestText(server.baseUrl, cookieJar, pathname);
      assert(
        isAdminLoginRedirect(unauthenticatedPage.response, unauthenticatedPage.body),
        `Expected ${pathname} to redirect to admin login when unauthenticated, got ${describeStatus(unauthenticatedPage.response)}`
      );
    }
    pass("Unauthenticated Routines, Capture Inbox, and Templates routes redirect to login");

    const unauthenticatedMediaNeedsReview = await requestText(
      server.baseUrl,
      cookieJar,
      "/admin/media/needs-review"
    );
    assert(
      isAdminLoginRedirect(
        unauthenticatedMediaNeedsReview.response,
        unauthenticatedMediaNeedsReview.body
      ),
      `Expected /admin/media/needs-review to redirect to admin login when unauthenticated, got ${describeStatus(unauthenticatedMediaNeedsReview.response)}`
    );
    pass("Unauthenticated Media Needs Review route redirects to login");

    const unauthenticatedMediaMissingMetadata = await requestText(
      server.baseUrl,
      cookieJar,
      "/admin/media/missing-metadata"
    );
    assert(
      isAdminLoginRedirect(
        unauthenticatedMediaMissingMetadata.response,
        unauthenticatedMediaMissingMetadata.body
      ),
      `Expected /admin/media/missing-metadata to redirect to admin login when unauthenticated, got ${describeStatus(unauthenticatedMediaMissingMetadata.response)}`
    );
    pass("Unauthenticated Media Missing Metadata route redirects to login");

    const unauthenticatedMediaRightsUsage = await requestText(
      server.baseUrl,
      cookieJar,
      "/admin/media/rights-usage"
    );
    assert(
      isAdminLoginRedirect(
        unauthenticatedMediaRightsUsage.response,
        unauthenticatedMediaRightsUsage.body
      ),
      `Expected /admin/media/rights-usage to redirect to admin login when unauthenticated, got ${describeStatus(unauthenticatedMediaRightsUsage.response)}`
    );
    pass("Unauthenticated Media Rights / Usage route redirects to login");

    const unauthenticatedMediaDuplicates = await requestText(
      server.baseUrl,
      cookieJar,
      "/admin/media/duplicates"
    );
    assert(
      isAdminLoginRedirect(
        unauthenticatedMediaDuplicates.response,
        unauthenticatedMediaDuplicates.body
      ),
      `Expected /admin/media/duplicates to redirect to admin login when unauthenticated, got ${describeStatus(unauthenticatedMediaDuplicates.response)}`
    );
    pass("Unauthenticated Media Duplicates route redirects to login");

    const unauthenticatedMediaInUse = await requestText(
      server.baseUrl,
      cookieJar,
      "/admin/media/in-use"
    );
    assert(
      isAdminLoginRedirect(
        unauthenticatedMediaInUse.response,
        unauthenticatedMediaInUse.body
      ),
      `Expected /admin/media/in-use to redirect to admin login when unauthenticated, got ${describeStatus(unauthenticatedMediaInUse.response)}`
    );
    pass("Unauthenticated Media In Use route redirects to login");

    const unauthenticatedMediaUploadQueue = await requestText(
      server.baseUrl,
      cookieJar,
      "/admin/media/upload-queue"
    );
    assert(
      isAdminLoginRedirect(
        unauthenticatedMediaUploadQueue.response,
        unauthenticatedMediaUploadQueue.body
      ),
      `Expected /admin/media/upload-queue to redirect to admin login when unauthenticated, got ${describeStatus(unauthenticatedMediaUploadQueue.response)}`
    );
    pass("Unauthenticated Media Upload Queue route redirects to login");

    const financeDirectPathnames = [
      "/admin/finance/transactions",
      "/admin/finance/accounts",
      "/admin/finance/bills",
      "/admin/finance/budgets",
      "/admin/finance/monthly-review"
    ];
    for (const pathname of financeDirectPathnames) {
      const unauthenticatedPage = await requestText(server.baseUrl, cookieJar, pathname);
      assert(
        isAdminLoginRedirect(unauthenticatedPage.response, unauthenticatedPage.body),
        `Expected ${pathname} to redirect to admin login when unauthenticated, got ${describeStatus(unauthenticatedPage.response)}`
      );
    }
    pass("Unauthenticated canonical Finance routes redirect to login");

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
    assert(adminHome.body.includes("app-mobile-primary-navigation"), "Admin home missing responsive permanent-navigation disclosure");
    pass("Admin home renders locked nav and review shortcuts");

    const personalPage = await requestText(server.baseUrl, cookieJar, "/admin/personal");
    assert(personalPage.response.ok, `Personal Ops page failed: ${describeStatus(personalPage.response)}`);
    for (const expected of [
      "Personal Ops",
      "Personal Ops Command",
      "Your operating view for today across goals, decisions, obligations, and follow-ups.",
      "Current Goals bridge",
      "Routines",
      "Capture Inbox",
      "Templates"
    ]) {
      assert(personalPage.body.includes(expected), `Personal Ops page missing expected text: ${expected}`);
    }
    for (const removedBoundary of [
      "Routines arrive in the advanced Personal Ops phase.",
      "Capture processing is intentionally disabled",
      "Templates are planned for the advanced Personal Ops phase."
    ]) {
      assert(!personalPage.body.includes(removedBoundary), `Personal Ops page still exposes obsolete disabled copy: ${removedBoundary}`);
    }
    assert(!personalPage.body.includes("Architecture Guardrails"), "Personal Ops Command still renders the obsolete static architecture mockup");
    assert(!personalPage.body.includes("Native Database"), "Personal Ops Command still renders the obsolete fake native-database card");
    pass("Personal Ops Command loads with the native operating queue and explicit unfinished boundaries");

    const personalOpsRoutes = [
      {
        pathname: "/admin/personal/goals",
        label: "Goals",
        expected: [
          "Current Goals",
          "Outcomes and measurable key results",
          "Current Goals bridge",
          "Add native goal"
        ]
      },
      {
        pathname: "/admin/personal/decisions",
        label: "Decisions",
        expected: [
          "Decisions",
          "Durable choices with rationale, reversibility, provenance, and explicit review state.",
          "File decision"
        ]
      },
      {
        pathname: "/admin/personal/obligations",
        label: "Obligations",
        expected: [
          "Obligations",
          "Commitments whose completion depends on criteria and evidence, not a bare checkbox.",
          "Add obligation"
        ]
      },
      {
        pathname: "/admin/personal/follow-ups",
        label: "Follow-ups",
        expected: [
          "Follow-ups",
          "Actionable next contact and carry-forward work, linked back to its native source.",
          "New follow-up"
        ]
      },
      {
        pathname: "/admin/personal/routines",
        label: "Routines",
        expected: [
          "Routines",
          "Recurring operating rhythms, cadence rules, and generated work.",
          "Runs are manual, previewed, idempotent",
          "Review Routines"
        ]
      },
      {
        pathname: "/admin/personal/inbox",
        label: "Capture Inbox",
        expected: [
          "Capture Inbox",
          "Raw inputs, quick captures, and triage into native Personal Ops objects.",
          "Raw capture text is immutable.",
          "Process Inbox"
        ]
      },
      {
        pathname: "/admin/personal/templates",
        label: "Templates",
        expected: [
          "Templates",
          "Reusable creation patterns for operating objects, triage, cadence, and review work.",
          "Testing writes nothing",
          "Review Templates"
        ]
      }
    ];
    for (const route of personalOpsRoutes) {
      const page = await requestText(server.baseUrl, cookieJar, route.pathname);
      assert(page.response.ok, `Personal Ops ${route.label} page failed: ${describeStatus(page.response)}`);
      for (const expected of route.expected) {
        assert(page.body.includes(expected), `Personal Ops ${route.label} page missing expected text: ${expected}`);
      }
    }
    pass("All canonical Personal Ops routes load through one shared shell with explicit advanced safety boundaries");

    const personalOpsAfterRouteReads = await readFile(personalOpsDataPath, "utf8");
    assert(
      personalOpsAfterRouteReads === migratedV1SeedJson,
      "Reading authenticated Personal Ops routes rewrote the schema v1 seed before a user mutation"
    );
    pass("Schema v1 Personal Ops route reads normalize in memory without writing the isolated store");

    const projectsPage = await requestText(server.baseUrl, cookieJar, "/admin/projects");
    assert(projectsPage.response.ok, `Projects page failed: ${describeStatus(projectsPage.response)}`);
    for (const expected of ["Projects", "Project Blacktube", "Project Fremen", "Project Iceflake", "Project Pacific", "Project Pint"]) {
      assert(projectsPage.body.includes(expected), `Projects page missing expected text: ${expected}`);
    }
    pass("Projects hub loads with top-level project navigation");

    const reviewsPage = await requestText(server.baseUrl, cookieJar, "/admin/reviews");
    assert(reviewsPage.response.ok, `Reviews page failed: ${describeStatus(reviewsPage.response)}`);
    for (const expected of ["Reviews", "Weekly", "Monthly", "Start weekly", "Start monthly"]) {
      assert(reviewsPage.body.includes(expected), `Reviews page missing expected text: ${expected}`);
    }
    pass("Reviews Home loads through the canonical shared shell");

    const notesPage = await requestText(server.baseUrl, cookieJar, "/admin/notes");
    assert(notesPage.response.ok, `Notes page failed: ${describeStatus(notesPage.response)}`);
    assert(notesPage.body.includes("All Notes"), "Notes page missing the native directory heading");
    assert(notesPage.body.includes("Quick capture"), "Notes page missing persisted quick capture");
    pass("Notes directory loads through the authored-knowledge adapter");

    const peoplePage = await requestText(server.baseUrl, cookieJar, "/admin/people");
    assert(peoplePage.response.ok, `People page failed: ${describeStatus(peoplePage.response)}`);
    assert(peoplePage.body.includes("People records"), "People page missing native People record scope");
    pass("People hub loads");

    const mediaPage = await requestText(server.baseUrl, cookieJar, "/admin/media");
    assert(mediaPage.response.ok, `Media page failed: ${describeStatus(mediaPage.response)}`);
    assert(mediaPage.body.includes("All Media"), "Media page missing its native directory heading");
    assert(mediaPage.body.includes("Migration-safe read path"), "Media page missing its read-path disclosure");
    pass("Media directory loads with an explicit read-only boundary");

    const mediaNeedsReviewPage = await requestText(server.baseUrl, cookieJar, "/admin/media/needs-review");
    assert(
      mediaNeedsReviewPage.response.ok,
      `Media Needs Review page failed: ${describeStatus(mediaNeedsReviewPage.response)}`
    );
    for (const expected of ["Needs Review", "Legacy readiness triage", "Read-only"]) {
      assert(
        mediaNeedsReviewPage.body.includes(expected),
        `Media Needs Review page missing explicit legacy boundary text: ${expected}`
      );
    }
    assert(
      mediaNeedsReviewPage.body.includes("AssetReview") &&
        mediaNeedsReviewPage.body.includes("not connected"),
      "Media Needs Review page did not disclose that native AssetReview persistence is unavailable"
    );
    for (const mockupConstant of [
      "11 assets need review",
      "6 metadata",
      "3 rights",
      "2 duplicates"
    ]) {
      assert(
        !mediaNeedsReviewPage.body.includes(mockupConstant),
        `Media Needs Review page rendered a mockup constant as live data: ${mockupConstant}`
      );
    }
    pass("Media Needs Review direct route loads as an honest legacy-readiness queue");

    const mediaMissingMetadataPage = await requestText(
      server.baseUrl,
      cookieJar,
      "/admin/media/missing-metadata"
    );
    assert(
      mediaMissingMetadataPage.response.ok,
      `Media Missing Metadata page failed: ${describeStatus(mediaMissingMetadataPage.response)}`
    );
    for (const expected of [
      "Missing Metadata",
      "Legacy metadata evidence",
      "unavailable in the legacy adapter",
      "does not claim the original asset objectively lacks a field"
    ]) {
      assert(
        mediaMissingMetadataPage.body.toLowerCase().includes(expected.toLowerCase()),
        `Media Missing Metadata page missing explicit evidence-boundary text: ${expected}`
      );
    }
    for (const forbidden of ["68% complete", "Confidence: 76%", "review_screenshot.png"]) {
      assert(
        !mediaMissingMetadataPage.body.includes(forbidden),
        `Media Missing Metadata page rendered a mockup value as current data: ${forbidden}`
      );
    }
    pass("Media Missing Metadata direct route loads as an honest legacy-evidence queue");

    const mediaRightsUsagePage = await requestText(
      server.baseUrl,
      cookieJar,
      "/admin/media/rights-usage?view=all&tab=not-a-media-tab&keep=1"
    );
    assert(
      mediaRightsUsagePage.response.ok,
      `Media Rights / Usage page failed: ${describeStatus(mediaRightsUsagePage.response)}`
    );
    for (const expected of [
      "Rights / Usage",
      "Rights / Usage evidence",
      "Needs confirmation",
      "Native usage registry",
      "not connected",
      "Resource-owned URL candidates"
    ]) {
      assert(
        mediaRightsUsagePage.body.toLowerCase().includes(expected.toLowerCase()),
        `Media Rights / Usage page missing explicit evidence-boundary text: ${expected}`
      );
    }
    for (const forbidden of [
      "Review screenshot",
      "12 unknown",
      "24 in active use",
      "72%",
      "1.8 MB",
      "1728×972"
    ]) {
      assert(
        !mediaRightsUsagePage.body.includes(forbidden),
        `Media Rights / Usage page rendered mockup evidence as current data: ${forbidden}`
      );
    }
    pass("Media Rights / Usage direct route remains authoritative and evidence-honest");

    const mediaDuplicatesPage = await requestText(
      server.baseUrl,
      cookieJar,
      "/admin/media/duplicates?case=unsafe&view=rights-usage&tab=usage&issue=rights"
    );
    assert(
      mediaDuplicatesPage.response.ok,
      `Media Duplicates page failed: ${describeStatus(mediaDuplicatesPage.response)}`
    );
    for (const expected of [
      "Duplicates",
      "Exact-source evidence only",
      "Native cases",
      "Repository not connected",
      "resolution writes are not connected"
    ]) {
      assert(
        mediaDuplicatesPage.body.toLowerCase().includes(expected.toLowerCase()),
        `Media Duplicates page missing explicit evidence boundary: ${expected}`
      );
    }
    for (const forbidden of [
      "94%",
      "review_screenshot.png",
      "1728×972",
      "1.8 MB",
      "checksum match",
      "exact binary match",
      "auto-merge"
    ]) {
      assert(
        !mediaDuplicatesPage.body.toLowerCase().includes(forbidden.toLowerCase()),
        `Media Duplicates page rendered mock or invented evidence: ${forbidden}`
      );
    }
    assert(
      mediaDuplicatesPage.body.includes('href="/admin/media/duplicates"'),
      "Media navigation did not expose the canonical Duplicates route"
    );
    pass("Media Duplicates direct route loads as an evidence-only, non-mutating boundary");

    const mediaInUsePage = await requestText(
      server.baseUrl,
      cookieJar,
      "/admin/media/in-use?asset=unsafe&view=rights-usage&issue=usage-unavailable&tab=usage&keep=1"
    );
    assert(
      mediaInUsePage.response.ok,
      `Media In Use page failed: ${describeStatus(mediaInUsePage.response)}`
    );
    for (const expected of [
      "In Use",
      "Reference evidence, not AssetUsage",
      "Native owner locations",
      "AssetUsage records",
      "Repository not connected",
      "No Media identifiers or owner references are available"
    ]) {
      assert(
        mediaInUsePage.body.toLowerCase().includes(expected.toLowerCase()),
        `Media In Use page missing explicit evidence boundary: ${expected}`
      );
    }
    for (const forbidden of [
      "42 active usages",
      "31 internal only",
      "Review screenshot",
      "review_screenshot.png",
      "1728×972",
      "1.8 MB"
    ]) {
      assert(
        !mediaInUsePage.body.toLowerCase().includes(forbidden.toLowerCase()),
        `Media In Use page rendered mock or invented usage evidence: ${forbidden}`
      );
    }
    assert(
      mediaInUsePage.body.includes('href="/admin/media/in-use"'),
      "Media navigation did not expose the canonical In Use route"
    );
    pass("Media In Use direct route loads as an owner-reference index without inventing AssetUsage");

    const mediaUploadQueuePage = await requestText(
      server.baseUrl,
      cookieJar,
      "/admin/media/upload-queue?query=private-filename&selected=unsafe&upload=unsafe&filter=needs-type&tab=rights"
    );
    assert(
      mediaUploadQueuePage.response.ok,
      `Media Upload Queue page failed: ${describeStatus(mediaUploadQueuePage.response)}`
    );
    for (const expected of [
      "Upload Queue",
      "Preflight files without uploading them",
      "Local preview",
      "Uploaded",
      "Native queue records",
      "No local files in preview",
      "Choose files",
      "does not read file contents"
    ]) {
      assert(
        mediaUploadQueuePage.body.toLowerCase().includes(expected.toLowerCase()),
        `Media Upload Queue page missing local-only boundary text: ${expected}`
      );
    }
    for (const forbidden of [
      "review_screenshot.png",
      "1728×972",
      "1.8 MB",
      "3 queued",
      "2 processing"
    ]) {
      assert(
        !mediaUploadQueuePage.body.includes(forbidden),
        `Media Upload Queue page rendered unsafe query state or a mockup value: ${forbidden}`
      );
    }
    pass("Media Upload Queue direct route loads as an empty local-only intake boundary");

    const resourcesPage = await requestText(server.baseUrl, cookieJar, "/admin/resources");
    assert(resourcesPage.response.ok, `Resources page failed: ${describeStatus(resourcesPage.response)}`);
    assert(resourcesPage.body.includes("All Resources"), "Resources page missing its native directory heading");
    assert(resourcesPage.body.includes("Search resources, source, context"), "Resources page missing its source search");
    pass("Resources directory loads through the external-source adapter");

    const financePage = await requestText(server.baseUrl, cookieJar, "/admin/finance");
    assert(financePage.response.ok, `Finance page failed: ${describeStatus(financePage.response)}`);
    assert(financePage.body.includes("Finance command view"), "Finance page missing command view text");
    assert(financePage.body.includes("Fixture dataset · June 2026 · read-only preview"), "Finance page missing fixture/read-only disclosure");
    pass("Finance hub loads");

    const financeCanonicalRoutes = [
      {
        pathname: "/admin/finance/transactions?view=review",
        canonicalHref: "/admin/finance/transactions",
        heading: "Transactions",
        marker: 'aria-label="Finance transactions"'
      },
      {
        pathname: "/admin/finance/accounts?view=transactions",
        canonicalHref: "/admin/finance/accounts",
        heading: "Accounts & Cashflow",
        marker: 'data-finance-account-id="operating"'
      },
      {
        pathname: "/admin/finance/bills?view=budgets",
        canonicalHref: "/admin/finance/bills",
        heading: "Bills & Subscriptions",
        marker: "Payment queue"
      },
      {
        pathname: "/admin/finance/budgets?view=bills",
        canonicalHref: "/admin/finance/budgets",
        heading: "Budgets",
        marker: 'aria-label="Budget categories"'
      },
      {
        pathname: "/admin/finance/monthly-review?view=accounts",
        canonicalHref: "/admin/finance/monthly-review",
        heading: "Monthly Review",
        marker: "Close checklist"
      }
    ];
    for (const route of financeCanonicalRoutes) {
      const page = await requestText(server.baseUrl, cookieJar, route.pathname);
      const escapedHeading = route.heading.replaceAll("&", "&amp;");
      assert(page.response.ok, `Finance ${route.heading} route failed: ${describeStatus(page.response)}`);
      assert(
        page.body.includes(`<h1>${escapedHeading}</h1>`) && page.body.includes(route.marker),
        `Finance direct route did not preserve ${route.heading} precedence over a conflicting legacy view query`
      );
      for (const disclosure of [
        "Fixture dataset · June 2026 · read-only preview",
        "Persistent Finance mutations are not connected",
        "NOT CONNECTED"
      ]) {
        assert(
          page.body.includes(disclosure),
          `Finance ${route.heading} route omitted its fixture/read-only disclosure: ${disclosure}`
        );
      }
      assert(
        countRenderedToken(page.body, `href="${route.canonicalHref}"`) >= 1,
        `Finance ${route.heading} route omitted its canonical sidebar href: ${route.canonicalHref}`
      );
    }
    pass("Canonical Finance routes retain direct-route precedence and fixture/read-only disclosure");

    for (const canonicalHref of [
      "/admin/finance",
      "/admin/finance/transactions",
      "/admin/finance/accounts",
      "/admin/finance/bills",
      "/admin/finance/budgets",
      "/admin/finance/monthly-review"
    ]) {
      assert(
        countRenderedToken(financePage.body, `href="${canonicalHref}"`) >= 1,
        `Finance sidebar omitted canonical href: ${canonicalHref}`
      );
    }
    assert(
      countRenderedToken(financePage.body, 'href="/admin/finance?view=') === 0,
      "Finance sidebar still emits legacy view-query navigation"
    );
    assert(
      countRenderedToken(financePage.body, 'href="/admin/finance/rules"') === 0,
      "Finance sidebar exposes an unimplemented Rules route"
    );
    pass("Finance sidebar emits canonical direct routes without an invented Rules destination");

    const legacyFinanceView = await requestText(
      server.baseUrl,
      cookieJar,
      "/admin/finance?view=transactions"
    );
    assert(
      legacyFinanceView.response.ok && legacyFinanceView.body.includes("<h1>Transactions</h1>"),
      "Finance root route no longer honors the compatibility view query"
    );
    pass("Finance root retains legacy view-query compatibility");

    const financeAccountDetail = await requestText(
      server.baseUrl,
      cookieJar,
      "/admin/finance/accounts?selected=operating"
    );
    assert(financeAccountDetail.response.ok, `Finance account detail failed: ${describeStatus(financeAccountDetail.response)}`);
    for (const expected of [
      'aria-label="Cashflow over six months"',
      "Latest plotted values are income $10.0 thousand",
      'href="/admin/finance/monthly-review"',
      "Finance Monthly Review"
    ]) {
      assert(financeAccountDetail.body.includes(expected), `Finance account detail omitted accessible owner-boundary evidence: ${expected}`);
    }
    assert(
      !financeAccountDetail.body.includes('/admin/reviews/may-close'),
      "Finance account detail linked a Finance-owned close to a nonexistent Reviews object"
    );
    pass("Finance account detail exposes cashflow text and Finance-owned monthly-review context");

    await checkFinanceBrowserState(server.baseUrl, cookieJar);
    pass("Hydrated Finance operational routes preserve scoped URL state, literal evidence, read-only boundaries, and zero-mutation interactions");

    const financeRulesPage = await requestText(server.baseUrl, cookieJar, "/admin/finance/rules");
    assert(
      isAppRouterNotFound(financeRulesPage.response, financeRulesPage.body),
      `Unimplemented Finance Rules route did not remain unavailable: ${describeStatus(financeRulesPage.response)}`
    );
    pass("Finance Rules remains explicitly unimplemented instead of presenting a static replica");

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

    logStep("Checking native Projects promotion, persistence, rules, and soft lifecycle boundaries");
    const initialProjectsState = await requestJson(server.baseUrl, cookieJar, "/api/projects");
    assert(
      initialProjectsState.response.ok &&
        initialProjectsState.payload?.ok &&
        initialProjectsState.payload.state?.schemaVersion === 1 &&
        Array.isArray(initialProjectsState.payload.state?.projects) &&
        initialProjectsState.payload.state.projects.length === 0,
      `Native Projects state did not start isolated and empty: ${JSON.stringify(initialProjectsState.payload)}`
    );
    const legacyProjectProjections = [
      ["PRJ-BLK", "Project Blacktube"],
      ["PRJ-FRM", "Project Fremen"],
      ["PRJ-ICE", "Project Iceflake"],
      ["PRJ-PAC", "Project Pacific"],
      ["PRJ-PNT", "Project Pint"]
    ];
    for (const [id, name] of legacyProjectProjections) {
      assert(
        projectsPage.body.includes(id) && projectsPage.body.includes(name),
        `Projects route did not expose the legacy projection ${id}:${name}`
      );
    }
    assert(
      projectsPage.body.includes("Start tracking"),
      "Projects route did not disclose the explicit legacy-promotion action"
    );
    pass("Projects presents exactly five stable legacy identities over an empty isolated native state");

    const rejectProjectsCsrf = await requestJson(server.baseUrl, cookieJar, "/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "promote_legacy",
        input: { legacyKey: "admin-project:iceflake", promotionConfirmed: true }
      })
    });
    assert(
      rejectProjectsCsrf.response.status === 403 && !rejectProjectsCsrf.payload?.ok,
      `Native Projects POST accepted missing CSRF proof: ${JSON.stringify(rejectProjectsCsrf.payload)}`
    );

    const promoteLegacyProject = await requestJson(server.baseUrl, cookieJar, "/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        operation: "promote_legacy",
        input: {
          legacyKey: "admin-project:iceflake",
          promotionConfirmed: true,
          objective: "Exercise native Project ownership without importing legacy tasks.",
          owner: "Codex Regression"
        }
      })
    });
    assert(
      promoteLegacyProject.response.ok &&
        promoteLegacyProject.payload?.ok &&
        promoteLegacyProject.payload.created === true &&
        promoteLegacyProject.payload.item?.id === "PRJ-ICE" &&
        promoteLegacyProject.payload.mapping?.legacyKey === "admin-project:iceflake",
      `Explicit legacy Project promotion failed: ${JSON.stringify(promoteLegacyProject.payload)}`
    );
    const promotedProject = promoteLegacyProject.payload.item;

    const promoteLegacyProjectAgain = await requestJson(server.baseUrl, cookieJar, "/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        operation: "promote_legacy",
        input: { legacyKey: "admin-project:iceflake", promotionConfirmed: true }
      })
    });
    assert(
      promoteLegacyProjectAgain.response.ok &&
        promoteLegacyProjectAgain.payload?.ok &&
        promoteLegacyProjectAgain.payload.created === false &&
        promoteLegacyProjectAgain.payload.item?.id === promotedProject.id,
      `Legacy Project promotion was not idempotent: ${JSON.stringify(promoteLegacyProjectAgain.payload)}`
    );

    const updatePromotedProject = await requestJson(server.baseUrl, cookieJar, "/api/projects", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "projects",
        id: promotedProject.id,
        expectedUpdatedAt: promotedProject.updatedAt,
        patch: {
          objective: "Verify native milestones, blockers, links, audit, and persistence.",
          priority: "high"
        }
      })
    });
    assert(
      updatePromotedProject.response.ok &&
        updatePromotedProject.payload?.item?.objective ===
          "Verify native milestones, blockers, links, audit, and persistence.",
      `Promoted Project update failed: ${JSON.stringify(updatePromotedProject.payload)}`
    );

    const rejectStaleProject = await requestJson(server.baseUrl, cookieJar, "/api/projects", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "projects",
        id: promotedProject.id,
        expectedUpdatedAt: promotedProject.updatedAt,
        patch: { objective: "This stale overwrite must not persist." }
      })
    });
    assert(
      rejectStaleProject.response.status === 409 && rejectStaleProject.payload?.code === "stale",
      `Native Projects accepted a stale overwrite: ${JSON.stringify(rejectStaleProject.payload)}`
    );
    pass("Projects requires CSRF proof and enforces explicit idempotent promotion plus optimistic concurrency");

    const createProjectMilestone = await requestJson(server.baseUrl, cookieJar, "/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        operation: "create",
        family: "milestones",
        input: {
          projectId: promotedProject.id,
          title: `${testRunId}-milestone`,
          description: "A Project-owned completion gate.",
          dueAt: "2026-07-31",
          state: "active"
        }
      })
    });
    assert(
      createProjectMilestone.response.ok &&
        createProjectMilestone.payload?.ok &&
        createProjectMilestone.payload.created &&
        createProjectMilestone.payload.item?.objectType === "milestone",
      `Project milestone create failed: ${JSON.stringify(createProjectMilestone.payload)}`
    );
    const projectMilestone = createProjectMilestone.payload.item;

    const rejectUngatedMilestoneCompletion = await requestJson(server.baseUrl, cookieJar, "/api/projects", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "milestones",
        id: projectMilestone.id,
        expectedUpdatedAt: projectMilestone.updatedAt,
        patch: { state: "complete" }
      })
    });
    assert(
      rejectUngatedMilestoneCompletion.response.status === 400 &&
        rejectUngatedMilestoneCompletion.payload?.code === "validation",
      `Milestone completed without criteria and a completion note: ${JSON.stringify(rejectUngatedMilestoneCompletion.payload)}`
    );

    const completeProjectMilestone = await requestJson(server.baseUrl, cookieJar, "/api/projects", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "milestones",
        id: projectMilestone.id,
        expectedUpdatedAt: projectMilestone.updatedAt,
        patch: {
          state: "complete",
          completionCriteria: ["Regression evidence recorded"],
          completionNote: "The isolated persistence and rule checks passed."
        }
      })
    });
    assert(
      completeProjectMilestone.response.ok &&
        completeProjectMilestone.payload?.item?.state === "complete" &&
        completeProjectMilestone.payload.item.completedAt,
      `Gated milestone completion failed: ${JSON.stringify(completeProjectMilestone.payload)}`
    );

    const createProjectBlocker = await requestJson(server.baseUrl, cookieJar, "/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        operation: "create",
        family: "blockers",
        input: {
          projectId: promotedProject.id,
          title: `${testRunId}-project-blocker`,
          condition: "The native API contract must be verified before the checkpoint.",
          severity: "high"
        }
      })
    });
    assert(
      createProjectBlocker.response.ok &&
        createProjectBlocker.payload?.item?.objectType === "blocker" &&
        createProjectBlocker.payload.item.state === "open",
      `Project blocker create failed: ${JSON.stringify(createProjectBlocker.payload)}`
    );
    const projectBlocker = createProjectBlocker.payload.item;

    const rejectUnexplainedBlockerResolution = await requestJson(server.baseUrl, cookieJar, "/api/projects", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "blockers",
        id: projectBlocker.id,
        expectedUpdatedAt: projectBlocker.updatedAt,
        patch: { state: "resolved" }
      })
    });
    assert(
      rejectUnexplainedBlockerResolution.response.status === 400 &&
        rejectUnexplainedBlockerResolution.payload?.code === "validation",
      `Project blocker resolved without a resolution: ${JSON.stringify(rejectUnexplainedBlockerResolution.payload)}`
    );

    const resolveProjectBlocker = await requestJson(server.baseUrl, cookieJar, "/api/projects", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "blockers",
        id: projectBlocker.id,
        expectedUpdatedAt: projectBlocker.updatedAt,
        patch: {
          state: "resolved",
          resolution: "The isolated native Projects contract passed its focused checks."
        }
      })
    });
    assert(
      resolveProjectBlocker.response.ok &&
        resolveProjectBlocker.payload?.item?.state === "resolved" &&
        resolveProjectBlocker.payload.item.resolvedAt,
      `Project blocker resolution failed: ${JSON.stringify(resolveProjectBlocker.payload)}`
    );
    pass("Project-owned milestones and blockers enforce completion and resolution evidence");

    const linkedProjectSource = {
      module: "notes",
      objectType: "note",
      objectId: `${testRunId}-project-note`,
      label: `${testRunId} Project source Note`
    };
    const createProjectLink = await requestJson(server.baseUrl, cookieJar, "/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        operation: "create",
        family: "links",
        input: {
          projectId: promotedProject.id,
          source: linkedProjectSource,
          relationship: "supporting_context",
          relationshipStrength: "strong",
          projectSpecificNote: "The source remains Notes-owned."
        }
      })
    });
    assert(
      createProjectLink.response.ok &&
        createProjectLink.payload?.item?.source?.objectId === linkedProjectSource.objectId &&
        createProjectLink.payload.item.linkState === "active",
      `Project link create failed: ${JSON.stringify(createProjectLink.payload)}`
    );
    const projectLink = createProjectLink.payload.item;

    const removeProjectLink = await requestJson(server.baseUrl, cookieJar, "/api/projects", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "links",
        id: projectLink.id,
        expectedUpdatedAt: projectLink.updatedAt,
        patch: {
          linkState: "removed",
          removalReason: "Regression verifies that unlinking preserves both native objects."
        }
      })
    });
    assert(
      removeProjectLink.response.ok &&
        removeProjectLink.payload?.item?.linkState === "removed" &&
        removeProjectLink.payload.item.removedAt &&
        removeProjectLink.payload.item.source?.objectId === linkedProjectSource.objectId,
      `Project link soft removal failed: ${JSON.stringify(removeProjectLink.payload)}`
    );
    const reloadedRemovedProjectLink = await requestJson(
      server.baseUrl,
      cookieJar,
      `/api/projects?family=links&id=${encodeURIComponent(projectLink.id)}`
    );
    assert(
      reloadedRemovedProjectLink.response.ok &&
        reloadedRemovedProjectLink.payload?.item?.linkState === "removed" &&
        reloadedRemovedProjectLink.payload.item.source?.objectId === linkedProjectSource.objectId,
      `Removed Project link did not retain its owner reference: ${JSON.stringify(reloadedRemovedProjectLink.payload)}`
    );
    pass("Project unlink is soft, auditable, persistent, and does not delete the Notes-owned source");

    const latestProjectBeforeLifecycle = await requestJson(
      server.baseUrl,
      cookieJar,
      `/api/projects?family=projects&id=${encodeURIComponent(promotedProject.id)}`
    );
    assert(
      latestProjectBeforeLifecycle.response.ok && latestProjectBeforeLifecycle.payload?.item?.id === promotedProject.id,
      `Promoted Project reload failed: ${JSON.stringify(latestProjectBeforeLifecycle.payload)}`
    );
    const lifecycleProject = latestProjectBeforeLifecycle.payload.item;

    const rejectProjectCompletion = await requestJson(server.baseUrl, cookieJar, "/api/projects", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "projects",
        id: lifecycleProject.id,
        expectedUpdatedAt: lifecycleProject.updatedAt,
        patch: { lifecycle: "complete" }
      })
    });
    assert(
      rejectProjectCompletion.response.status === 409 &&
        rejectProjectCompletion.payload?.code === "read_only" &&
        rejectProjectCompletion.payload?.fieldErrors?.lifecycle,
      `Project completion was not held at the explicit unfinished boundary: ${JSON.stringify(rejectProjectCompletion.payload)}`
    );

    const rejectUnconfirmedProjectArchive = await requestJson(server.baseUrl, cookieJar, "/api/projects", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "projects",
        id: lifecycleProject.id,
        expectedUpdatedAt: lifecycleProject.updatedAt,
        patch: {
          lifecycle: "archived",
          archiveReason: "Regression archive confirmation check"
        }
      })
    });
    assert(
      rejectUnconfirmedProjectArchive.response.status === 400 &&
        rejectUnconfirmedProjectArchive.payload?.code === "validation",
      `Project archive skipped explicit confirmation: ${JSON.stringify(rejectUnconfirmedProjectArchive.payload)}`
    );

    const archiveProject = await requestJson(server.baseUrl, cookieJar, "/api/projects", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "projects",
        id: lifecycleProject.id,
        expectedUpdatedAt: lifecycleProject.updatedAt,
        patch: {
          lifecycle: "archived",
          archiveConfirmed: true,
          archiveReason: "Regression verifies a reversible, auditable archive."
        }
      })
    });
    assert(
      archiveProject.response.ok &&
        archiveProject.payload?.item?.lifecycle === "archived" &&
        archiveProject.payload.item.archivedAt &&
        archiveProject.payload.item.archiveReason,
      `Project soft archive failed: ${JSON.stringify(archiveProject.payload)}`
    );

    const restoreProject = await requestJson(server.baseUrl, cookieJar, "/api/projects", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "projects",
        id: lifecycleProject.id,
        expectedUpdatedAt: archiveProject.payload.item.updatedAt,
        patch: { lifecycle: "active" }
      })
    });
    assert(
      restoreProject.response.ok &&
        restoreProject.payload?.item?.lifecycle === "active" &&
        !restoreProject.payload.item.archivedAt,
      `Project restore failed: ${JSON.stringify(restoreProject.payload)}`
    );

    const persistedProjectsState = await requestJson(server.baseUrl, cookieJar, "/api/projects");
    assert(
      persistedProjectsState.response.ok &&
        persistedProjectsState.payload?.state?.projects?.length === 1 &&
        persistedProjectsState.payload.state.legacyMappings?.length === 1 &&
        persistedProjectsState.payload.state.milestones?.some(
          (item) => item.id === projectMilestone.id && item.state === "complete"
        ) &&
        persistedProjectsState.payload.state.blockers?.some(
          (item) => item.id === projectBlocker.id && item.state === "resolved"
        ) &&
        persistedProjectsState.payload.state.links?.some(
          (item) => item.id === projectLink.id && item.linkState === "removed"
        ) &&
        persistedProjectsState.payload.state.auditEvents?.length >= 8,
      `Native Projects records, mapping, or audit history did not persist: ${JSON.stringify(persistedProjectsState.payload)}`
    );

    const projectDetailPage = await requestText(
      server.baseUrl,
      cookieJar,
      `/admin/projects/${encodeURIComponent(promotedProject.id)}?tab=timeline&reload=${Date.now()}`
    );
    assert(
      projectDetailPage.response.ok &&
        projectDetailPage.body.includes("Project Iceflake") &&
        projectDetailPage.body.includes("Timeline") &&
        projectDetailPage.body.includes(`${testRunId}-milestone`),
      `Canonical Project detail route did not reload persisted native state: ${describeStatus(projectDetailPage.response)}`
    );
    pass("Project completion remains explicitly disabled while reversible archive, restore, audit, and detail reload work");

    logStep("Checking native Personal Ops persistence, validation, and audit boundaries");
    const rejectPersonalOpsCsrf = await requestJson(server.baseUrl, cookieJar, "/api/personal/ops", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        secondaryFamily: "captures",
        input: {
          rawText: "This Capture must be rejected before persistence."
        }
      })
    });
    assert(
      rejectPersonalOpsCsrf.response.status === 403 && !rejectPersonalOpsCsrf.payload?.ok,
      `Native Personal Ops POST accepted a missing CSRF header: ${JSON.stringify(rejectPersonalOpsCsrf.payload)}`
    );
    pass("Secondary Personal Ops mutations reject missing CSRF proof");

    const initialPersonalOpsState = await requestJson(server.baseUrl, cookieJar, "/api/personal/ops");
    assert(
      initialPersonalOpsState.response.ok &&
        initialPersonalOpsState.payload?.ok &&
        initialPersonalOpsState.payload.state?.schemaVersion === 2 &&
        initialPersonalOpsState.payload.state.goals?.length === migratedV1Seed.goals.length &&
        initialPersonalOpsState.payload.state.decisions?.length === migratedV1Seed.decisions.length &&
        initialPersonalOpsState.payload.state.obligations?.length === migratedV1Seed.obligations.length &&
        initialPersonalOpsState.payload.state.followUps?.length === migratedV1Seed.followUps.length &&
        initialPersonalOpsState.payload.state.routines?.length === 0 &&
        initialPersonalOpsState.payload.state.captures?.length === 0 &&
        initialPersonalOpsState.payload.state.templates?.length === 0,
      `Native Personal Ops state did not load: ${JSON.stringify(initialPersonalOpsState.payload)}`
    );
    assert(
      (await readFile(personalOpsDataPath, "utf8")) === migratedV1SeedJson,
      "Reading schema v1 through the Personal Ops API wrote schema v2 before a successful mutation"
    );
    pass("Schema v1 reads return an additive schema v2 view with all core counts preserved and no disk write");

    const nativeGoalTitle = `${testRunId}-native-goal`;
    const createNativeGoal = await requestJson(server.baseUrl, cookieJar, "/api/personal/ops", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "goals",
        input: {
          title: nativeGoalTitle,
          outcome: "Prove that a native Personal Ops Goal survives an isolated reload.",
          domain: "Personal Admin",
          lifecycle: "active",
          health: "healthy",
          review: "not_reviewed",
          cadence: "current",
          priority: "high",
          targetPeriod: "Regression checkpoint",
          keyResults: [
            {
              title: "Exercise the native persistence boundary",
              measure: "verified API flow",
              currentValue: 0,
              targetValue: 1,
              complete: false
            }
          ]
        }
      })
    });
    assert(
      createNativeGoal.response.ok && createNativeGoal.payload?.ok && createNativeGoal.payload?.created,
      `Native Goal create failed: ${JSON.stringify(createNativeGoal.payload)}`
    );
    const nativeGoal = createNativeGoal.payload.item;
    assert(nativeGoal?.id && nativeGoal.objectType === "goal", "Native Goal response was missing its typed object");

    const migratedPersonalOpsFile = JSON.parse(await readFile(personalOpsDataPath, "utf8"));
    assert(
      migratedPersonalOpsFile.schemaVersion === 2 &&
        migratedPersonalOpsFile.goals?.length === migratedV1Seed.goals.length + 1 &&
        migratedPersonalOpsFile.decisions?.length === migratedV1Seed.decisions.length &&
        migratedPersonalOpsFile.obligations?.length === migratedV1Seed.obligations.length &&
        migratedPersonalOpsFile.followUps?.length === migratedV1Seed.followUps.length &&
        migratedPersonalOpsFile.routines?.length === 0 &&
        migratedPersonalOpsFile.captures?.length === 0 &&
        migratedPersonalOpsFile.templates?.length === 0 &&
        migratedPersonalOpsFile.auditEvents?.filter(
          (event) => event.action === "personal_ops.schema_migrated_v1_to_v2"
        ).length === 1,
      `The first successful Personal Ops write did not persist one additive migration with preserved counts: ${JSON.stringify(migratedPersonalOpsFile)}`
    );
    pass("The first successful Personal Ops write persists schema v2 once, preserves v1 counts, and records migration audit");

    const updatedNativeGoalTitle = `${nativeGoalTitle}-updated`;
    const updateNativeGoal = await requestJson(server.baseUrl, cookieJar, "/api/personal/ops", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "goals",
        id: nativeGoal.id,
        expectedUpdatedAt: nativeGoal.updatedAt,
        patch: {
          title: updatedNativeGoalTitle,
          description: "Updated through the optimistic-concurrency API."
        }
      })
    });
    assert(
      updateNativeGoal.response.ok && updateNativeGoal.payload?.item?.title === updatedNativeGoalTitle,
      `Native Goal update failed: ${JSON.stringify(updateNativeGoal.payload)}`
    );
    const updatedNativeGoal = updateNativeGoal.payload.item;

    const rejectStaleNativeGoal = await requestJson(server.baseUrl, cookieJar, "/api/personal/ops", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "goals",
        id: nativeGoal.id,
        expectedUpdatedAt: nativeGoal.updatedAt,
        patch: { title: `${nativeGoalTitle}-stale-overwrite` }
      })
    });
    assert(
      rejectStaleNativeGoal.response.status === 409 && rejectStaleNativeGoal.payload?.code === "stale",
      `Native Personal Ops accepted a stale overwrite: ${JSON.stringify(rejectStaleNativeGoal.payload)}`
    );
    pass("Native Goal create/update flow enforces optimistic concurrency");

    const legacyDecisionCandidateTitle = `${testRunId}-legacy-decision-candidate`;
    const createLegacyDecisionCandidate = await requestJson(
      server.baseUrl,
      cookieJar,
      "/api/personal/records",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken
        },
        body: JSON.stringify({
          domain: "notes-docs",
          title: legacyDecisionCandidateTitle,
          className: "decision",
          status: "draft",
          body: "Regression decision candidate preserved as source provenance."
        })
      }
    );
    assert(
      createLegacyDecisionCandidate.response.ok && createLegacyDecisionCandidate.payload?.ok,
      `Legacy Decision candidate create failed: ${JSON.stringify(createLegacyDecisionCandidate.payload)}`
    );
    const legacyDecisionCandidate = createLegacyDecisionCandidate.payload.items?.find(
      (item) => item.title === legacyDecisionCandidateTitle && item.className === "decision"
    );
    assert(legacyDecisionCandidate?.id, "Legacy Decision candidate was not returned for explicit conversion coverage");

    const decisionConversionKey = `${testRunId}-decision-conversion`;
    const nativeDecisionInput = {
      title: `${testRunId}-native-decision`,
      question: "Should this explicit legacy candidate become a durable Personal Ops Decision?",
      domain: "Personal Admin",
      lifecycle: "active",
      decisionState: "open",
      reversibility: "reversible",
      risk: "low",
      legacySource: {
        record: {
          id: legacyDecisionCandidate.id,
          domain: legacyDecisionCandidate.domain,
          className: legacyDecisionCandidate.className,
          status: legacyDecisionCandidate.status,
          title: legacyDecisionCandidate.title,
          createdAt: legacyDecisionCandidate.createdAt,
          updatedAt: legacyDecisionCandidate.updatedAt
        },
        conversionConfirmed: true,
        conversionKey: decisionConversionKey
      }
    };
    const createNativeDecision = await requestJson(server.baseUrl, cookieJar, "/api/personal/ops", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ family: "decisions", input: nativeDecisionInput })
    });
    assert(
      createNativeDecision.response.ok &&
        createNativeDecision.payload?.created === true &&
        createNativeDecision.payload?.mapping?.legacyPersonalRecordId === legacyDecisionCandidate.id,
      `Explicit Decision conversion failed: ${JSON.stringify(createNativeDecision.payload)}`
    );
    const nativeDecision = createNativeDecision.payload.item;

    const replayNativeDecisionConversion = await requestJson(server.baseUrl, cookieJar, "/api/personal/ops", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ family: "decisions", input: nativeDecisionInput })
    });
    assert(
      replayNativeDecisionConversion.response.ok &&
        replayNativeDecisionConversion.payload?.created === false &&
        replayNativeDecisionConversion.payload?.item?.id === nativeDecision.id,
      `Replayed Decision conversion was not idempotent: ${JSON.stringify(replayNativeDecisionConversion.payload)}`
    );

    const decideNativeDecision = await requestJson(server.baseUrl, cookieJar, "/api/personal/ops", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "decisions",
        id: nativeDecision.id,
        expectedUpdatedAt: nativeDecision.updatedAt,
        patch: {
          decisionState: "decided",
          finalDecision: "Keep the source record intact and file one linked durable Decision.",
          rationale: "This preserves provenance without a destructive rewrite."
        }
      })
    });
    assert(
      decideNativeDecision.response.ok &&
        decideNativeDecision.payload?.item?.decisionState === "decided" &&
        decideNativeDecision.payload?.item?.lifecycle === "complete",
      `Native Decision update failed: ${JSON.stringify(decideNativeDecision.payload)}`
    );
    pass("Explicit legacy Decision conversion is typed, idempotent, and preserves its source mapping");

    const nativeObligationTitle = `${testRunId}-native-obligation`;
    const obligationEvidenceLabel = "Regression completion evidence";
    const obligationCriterionLabel = "Regression acceptance criterion";
    const createNativeObligation = await requestJson(server.baseUrl, cookieJar, "/api/personal/ops", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "obligations",
        input: {
          title: nativeObligationTitle,
          consequence: "The checkpoint is incomplete if evidence is missing.",
          lifecycle: "active",
          obligationState: "open",
          priority: "high",
          requiredEvidence: [
            { label: obligationEvidenceLabel, required: true, state: "missing" }
          ],
          completionCriteria: [
            { label: obligationCriterionLabel, satisfied: false }
          ]
        }
      })
    });
    assert(
      createNativeObligation.response.ok && createNativeObligation.payload?.created,
      `Native Obligation create failed: ${JSON.stringify(createNativeObligation.payload)}`
    );
    const nativeObligation = createNativeObligation.payload.item;

    const rejectIncompleteObligation = await requestJson(server.baseUrl, cookieJar, "/api/personal/ops", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "obligations",
        id: nativeObligation.id,
        expectedUpdatedAt: nativeObligation.updatedAt,
        patch: { obligationState: "complete" }
      })
    });
    assert(
      rejectIncompleteObligation.response.status === 400 &&
        rejectIncompleteObligation.payload?.code === "validation" &&
        rejectIncompleteObligation.payload?.fieldErrors?.requiredEvidence,
      `Obligation completed without required evidence: ${JSON.stringify(rejectIncompleteObligation.payload)}`
    );

    const completeNativeObligation = await requestJson(server.baseUrl, cookieJar, "/api/personal/ops", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "obligations",
        id: nativeObligation.id,
        expectedUpdatedAt: nativeObligation.updatedAt,
        patch: {
          obligationState: "complete",
          requiredEvidence: [
            { label: obligationEvidenceLabel, required: true, state: "verified" }
          ],
          completionCriteria: [
            { label: obligationCriterionLabel, satisfied: true }
          ],
          completionNote: "Evidence and completion criteria were verified by the regression harness."
        }
      })
    });
    assert(
      completeNativeObligation.response.ok &&
        completeNativeObligation.payload?.item?.obligationState === "complete" &&
        completeNativeObligation.payload?.item?.lifecycle === "complete",
      `Evidence-gated Obligation completion failed: ${JSON.stringify(completeNativeObligation.payload)}`
    );
    pass("Obligation completion is blocked until evidence and criteria are satisfied");

    const nativeFollowUpTitle = `${testRunId}-people-follow-up`;
    const createNativeFollowUp = await requestJson(server.baseUrl, cookieJar, "/api/personal/ops", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "followUps",
        input: {
          title: nativeFollowUpTitle,
          followUpType: "person_check_in",
          context: "Confirm that People-linked work records an outcome before completion.",
          lifecycle: "active",
          followUpState: "open",
          priority: "high",
          sourceRefs: [
            {
              module: "people",
              objectType: "person",
              objectId: `${testRunId}-person-source`,
              label: "Regression person source"
            }
          ]
        }
      })
    });
    assert(
      createNativeFollowUp.response.ok && createNativeFollowUp.payload?.created,
      `Native Follow-up create failed: ${JSON.stringify(createNativeFollowUp.payload)}`
    );
    const nativeFollowUp = createNativeFollowUp.payload.item;

    const rejectOutcomeLessFollowUp = await requestJson(server.baseUrl, cookieJar, "/api/personal/ops", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "followUps",
        id: nativeFollowUp.id,
        expectedUpdatedAt: nativeFollowUp.updatedAt,
        patch: { followUpState: "complete" }
      })
    });
    assert(
      rejectOutcomeLessFollowUp.response.status === 400 &&
        rejectOutcomeLessFollowUp.payload?.code === "validation" &&
        rejectOutcomeLessFollowUp.payload?.fieldErrors?.outcome,
      `People-linked Follow-up completed without an outcome: ${JSON.stringify(rejectOutcomeLessFollowUp.payload)}`
    );

    const completeNativeFollowUp = await requestJson(server.baseUrl, cookieJar, "/api/personal/ops", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "followUps",
        id: nativeFollowUp.id,
        expectedUpdatedAt: nativeFollowUp.updatedAt,
        patch: {
          followUpState: "complete",
          outcome: "The People-linked follow-up outcome was recorded explicitly."
        }
      })
    });
    assert(
      completeNativeFollowUp.response.ok &&
        completeNativeFollowUp.payload?.item?.followUpState === "complete" &&
        completeNativeFollowUp.payload?.item?.lifecycle === "complete",
      `Outcome-gated Follow-up completion failed: ${JSON.stringify(completeNativeFollowUp.payload)}`
    );
    pass("High-priority People-linked Follow-up completion requires an explicit outcome");

    const archiveNativeGoal = await requestJson(server.baseUrl, cookieJar, "/api/personal/ops", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "goals",
        id: updatedNativeGoal.id,
        expectedUpdatedAt: updatedNativeGoal.updatedAt,
        patch: {
          lifecycle: "archived",
          archiveReason: "Regression soft-archive verification"
        }
      })
    });
    assert(
      archiveNativeGoal.response.ok &&
        archiveNativeGoal.payload?.item?.lifecycle === "archived" &&
        archiveNativeGoal.payload?.item?.archivedAt &&
        archiveNativeGoal.payload?.item?.archiveReason === "Regression soft-archive verification",
      `Native Goal soft archive failed: ${JSON.stringify(archiveNativeGoal.payload)}`
    );

    const reloadedNativeGoal = await requestJson(
      server.baseUrl,
      cookieJar,
      `/api/personal/ops?family=goals&id=${encodeURIComponent(updatedNativeGoal.id)}`
    );
    assert(
      reloadedNativeGoal.response.ok &&
        reloadedNativeGoal.payload?.item?.title === updatedNativeGoalTitle &&
        reloadedNativeGoal.payload?.item?.lifecycle === "archived" &&
        reloadedNativeGoal.payload?.item?.history?.some((entry) => entry.action === "goal.archived"),
      `Soft-archived Goal did not persist after reload: ${JSON.stringify(reloadedNativeGoal.payload)}`
    );

    const reloadedPersonalOpsState = await requestJson(server.baseUrl, cookieJar, "/api/personal/ops");
    const persistedPersonalOpsState = reloadedPersonalOpsState.payload?.state;
    assert(
      reloadedPersonalOpsState.response.ok &&
        persistedPersonalOpsState?.goals?.some((item) => item.id === nativeGoal.id && item.lifecycle === "archived") &&
        persistedPersonalOpsState?.decisions?.some((item) => item.id === nativeDecision.id && item.decisionState === "decided") &&
        persistedPersonalOpsState?.obligations?.some((item) => item.id === nativeObligation.id && item.obligationState === "complete") &&
        persistedPersonalOpsState?.followUps?.some((item) => item.id === nativeFollowUp.id && item.followUpState === "complete") &&
        persistedPersonalOpsState?.legacyMappings?.some(
          (mapping) =>
            mapping.legacyPersonalRecordId === legacyDecisionCandidate.id &&
            mapping.conversionKey === decisionConversionKey &&
            mapping.nativeRef?.objectId === nativeDecision.id
        ) &&
        persistedPersonalOpsState?.auditEvents?.length >= 9,
      `Native Personal Ops state did not preserve objects, mapping, and audit events: ${JSON.stringify(persistedPersonalOpsState)}`
    );

    const archivedGoalPage = await requestText(
      server.baseUrl,
      cookieJar,
      `/admin/personal/goals?filter=archived&selected=${encodeURIComponent(nativeGoal.id)}&reload=${Date.now()}`
    );
    assert(archivedGoalPage.response.ok, `Archived Goals route failed: ${describeStatus(archivedGoalPage.response)}`);
    assert(archivedGoalPage.body.includes(updatedNativeGoalTitle), "Soft-archived Goal was missing after authenticated route reload");
    pass("Native Personal Ops soft archive preserves object history, audit, provenance, and route reload state");

    logStep("Checking advanced Personal Ops definitions, previews, confirmations, and fail-closed boundaries");
    const personalOpsPost = (body) => requestJson(server.baseUrl, cookieJar, "/api/personal/ops", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify(body)
    });
    const personalOpsPatch = (body) => requestJson(server.baseUrl, cookieJar, "/api/personal/ops", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify(body)
    });
    const readAdvancedPersonalOpsState = async () => {
      const result = await requestJson(server.baseUrl, cookieJar, "/api/personal/ops");
      assert(result.response.ok && result.payload?.ok, `Advanced Personal Ops state failed to load: ${JSON.stringify(result.payload)}`);
      return result.payload.state;
    };

    const routineReadyRuleId = `${testRunId}-routine-ready`;
    const routineDisabledRuleId = `${testRunId}-routine-disabled`;
    const routineConditionalRuleId = `${testRunId}-routine-conditional`;
    const routineExternalRuleId = `${testRunId}-routine-external`;
    const routineCreateInput = {
      title: `${testRunId}-monthly-admin-routine`,
      summary: "Manual monthly rhythm with previewed, confirmed, owner-native outputs.",
      lifecycle: "draft",
      cadence: "current",
      cadenceRule: {
        frequency: "monthly",
        interval: 1,
        timezone: "America/New_York",
        weekdays: [],
        reminderWindowDays: 3,
        trigger: "manual",
        skipBehavior: "require_decision",
        autoCreateNext: false
      },
      generationRules: [
        {
          id: routineReadyRuleId,
          label: "Create the monthly follow-up",
          enabled: true,
          conditions: [],
          destination: {
            module: "personal_ops",
            family: "followUps",
            input: {
              title: `${testRunId}-routine-generated-follow-up`,
              followUpType: "recurring_cadence",
              context: "Created only after a confirmed manual Routine preview."
            }
          }
        },
        {
          id: routineDisabledRuleId,
          label: "Disabled obligation definition",
          enabled: false,
          conditions: [],
          destination: {
            module: "personal_ops",
            family: "obligations",
            input: {
              title: `${testRunId}-disabled-routine-obligation`,
              consequence: "A disabled rule must never create this obligation."
            }
          }
        },
        {
          id: routineConditionalRuleId,
          label: "Condition-gated decision definition",
          enabled: true,
          conditions: ["finance_context_ready"],
          destination: {
            module: "personal_ops",
            family: "decisions",
            input: {
              title: `${testRunId}-conditional-routine-decision`,
              question: "Should an unevaluated condition be allowed to create work?"
            }
          }
        },
        {
          id: routineExternalRuleId,
          label: "Finance-owned close definition",
          enabled: true,
          conditions: [],
          destination: {
            module: "finance",
            objectType: "monthly_review",
            label: "Finance Monthly Review"
          }
        }
      ]
    };
    const createRoutine = await personalOpsPost({ secondaryFamily: "routines", input: routineCreateInput });
    assert(
      createRoutine.response.ok &&
        createRoutine.payload?.created === true &&
        createRoutine.payload.item?.objectType === "routine" &&
        createRoutine.payload.item?.lifecycle === "draft",
      `Routine create failed: ${JSON.stringify(createRoutine.payload)}`
    );
    const routineDraft = createRoutine.payload.item;

    const noOpRoutine = await personalOpsPatch({
      secondaryFamily: "routines",
      id: routineDraft.id,
      expectedUpdatedAt: routineDraft.updatedAt,
      patch: { title: routineDraft.title }
    });
    assert(
      noOpRoutine.response.status === 400 &&
        noOpRoutine.payload?.code === "validation" &&
        noOpRoutine.payload?.fieldErrors?.patch,
      `Routine no-op update was accepted: ${JSON.stringify(noOpRoutine.payload)}`
    );

    const inactiveRoutineStateBeforePreview = await readAdvancedPersonalOpsState();
    const inactiveRoutinePreview = await personalOpsPost({
      operation: "routine.preview_run",
      id: routineDraft.id,
      input: { ruleIds: [routineReadyRuleId] }
    });
    assert(
      inactiveRoutinePreview.response.ok &&
        inactiveRoutinePreview.payload?.preview?.confirmableCount === 0 &&
        inactiveRoutinePreview.payload.preview.entries?.[0]?.disabledReason?.includes("Activate"),
      `Draft Routine preview did not fail closed: ${JSON.stringify(inactiveRoutinePreview.payload)}`
    );
    const inactiveRoutineStateAfterPreview = await readAdvancedPersonalOpsState();
    assert(
      inactiveRoutineStateAfterPreview.routines?.find((item) => item.id === routineDraft.id)?.updatedAt === routineDraft.updatedAt &&
        inactiveRoutineStateAfterPreview.auditEvents?.length === inactiveRoutineStateBeforePreview.auditEvents?.length &&
        inactiveRoutineStateAfterPreview.followUps?.length === inactiveRoutineStateBeforePreview.followUps?.length,
      "Draft Routine preview mutated the isolated Personal Ops store"
    );

    const activateRoutine = await personalOpsPatch({
      secondaryFamily: "routines",
      id: routineDraft.id,
      expectedUpdatedAt: routineDraft.updatedAt,
      patch: { lifecycle: "active" }
    });
    assert(
      activateRoutine.response.ok && activateRoutine.payload?.item?.lifecycle === "active",
      `Routine activation failed: ${JSON.stringify(activateRoutine.payload)}`
    );
    const activeRoutine = activateRoutine.payload.item;

    const staleRoutine = await personalOpsPatch({
      secondaryFamily: "routines",
      id: routineDraft.id,
      expectedUpdatedAt: routineDraft.updatedAt,
      patch: { summary: "This stale overwrite must fail." }
    });
    assert(
      staleRoutine.response.status === 409 && staleRoutine.payload?.code === "stale",
      `Routine stale update was accepted: ${JSON.stringify(staleRoutine.payload)}`
    );

    const routineStateBeforePreview = await readAdvancedPersonalOpsState();
    const activeRoutinePreview = await personalOpsPost({
      operation: "routine.preview_run",
      id: activeRoutine.id,
      input: {}
    });
    const activeRoutineEntries = activeRoutinePreview.payload?.preview?.entries || [];
    assert(
      activeRoutinePreview.response.ok &&
        activeRoutinePreview.payload?.preview?.confirmableCount === 1 &&
        activeRoutinePreview.payload.preview.disabledCount === 3 &&
        activeRoutineEntries.find((entry) => entry.ruleId === routineReadyRuleId)?.canCreate === true &&
        activeRoutineEntries.find((entry) => entry.ruleId === routineDisabledRuleId)?.disabledReason?.includes("disabled") &&
        activeRoutineEntries.find((entry) => entry.ruleId === routineConditionalRuleId)?.disabledReason?.includes("Condition evaluation") &&
        activeRoutineEntries.find((entry) => entry.ruleId === routineExternalRuleId)?.disabledReason?.includes("not connected"),
      `Routine preview did not expose ready, disabled, conditional, and cross-module boundaries: ${JSON.stringify(activeRoutinePreview.payload)}`
    );
    const routineStateAfterPreview = await readAdvancedPersonalOpsState();
    assert(
      routineStateAfterPreview.routines?.find((item) => item.id === activeRoutine.id)?.updatedAt === activeRoutine.updatedAt &&
        routineStateAfterPreview.auditEvents?.length === routineStateBeforePreview.auditEvents?.length &&
        routineStateAfterPreview.followUps?.length === routineStateBeforePreview.followUps?.length,
      "Active Routine preview wrote history, audit, or generated work"
    );

    const pauseRoutine = await personalOpsPatch({
      secondaryFamily: "routines",
      id: activeRoutine.id,
      expectedUpdatedAt: activeRoutine.updatedAt,
      patch: { cadence: "paused" }
    });
    assert(
      pauseRoutine.response.ok && pauseRoutine.payload?.item?.cadence === "paused",
      `Routine pause failed: ${JSON.stringify(pauseRoutine.payload)}`
    );
    const pausedRoutine = pauseRoutine.payload.item;
    const pausedRoutinePreview = await personalOpsPost({
      operation: "routine.preview_run",
      id: pausedRoutine.id,
      input: { ruleIds: [routineReadyRuleId] }
    });
    assert(
      pausedRoutinePreview.response.ok &&
        pausedRoutinePreview.payload?.preview?.confirmableCount === 0 &&
        pausedRoutinePreview.payload.preview.entries?.[0]?.disabledReason?.includes("Paused"),
      `Paused Routine preview did not fail closed: ${JSON.stringify(pausedRoutinePreview.payload)}`
    );

    const resumeRoutine = await personalOpsPatch({
      secondaryFamily: "routines",
      id: pausedRoutine.id,
      expectedUpdatedAt: pausedRoutine.updatedAt,
      patch: { cadence: "current" }
    });
    assert(
      resumeRoutine.response.ok && resumeRoutine.payload?.item?.cadence === "current",
      `Routine resume failed: ${JSON.stringify(resumeRoutine.payload)}`
    );
    const resumedRoutine = resumeRoutine.payload.item;

    const blockedRoutineState = await readAdvancedPersonalOpsState();
    const rejectBlockedRoutineRun = await personalOpsPost({
      operation: "routine.confirm_run",
      id: resumedRoutine.id,
      input: {
        ruleIds: [routineConditionalRuleId, routineExternalRuleId],
        expectedUpdatedAt: resumedRoutine.updatedAt,
        operationKey: `${testRunId}-routine-blocked-confirm`,
        confirmed: true
      }
    });
    assert(
      rejectBlockedRoutineRun.response.status === 400 && rejectBlockedRoutineRun.payload?.code === "validation",
      `Condition/cross-module-only Routine run did not fail closed: ${JSON.stringify(rejectBlockedRoutineRun.payload)}`
    );
    const afterBlockedRoutineState = await readAdvancedPersonalOpsState();
    assert(
      afterBlockedRoutineState.followUps?.length === blockedRoutineState.followUps?.length &&
        afterBlockedRoutineState.decisions?.length === blockedRoutineState.decisions?.length &&
        afterBlockedRoutineState.routines?.find((item) => item.id === resumedRoutine.id)?.runHistory?.length === 0,
      "Rejected Routine confirmation created work or run history"
    );

    const readyRoutinePreview = await personalOpsPost({
      operation: "routine.preview_run",
      id: resumedRoutine.id,
      input: { ruleIds: [routineReadyRuleId] }
    });
    assert(
      readyRoutinePreview.response.ok && readyRoutinePreview.payload?.preview?.confirmableCount === 1,
      `Ready Routine preview failed: ${JSON.stringify(readyRoutinePreview.payload)}`
    );
    const routineOperationKey = `${testRunId}-routine-confirm`;
    const routineConfirmBody = {
      operation: "routine.confirm_run",
      id: resumedRoutine.id,
      input: {
        ruleIds: [routineReadyRuleId],
        expectedUpdatedAt: readyRoutinePreview.payload.preview.routineUpdatedAt,
        operationKey: routineOperationKey,
        confirmed: true
      }
    };
    const confirmRoutineRun = await personalOpsPost(routineConfirmBody);
    assert(
      confirmRoutineRun.response.ok &&
        confirmRoutineRun.payload?.created === true &&
        confirmRoutineRun.payload.run?.generatedRefs?.length === 1 &&
        confirmRoutineRun.payload.item?.runHistory?.length === 1,
      `Confirmed Routine run failed: ${JSON.stringify(confirmRoutineRun.payload)}`
    );
    const confirmedRoutine = confirmRoutineRun.payload.item;
    const afterRoutineConfirmState = await readAdvancedPersonalOpsState();
    const routineGeneratedFollowUp = afterRoutineConfirmState.followUps?.find(
      (item) => item.title === `${testRunId}-routine-generated-follow-up`
    );
    assert(
      routineGeneratedFollowUp?.sourceRefs?.some(
        (ref) => ref.module === "personal_ops" && ref.objectType === "routine" && ref.objectId === resumedRoutine.id
      ),
      `Routine-generated Follow-up did not retain Routine provenance: ${JSON.stringify(routineGeneratedFollowUp)}`
    );

    const replayRoutineRun = await personalOpsPost(routineConfirmBody);
    assert(
      replayRoutineRun.response.ok &&
        replayRoutineRun.payload?.created === false &&
        replayRoutineRun.payload.run?.id === confirmRoutineRun.payload.run?.id,
      `Routine confirmation replay was not idempotent: ${JSON.stringify(replayRoutineRun.payload)}`
    );
    const mismatchRoutineRun = await personalOpsPost({
      ...routineConfirmBody,
      input: { ...routineConfirmBody.input, ruleIds: [routineReadyRuleId, routineDisabledRuleId] }
    });
    assert(
      mismatchRoutineRun.response.status === 409 && mismatchRoutineRun.payload?.code === "conflict",
      `Routine operation-key mismatch was not rejected: ${JSON.stringify(mismatchRoutineRun.payload)}`
    );

    const archiveRoutine = await personalOpsPatch({
      secondaryFamily: "routines",
      id: confirmedRoutine.id,
      expectedUpdatedAt: confirmedRoutine.updatedAt,
      patch: {
        lifecycle: "archived",
        archiveConfirmed: true,
        archiveReason: "Regression Routine archive boundary"
      }
    });
    assert(
      archiveRoutine.response.ok &&
        archiveRoutine.payload?.item?.lifecycle === "archived" &&
        archiveRoutine.payload.item.archiveReason === "Regression Routine archive boundary",
      `Routine archive failed: ${JSON.stringify(archiveRoutine.payload)}`
    );
    const restoreRoutine = await personalOpsPatch({
      secondaryFamily: "routines",
      id: confirmedRoutine.id,
      expectedUpdatedAt: archiveRoutine.payload.item.updatedAt,
      patch: { lifecycle: "active", restoreConfirmed: true }
    });
    assert(
      restoreRoutine.response.ok &&
        restoreRoutine.payload?.item?.lifecycle === "active" &&
        !restoreRoutine.payload.item.archivedAt,
      `Routine restore failed: ${JSON.stringify(restoreRoutine.payload)}`
    );
    pass("Routine CRUD, no-op/stale guards, pure previews, fail-closed states, idempotent confirmation, provenance, archive, and restore work");

    const captureRawText =
      "Confirm the contractor rate before sending the invoice. File the durable decision, send a follow-up, and retain an evidence obligation.";
    const captureSourceNoteId = `${testRunId}-capture-source-note`;
    const createCapture = await personalOpsPost({
      secondaryFamily: "captures",
      input: {
        title: `${testRunId}-contractor-rate-capture`,
        rawText: captureRawText,
        domain: "Finance",
        triageState: "untriaged",
        source: {
          kind: "linked_object",
          label: "Contractor rate source note",
          sourceRef: {
            module: "notes",
            objectType: "note",
            objectId: captureSourceNoteId,
            label: "Contractor rate source note"
          }
        }
      }
    });
    assert(
      createCapture.response.ok &&
        createCapture.payload?.created === true &&
        createCapture.payload.item?.objectType === "capture_item" &&
        createCapture.payload.item?.source?.kind === "linked_object" &&
        createCapture.payload.item.source.sourceRef?.objectId === captureSourceNoteId &&
        createCapture.payload.item.source.sourceRef?.route?.includes("/admin/notes/"),
      `Linked-object Capture create failed: ${JSON.stringify(createCapture.payload)}`
    );
    const captureDraft = createCapture.payload.item;

    const noOpCapture = await personalOpsPatch({
      secondaryFamily: "captures",
      id: captureDraft.id,
      expectedUpdatedAt: captureDraft.updatedAt,
      patch: { title: captureDraft.title }
    });
    assert(
      noOpCapture.response.status === 400 && noOpCapture.payload?.fieldErrors?.patch,
      `Capture no-op update was accepted: ${JSON.stringify(noOpCapture.payload)}`
    );
    const mutateCaptureRawText = await personalOpsPatch({
      secondaryFamily: "captures",
      id: captureDraft.id,
      expectedUpdatedAt: captureDraft.updatedAt,
      patch: { rawText: "Mutated raw source" }
    });
    assert(
      mutateCaptureRawText.response.status === 400 &&
        mutateCaptureRawText.payload?.code === "validation" &&
        mutateCaptureRawText.payload?.fieldErrors?.rawText,
      `Capture raw text mutation was accepted: ${JSON.stringify(mutateCaptureRawText.payload)}`
    );

    const updateCapture = await personalOpsPatch({
      secondaryFamily: "captures",
      id: captureDraft.id,
      expectedUpdatedAt: captureDraft.updatedAt,
      patch: {
        title: `${captureDraft.title}-ready`,
        triageState: "ready",
        missingContext: []
      }
    });
    assert(
      updateCapture.response.ok &&
        updateCapture.payload?.item?.triageState === "ready" &&
        updateCapture.payload.item.rawText === captureRawText,
      `Capture update failed or changed raw text: ${JSON.stringify(updateCapture.payload)}`
    );
    const readyCapture = updateCapture.payload.item;
    const staleCapture = await personalOpsPatch({
      secondaryFamily: "captures",
      id: captureDraft.id,
      expectedUpdatedAt: captureDraft.updatedAt,
      patch: { title: "Stale Capture overwrite" }
    });
    assert(
      staleCapture.response.status === 409 && staleCapture.payload?.code === "stale",
      `Capture stale update was accepted: ${JSON.stringify(staleCapture.payload)}`
    );

    const archiveCapture = await personalOpsPatch({
      secondaryFamily: "captures",
      id: readyCapture.id,
      expectedUpdatedAt: readyCapture.updatedAt,
      patch: {
        lifecycle: "archived",
        archiveConfirmed: true,
        archiveReason: "Regression Capture archive boundary"
      }
    });
    assert(
      archiveCapture.response.ok && archiveCapture.payload?.item?.lifecycle === "archived",
      `Capture archive failed: ${JSON.stringify(archiveCapture.payload)}`
    );
    const restoreCapture = await personalOpsPatch({
      secondaryFamily: "captures",
      id: readyCapture.id,
      expectedUpdatedAt: archiveCapture.payload.item.updatedAt,
      patch: { lifecycle: "active", restoreConfirmed: true }
    });
    assert(
      restoreCapture.response.ok &&
        restoreCapture.payload?.item?.lifecycle === "active" &&
        restoreCapture.payload.item.rawText === captureRawText,
      `Capture restore failed: ${JSON.stringify(restoreCapture.payload)}`
    );
    const restoredCapture = restoreCapture.payload.item;

    const captureDecisionOutput = {
      id: `${testRunId}-capture-output-decision`,
      excerpt: "Confirm the contractor rate before sending the invoice.",
      destination: {
        module: "personal_ops",
        family: "decisions",
        input: {
          title: `${testRunId}-capture-generated-decision`,
          question: "What contractor rate should be confirmed before invoicing?"
        }
      }
    };
    const captureFollowUpOutput = {
      id: `${testRunId}-capture-output-follow-up`,
      excerpt: "send a follow-up",
      destination: {
        module: "personal_ops",
        family: "followUps",
        input: {
          title: `${testRunId}-capture-generated-follow-up`,
          followUpType: "finance_action",
          context: "Confirm the rate before the invoice is sent."
        }
      }
    };
    const captureObligationOutput = {
      id: `${testRunId}-capture-output-obligation`,
      excerpt: "retain an evidence obligation",
      destination: {
        module: "personal_ops",
        family: "obligations",
        input: {
          title: `${testRunId}-capture-generated-obligation`,
          consequence: "Invoice evidence would be incomplete without this retained obligation."
        }
      }
    };
    const captureExternalOutput = {
      id: `${testRunId}-capture-output-finance`,
      destination: {
        module: "finance",
        objectType: "transaction",
        label: "Invoice transaction"
      }
    };

    const captureStateBeforeBlockedConfirm = await readAdvancedPersonalOpsState();
    const mixedCapturePreview = await personalOpsPost({
      operation: "capture.preview_processing",
      id: restoredCapture.id,
      input: { outputs: [captureDecisionOutput, captureExternalOutput] }
    });
    assert(
      mixedCapturePreview.response.ok &&
        mixedCapturePreview.payload?.preview?.confirmableCount === 1 &&
        mixedCapturePreview.payload.preview.disabledCount === 1 &&
        mixedCapturePreview.payload.preview.entries?.find(
          (entry) => entry.outputId === captureExternalOutput.id
        )?.disabledReason?.includes("not connected"),
      `Mixed Capture preview did not disclose the cross-module boundary: ${JSON.stringify(mixedCapturePreview.payload)}`
    );
    const rejectMixedCaptureConfirm = await personalOpsPost({
      operation: "capture.confirm_processing",
      id: restoredCapture.id,
      input: {
        outputs: [captureDecisionOutput, captureExternalOutput],
        expectedUpdatedAt: mixedCapturePreview.payload.preview.captureUpdatedAt,
        operationKey: `${testRunId}-capture-mixed-confirm`,
        confirmed: true
      }
    });
    assert(
      rejectMixedCaptureConfirm.response.status === 400 && rejectMixedCaptureConfirm.payload?.code === "validation",
      `Mixed Capture confirmation did not fail atomically: ${JSON.stringify(rejectMixedCaptureConfirm.payload)}`
    );
    const captureStateAfterBlockedConfirm = await readAdvancedPersonalOpsState();
    assert(
      captureStateAfterBlockedConfirm.decisions?.length === captureStateBeforeBlockedConfirm.decisions?.length &&
        captureStateAfterBlockedConfirm.followUps?.length === captureStateBeforeBlockedConfirm.followUps?.length &&
        captureStateAfterBlockedConfirm.captures?.find((item) => item.id === restoredCapture.id)?.triageState === "ready",
      "Rejected mixed Capture confirmation partially created work or processed the source"
    );

    const captureOutputs = [captureDecisionOutput, captureFollowUpOutput, captureObligationOutput];
    const captureStateBeforePreview = await readAdvancedPersonalOpsState();
    const capturePreview = await personalOpsPost({
      operation: "capture.preview_processing",
      id: restoredCapture.id,
      input: { outputs: captureOutputs }
    });
    assert(
      capturePreview.response.ok &&
        capturePreview.payload?.preview?.rawText === captureRawText &&
        capturePreview.payload.preview.confirmableCount === 3 &&
        capturePreview.payload.preview.disabledCount === 0,
      `Capture split preview failed: ${JSON.stringify(capturePreview.payload)}`
    );
    const captureStateAfterPreview = await readAdvancedPersonalOpsState();
    assert(
      captureStateAfterPreview.captures?.find((item) => item.id === restoredCapture.id)?.updatedAt === restoredCapture.updatedAt &&
        captureStateAfterPreview.auditEvents?.length === captureStateBeforePreview.auditEvents?.length &&
        captureStateAfterPreview.decisions?.length === captureStateBeforePreview.decisions?.length &&
        captureStateAfterPreview.followUps?.length === captureStateBeforePreview.followUps?.length &&
        captureStateAfterPreview.obligations?.length === captureStateBeforePreview.obligations?.length,
      "Capture preview mutated the source, audit, or destination collections"
    );

    const captureOperationKey = `${testRunId}-capture-confirm`;
    const captureConfirmBody = {
      operation: "capture.confirm_processing",
      id: restoredCapture.id,
      input: {
        outputs: captureOutputs,
        expectedUpdatedAt: capturePreview.payload.preview.captureUpdatedAt,
        operationKey: captureOperationKey,
        confirmed: true
      }
    };
    const confirmCapture = await personalOpsPost(captureConfirmBody);
    assert(
      confirmCapture.response.ok &&
        confirmCapture.payload?.created === true &&
        confirmCapture.payload.item?.triageState === "processed" &&
        confirmCapture.payload.item.rawText === captureRawText &&
        confirmCapture.payload.action?.createdRefs?.length === 3,
      `Atomic Capture split confirmation failed: ${JSON.stringify(confirmCapture.payload)}`
    );
    const processedCapture = confirmCapture.payload.item;
    const afterCaptureConfirmState = await readAdvancedPersonalOpsState();
    const captureGeneratedObjects = [
      afterCaptureConfirmState.decisions?.find((item) => item.title === `${testRunId}-capture-generated-decision`),
      afterCaptureConfirmState.followUps?.find((item) => item.title === `${testRunId}-capture-generated-follow-up`),
      afterCaptureConfirmState.obligations?.find((item) => item.title === `${testRunId}-capture-generated-obligation`)
    ];
    assert(
      captureGeneratedObjects.every(
        (item) => item?.sourceRefs?.some(
          (ref) => ref.module === "personal_ops" && ref.objectType === "capture_item" && ref.objectId === processedCapture.id
        )
      ),
      `Capture-created objects did not all retain Capture provenance: ${JSON.stringify(captureGeneratedObjects)}`
    );

    const replayCapture = await personalOpsPost(captureConfirmBody);
    assert(
      replayCapture.response.ok &&
        replayCapture.payload?.created === false &&
        replayCapture.payload.action?.id === confirmCapture.payload.action?.id,
      `Capture confirmation replay was not idempotent: ${JSON.stringify(replayCapture.payload)}`
    );
    const mismatchCapture = await personalOpsPost({
      ...captureConfirmBody,
      input: {
        ...captureConfirmBody.input,
        outputs: [
          {
            ...captureDecisionOutput,
            destination: {
              ...captureDecisionOutput.destination,
              input: {
                ...captureDecisionOutput.destination.input,
                title: `${testRunId}-mismatched-capture-decision`
              }
            }
          },
          captureFollowUpOutput,
          captureObligationOutput
        ]
      }
    });
    assert(
      mismatchCapture.response.status === 409 && mismatchCapture.payload?.code === "conflict",
      `Capture operation-key mismatch was not rejected: ${JSON.stringify(mismatchCapture.payload)}`
    );

    const reopenProcessedCapture = await personalOpsPatch({
      secondaryFamily: "captures",
      id: processedCapture.id,
      expectedUpdatedAt: processedCapture.updatedAt,
      patch: { triageState: "ready" }
    });
    assert(
      reopenProcessedCapture.response.status === 400 &&
        reopenProcessedCapture.payload?.code === "validation" &&
        reopenProcessedCapture.payload?.fieldErrors?.triageState,
      `Processed Capture was reopened: ${JSON.stringify(reopenProcessedCapture.payload)}`
    );
    pass("Capture CRUD, immutable linked provenance, pure/atomic split previews, idempotency, mismatch, processed-state, archive, and restore guards work");

    const templateFieldId = `${testRunId}-template-field-title`;
    const templateRuleId = `${testRunId}-template-rule-manual`;
    const templateDefinitionId = `${testRunId}-template-definition-decision`;
    const templateDefinition = {
      id: templateDefinitionId,
      label: "File contractor rate decision",
      enabled: true,
      destination: {
        module: "personal_ops",
        family: "decisions",
        input: {
          title: "{{title}}",
          question: "What should be decided about {{title}}?",
          domain: "Finance"
        }
      }
    };
    const createTemplate = await personalOpsPost({
      secondaryFamily: "templates",
      input: {
        title: `${testRunId}-contractor-rate-template`,
        summary: "Draft definition for an explicitly confirmed owner-native Decision.",
        fields: [
          {
            id: templateFieldId,
            key: "title",
            label: "Decision title",
            type: "short_text",
            required: true
          }
        ],
        rules: [
          {
            id: templateRuleId,
            label: "Manual-only definition",
            enabled: true,
            when: "always"
          }
        ],
        generatedDefinitions: [templateDefinition]
      }
    });
    assert(
      createTemplate.response.ok &&
        createTemplate.payload?.created === true &&
        createTemplate.payload.item?.objectType === "template" &&
        createTemplate.payload.item?.lifecycle === "draft" &&
        createTemplate.payload.item?.availability === "draft",
      `Template draft create failed: ${JSON.stringify(createTemplate.payload)}`
    );
    const templateDraft = createTemplate.payload.item;

    const noOpTemplate = await personalOpsPatch({
      secondaryFamily: "templates",
      id: templateDraft.id,
      expectedUpdatedAt: templateDraft.updatedAt,
      patch: { title: templateDraft.title }
    });
    assert(
      noOpTemplate.response.status === 400 && noOpTemplate.payload?.fieldErrors?.patch,
      `Template no-op update was accepted: ${JSON.stringify(noOpTemplate.payload)}`
    );

    const templateValues = { title: `${testRunId}-templated-contractor-rate-decision` };
    const templateStateBeforeDraftTest = await readAdvancedPersonalOpsState();
    const draftTemplateTest = await personalOpsPost({
      operation: "template.test",
      id: templateDraft.id,
      input: { values: templateValues, definitionId: templateDefinitionId }
    });
    assert(
      draftTemplateTest.response.ok &&
        draftTemplateTest.payload?.preview?.confirmableCount === 0 &&
        draftTemplateTest.payload.preview.disabledCount === 1 &&
        draftTemplateTest.payload.preview.entries?.[0]?.disabledReason?.includes("draft") &&
        draftTemplateTest.payload.preview.entries?.[0]?.proposedInput?.title === templateValues.title,
      `Draft Template test did not honestly preview without availability: ${JSON.stringify(draftTemplateTest.payload)}`
    );
    const templateStateAfterDraftTest = await readAdvancedPersonalOpsState();
    assert(
      templateStateAfterDraftTest.templates?.find((item) => item.id === templateDraft.id)?.updatedAt === templateDraft.updatedAt &&
        templateStateAfterDraftTest.auditEvents?.length === templateStateBeforeDraftTest.auditEvents?.length &&
        templateStateAfterDraftTest.decisions?.length === templateStateBeforeDraftTest.decisions?.length,
      "Draft Template test wrote usage, audit, or a destination object"
    );

    const missingTemplateValueTest = await personalOpsPost({
      operation: "template.test",
      id: templateDraft.id,
      input: { values: {}, definitionId: templateDefinitionId }
    });
    assert(
      missingTemplateValueTest.response.ok &&
        missingTemplateValueTest.payload?.preview?.fieldErrors?.title &&
        missingTemplateValueTest.payload.preview.confirmableCount === 0,
      `Template required-field test did not return a non-writing field error: ${JSON.stringify(missingTemplateValueTest.payload)}`
    );

    const rejectTemplateActivation = await personalOpsPatch({
      secondaryFamily: "templates",
      id: templateDraft.id,
      expectedUpdatedAt: templateDraft.updatedAt,
      patch: { lifecycle: "active", availability: "active", health: "ready" }
    });
    assert(
      rejectTemplateActivation.response.status === 400 &&
        rejectTemplateActivation.payload?.code === "validation" &&
        rejectTemplateActivation.payload?.fieldErrors?.rules,
      `Template with unevaluated enabled rules was activated: ${JSON.stringify(rejectTemplateActivation.payload)}`
    );

    const activateTemplate = await personalOpsPatch({
      secondaryFamily: "templates",
      id: templateDraft.id,
      expectedUpdatedAt: templateDraft.updatedAt,
      patch: {
        lifecycle: "active",
        availability: "active",
        health: "ready",
        rules: [
          {
            id: templateRuleId,
            label: "Manual-only definition",
            enabled: false,
            when: "always"
          }
        ]
      }
    });
    assert(
      activateTemplate.response.ok &&
        activateTemplate.payload?.item?.lifecycle === "active" &&
        activateTemplate.payload.item.availability === "active" &&
        activateTemplate.payload.item.rules?.every((rule) => !rule.enabled),
      `Valid Template activation failed: ${JSON.stringify(activateTemplate.payload)}`
    );
    const activeTemplate = activateTemplate.payload.item;

    const staleTemplate = await personalOpsPatch({
      secondaryFamily: "templates",
      id: templateDraft.id,
      expectedUpdatedAt: templateDraft.updatedAt,
      patch: { summary: "This stale Template overwrite must fail." }
    });
    assert(
      staleTemplate.response.status === 409 && staleTemplate.payload?.code === "stale",
      `Template stale update was accepted: ${JSON.stringify(staleTemplate.payload)}`
    );

    const templateStateBeforeActiveTest = await readAdvancedPersonalOpsState();
    const activeTemplateTest = await personalOpsPost({
      operation: "template.test",
      id: activeTemplate.id,
      input: { values: templateValues, definitionId: templateDefinitionId }
    });
    assert(
      activeTemplateTest.response.ok &&
        activeTemplateTest.payload?.preview?.confirmableCount === 1 &&
        activeTemplateTest.payload.preview.disabledCount === 0 &&
        activeTemplateTest.payload.preview.entries?.[0]?.canCreate === true,
      `Active Template test did not expose one confirmable owner-native output: ${JSON.stringify(activeTemplateTest.payload)}`
    );
    const templateStateAfterActiveTest = await readAdvancedPersonalOpsState();
    assert(
      templateStateAfterActiveTest.templates?.find((item) => item.id === activeTemplate.id)?.updatedAt === activeTemplate.updatedAt &&
        templateStateAfterActiveTest.auditEvents?.length === templateStateBeforeActiveTest.auditEvents?.length &&
        templateStateAfterActiveTest.decisions?.length === templateStateBeforeActiveTest.decisions?.length,
      "Active Template test wrote usage, audit, or a destination object"
    );

    const templateOperationKey = `${testRunId}-template-instantiate`;
    const templateInstantiateBody = {
      operation: "template.instantiate",
      id: activeTemplate.id,
      input: {
        values: templateValues,
        definitionId: templateDefinitionId,
        expectedUpdatedAt: activeTemplateTest.payload.preview.templateUpdatedAt,
        operationKey: templateOperationKey,
        confirmed: true
      }
    };
    const instantiateTemplate = await personalOpsPost(templateInstantiateBody);
    assert(
      instantiateTemplate.response.ok &&
        instantiateTemplate.payload?.created === true &&
        instantiateTemplate.payload.usage?.definitionId === templateDefinitionId &&
        typeof instantiateTemplate.payload.usage?.requestFingerprint === "string" &&
        instantiateTemplate.payload.usage.requestFingerprint.includes(templateValues.title),
      `Confirmed Template instantiation failed or omitted its request fingerprint: ${JSON.stringify(instantiateTemplate.payload)}`
    );
    const instantiatedTemplate = instantiateTemplate.payload.item;
    const templateCreatedRef = instantiateTemplate.payload.usage.createdRef;
    const afterTemplateInstantiateState = await readAdvancedPersonalOpsState();
    const templateGeneratedDecision = afterTemplateInstantiateState.decisions?.find(
      (item) => item.id === templateCreatedRef?.objectId
    );
    assert(
      templateGeneratedDecision?.title === templateValues.title &&
        templateGeneratedDecision.sourceRefs?.some(
          (ref) => ref.module === "personal_ops" && ref.objectType === "template" && ref.objectId === activeTemplate.id
        ),
      `Template-generated Decision did not retain resolved values and Template provenance: ${JSON.stringify(templateGeneratedDecision)}`
    );

    const replayTemplateInstantiation = await personalOpsPost(templateInstantiateBody);
    assert(
      replayTemplateInstantiation.response.ok &&
        replayTemplateInstantiation.payload?.created === false &&
        replayTemplateInstantiation.payload.usage?.id === instantiateTemplate.payload.usage?.id,
      `Template instantiation replay was not idempotent: ${JSON.stringify(replayTemplateInstantiation.payload)}`
    );
    const mismatchTemplateInstantiation = await personalOpsPost({
      ...templateInstantiateBody,
      input: {
        ...templateInstantiateBody.input,
        values: { title: `${testRunId}-different-template-request` }
      }
    });
    assert(
      mismatchTemplateInstantiation.response.status === 409 && mismatchTemplateInstantiation.payload?.code === "conflict",
      `Template operation-key request-fingerprint mismatch was not rejected: ${JSON.stringify(mismatchTemplateInstantiation.payload)}`
    );

    const revisedTemplateDefinition = {
      ...templateDefinition,
      destination: {
        ...templateDefinition.destination,
        input: {
          ...templateDefinition.destination.input,
          question: "Revised schema question for {{title}}?"
        }
      }
    };
    const reviseTemplateSchema = await personalOpsPatch({
      secondaryFamily: "templates",
      id: instantiatedTemplate.id,
      expectedUpdatedAt: instantiatedTemplate.updatedAt,
      patch: { generatedDefinitions: [revisedTemplateDefinition] }
    });
    assert(
      reviseTemplateSchema.response.ok &&
        reviseTemplateSchema.payload?.item?.updatedAt !== instantiatedTemplate.updatedAt,
      `Template schema revision failed: ${JSON.stringify(reviseTemplateSchema.payload)}`
    );
    const revisedTemplate = reviseTemplateSchema.payload.item;
    const replayAfterTemplateSchemaChange = await personalOpsPost(templateInstantiateBody);
    assert(
      replayAfterTemplateSchemaChange.response.ok &&
        replayAfterTemplateSchemaChange.payload?.created === false &&
        replayAfterTemplateSchemaChange.payload.usage?.createdRef?.objectId === templateCreatedRef?.objectId,
      `Template idempotency did not preserve the prior output after a schema change: ${JSON.stringify(replayAfterTemplateSchemaChange.payload)}`
    );
    const afterTemplateSchemaChangeState = await readAdvancedPersonalOpsState();
    const preservedTemplateDecision = afterTemplateSchemaChangeState.decisions?.find(
      (item) => item.id === templateCreatedRef?.objectId
    );
    assert(
      preservedTemplateDecision?.question === templateGeneratedDecision.question &&
        revisedTemplate.usages?.length === 1,
      "Changing a Template schema mutated prior output or duplicated its recorded usage"
    );

    const archiveTemplate = await personalOpsPatch({
      secondaryFamily: "templates",
      id: revisedTemplate.id,
      expectedUpdatedAt: revisedTemplate.updatedAt,
      patch: {
        lifecycle: "archived",
        archiveConfirmed: true,
        archiveReason: "Regression Template archive boundary"
      }
    });
    assert(
      archiveTemplate.response.ok &&
        archiveTemplate.payload?.item?.lifecycle === "archived" &&
        archiveTemplate.payload.item.availability === "paused",
      `Template archive failed to suspend availability: ${JSON.stringify(archiveTemplate.payload)}`
    );
    const archivedTemplate = archiveTemplate.payload.item;
    const rejectArchivedTemplateUse = await personalOpsPost({
      operation: "template.instantiate",
      id: archivedTemplate.id,
      input: {
        values: templateValues,
        definitionId: templateDefinitionId,
        expectedUpdatedAt: archivedTemplate.updatedAt,
        operationKey: `${testRunId}-archived-template-use`,
        confirmed: true
      }
    });
    assert(
      rejectArchivedTemplateUse.response.status === 400 && rejectArchivedTemplateUse.payload?.code === "validation",
      `Archived Template created new work: ${JSON.stringify(rejectArchivedTemplateUse.payload)}`
    );

    const restoreTemplate = await personalOpsPatch({
      secondaryFamily: "templates",
      id: archivedTemplate.id,
      expectedUpdatedAt: archivedTemplate.updatedAt,
      patch: { lifecycle: "active", restoreConfirmed: true }
    });
    assert(
      restoreTemplate.response.ok &&
        restoreTemplate.payload?.item?.lifecycle === "active" &&
        restoreTemplate.payload.item.availability === "paused",
      `Template restore failed or silently reactivated availability: ${JSON.stringify(restoreTemplate.payload)}`
    );
    const restoredTemplate = restoreTemplate.payload.item;
    const deprecateTemplate = await personalOpsPatch({
      secondaryFamily: "templates",
      id: restoredTemplate.id,
      expectedUpdatedAt: restoredTemplate.updatedAt,
      patch: { availability: "deprecated" }
    });
    assert(
      deprecateTemplate.response.ok && deprecateTemplate.payload?.item?.availability === "deprecated",
      `Template deprecation failed: ${JSON.stringify(deprecateTemplate.payload)}`
    );
    const deprecatedTemplate = deprecateTemplate.payload.item;
    const rejectDeprecatedTemplateUse = await personalOpsPost({
      operation: "template.instantiate",
      id: deprecatedTemplate.id,
      input: {
        values: templateValues,
        definitionId: templateDefinitionId,
        expectedUpdatedAt: deprecatedTemplate.updatedAt,
        operationKey: `${testRunId}-deprecated-template-use`,
        confirmed: true
      }
    });
    assert(
      rejectDeprecatedTemplateUse.response.status === 400 && rejectDeprecatedTemplateUse.payload?.code === "validation",
      `Deprecated Template created new work: ${JSON.stringify(rejectDeprecatedTemplateUse.payload)}`
    );

    const persistedAdvancedState = await readAdvancedPersonalOpsState();
    assert(
      persistedAdvancedState.schemaVersion === 2 &&
        persistedAdvancedState.routines?.some(
          (item) => item.id === restoreRoutine.payload.item.id && item.runHistory?.length === 1
        ) &&
        persistedAdvancedState.captures?.some(
          (item) => item.id === processedCapture.id && item.rawText === captureRawText && item.processedRefs?.length === 3
        ) &&
        persistedAdvancedState.templates?.some(
          (item) => item.id === deprecatedTemplate.id && item.availability === "deprecated" && item.usages?.length === 1
        ) &&
        persistedAdvancedState.auditEvents?.some((event) => event.action === "routine.run_confirmed") &&
        persistedAdvancedState.auditEvents?.some((event) => event.action === "capture_item.processed") &&
        persistedAdvancedState.auditEvents?.some((event) => event.action === "template.instantiated"),
      `Advanced Personal Ops state or audit did not persist: ${JSON.stringify(persistedAdvancedState)}`
    );
    pass("Template tests remain pure and honest; activation, confirmed use, fingerprint idempotency, schema independence, archive/restore, and deprecation guards work");

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

    logStep("Checking People adapter persistence and direct routes");
    const personTitle = `${testRunId}-person`;
    const createPerson = await requestJson(server.baseUrl, cookieJar, "/api/personal/records", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        domain: "notes-docs",
        title: personTitle,
        className: "person",
        status: "active",
        body: "Regression-created relationship context.",
        url: "https://example.com/regression-person",
        areas: ["Relationships"],
        subjects: ["Collaborator"],
        externalSources: ["https://example.com/regression-person"],
        intents: ["connect"],
        time: { reviewCadence: "P1M" },
        profile: {
          fullName: personTitle,
          context: "Regression-created relationship context.",
          website: "https://example.com/regression-person",
          associatedPeople: [],
          children: [],
          interactions: [],
          memories: []
        }
      })
    });
    assert(createPerson.response.ok && createPerson.payload?.ok, `People create failed: ${JSON.stringify(createPerson.payload)}`);
    const createdPerson = createPerson.payload.items?.find((item) => item.title === personTitle && item.className === "person");
    assert(createdPerson?.id, "Created People record was not returned");
    const updatedPersonTitle = `${personTitle}-updated`;
    const updatePerson = await requestJson(server.baseUrl, cookieJar, "/api/personal/records", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        id: createdPerson.id,
        title: updatedPersonTitle,
        subjects: ["Advisor"],
        time: { lastReview: "2026-07-14", reviewCadence: "P1M" },
        profile: {
          fullName: updatedPersonTitle,
          primaryEmail: "regression-person@example.com",
          interactions: ["2026-07-14 • Meeting • Regression persistence check"]
        }
      })
    });
    assert(updatePerson.response.ok && updatePerson.payload?.ok, `People update failed: ${JSON.stringify(updatePerson.payload)}`);
    const persistedPerson = updatePerson.payload.items?.find((item) => item.id === createdPerson.id);
    assert(persistedPerson?.title === updatedPersonTitle, "People title update did not persist");
    assert(persistedPerson?.createdAt === createdPerson.createdAt, "People update changed the original createdAt provenance");
    assert(persistedPerson?.profile?.primaryEmail === "regression-person@example.com", "People profile update did not persist");
    assert(persistedPerson?.profile?.interactions?.length === 1, "People interaction history did not persist");
    assert(persistedPerson?.time?.nextReview, "People cadence update did not calculate the next review");

    const clearPersonUrls = await requestJson(server.baseUrl, cookieJar, "/api/personal/records", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        id: createdPerson.id,
        url: "",
        externalSources: [],
        profile: { website: "", linkedin: "" }
      })
    });
    assert(clearPersonUrls.response.ok && clearPersonUrls.payload?.ok, `People URL clear failed: ${JSON.stringify(clearPersonUrls.payload)}`);
    const personWithClearedUrls = clearPersonUrls.payload.items?.find((item) => item.id === createdPerson.id);
    assert(!personWithClearedUrls?.url, "Cleared People legacy URL reappeared");
    assert(!personWithClearedUrls?.profile?.website && !personWithClearedUrls?.profile?.linkedin, "Cleared People profile URLs reappeared");
    assert(personWithClearedUrls?.externalSources?.length === 0, "Cleared People profile sources reappeared");

    const rejectInvalidPersonUrl = await requestJson(server.baseUrl, cookieJar, "/api/personal/records", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ id: createdPerson.id, url: "javascript:alert(1)" })
    });
    assert(rejectInvalidPersonUrl.response.status === 400 && !rejectInvalidPersonUrl.payload?.ok, "People PATCH accepted a non-http(s) URL");

    const personProfilePage = await requestText(server.baseUrl, cookieJar, `/admin/people/${createdPerson.id}`);
    assert(personProfilePage.response.ok, `People profile route failed: ${describeStatus(personProfilePage.response)}`);
    assert(personProfilePage.body.includes(updatedPersonTitle), "People profile route missing the persisted person");
    const personEditPage = await requestText(server.baseUrl, cookieJar, `/admin/people/${createdPerson.id}/edit`);
    assert(personEditPage.response.ok, `People edit route failed: ${describeStatus(personEditPage.response)}`);
    assert(personEditPage.body.includes("Edit Profile"), "People edit route missing explicit editor state");
    pass("People create/update/clear/reload/direct-route flow works through the Personal Records adapter");

    logStep("Checking Notes adapter persistence and canonical editor route");
    const sharedContentSourceUrl = "https://example.com/regression-content-source";
    const noteTitle = `${testRunId}-note`;
    const createNote = await requestJson(server.baseUrl, cookieJar, "/api/personal/records", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        domain: "notes-docs",
        title: noteTitle,
        className: "note",
        status: "draft",
        body: "Regression-created authored knowledge.",
        url: sharedContentSourceUrl,
        externalSources: [`${sharedContentSourceUrl}#supporting-evidence`],
        areas: ["AI"],
        subjects: ["PKM"],
        intents: ["retain"]
      })
    });
    assert(createNote.response.ok && createNote.payload?.ok, `Notes create failed: ${JSON.stringify(createNote.payload)}`);
    const createdNote = createNote.payload.items?.find((item) => item.title === noteTitle && item.className === "note");
    assert(createdNote?.id, "Created Note was not returned by the legacy adapter API");

    const noteDirectoryAfterCreate = await requestText(server.baseUrl, cookieJar, `/admin/notes?note=${createdNote.id}`);
    assert(noteDirectoryAfterCreate.response.ok, `Notes directory reload failed: ${describeStatus(noteDirectoryAfterCreate.response)}`);
    assert(noteDirectoryAfterCreate.body.includes(noteTitle), "Persisted Note missing from the Notes directory");

    const noteDetail = await requestText(server.baseUrl, cookieJar, `/admin/notes/${createdNote.id}`);
    assert(noteDetail.response.ok, `Note editor route failed: ${describeStatus(noteDetail.response)}`);
    assert(noteDetail.body.includes(noteTitle), "Note editor route missing the persisted Note");
    assert(noteDetail.body.includes("Persistence boundary"), "Note editor did not disclose its persistence boundary");

    const updatedNoteTitle = `${noteTitle}-updated`;
    const updateNote = await requestJson(server.baseUrl, cookieJar, "/api/personal/records", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        id: createdNote.id,
        title: updatedNoteTitle,
        body: "Regression-updated authored knowledge.",
        status: "active"
      })
    });
    assert(updateNote.response.ok && updateNote.payload?.ok, `Notes update failed: ${JSON.stringify(updateNote.payload)}`);
    const persistedNote = updateNote.payload.items?.find((item) => item.id === createdNote.id);
    assert(persistedNote?.title === updatedNoteTitle, "Note title update did not persist");
    assert(persistedNote?.body === "Regression-updated authored knowledge.", "Note body update did not persist");
    assert(persistedNote?.status === "active", "Note lifecycle update did not persist");
    assert(persistedNote?.createdAt === createdNote.createdAt, "Note update changed original creation provenance");

    const noteDetailAfterUpdate = await requestText(server.baseUrl, cookieJar, `/admin/notes/${createdNote.id}?tab=body`);
    assert(noteDetailAfterUpdate.body.includes(updatedNoteTitle), "Updated Note title missing after editor reload");
    assert(noteDetailAfterUpdate.body.includes("Regression-updated authored knowledge."), "Updated Note body missing after editor reload");

    const protectedStatusNoteTitle = `${testRunId}-blocked-note`;
    const createProtectedStatusNote = await requestJson(server.baseUrl, cookieJar, "/api/personal/records", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        domain: "notes-docs",
        title: protectedStatusNoteTitle,
        className: "note",
        status: "blocked",
        body: "Status must survive title and body edits."
      })
    });
    const protectedStatusNote = createProtectedStatusNote.payload?.items?.find(
      (item) => item.title === protectedStatusNoteTitle && item.status === "blocked"
    );
    assert(protectedStatusNote?.id, "Blocked legacy Note was not created for status-preservation coverage");
    const protectedStatusEditor = await requestText(server.baseUrl, cookieJar, `/admin/notes/${protectedStatusNote.id}`);
    assert(
      protectedStatusEditor.body.includes("inferred from legacy status") && protectedStatusEditor.body.includes("Blocked"),
      "Note editor did not disclose the inferred blocked lifecycle"
    );
    assert(protectedStatusEditor.body.includes("preserves that source status"), "Note editor did not disclose status-preserving saves");

    const bodyOnlyProtectedStatusUpdate = await requestJson(server.baseUrl, cookieJar, "/api/personal/records", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ id: protectedStatusNote.id, body: "Blocked status remains intact after body-only save." })
    });
    const protectedStatusAfterUpdate = bodyOnlyProtectedStatusUpdate.payload?.items?.find(
      (item) => item.id === protectedStatusNote.id
    );
    assert(protectedStatusAfterUpdate?.status === "blocked", "Body-only Note update rewrote the broad legacy status");
    pass("Notes create/update/reload/direct-editor flow works through the typed legacy adapter");

    logStep("Checking Resources and Media ownership-safe read adapters");
    const resourceTitle = `${testRunId}-resource`;
    const credentialBearingSourceUrl = "https://source-user:source-password@example.com/private?token=source-secret#fragment";
    const unsupportedCredentialSourceUrl = "ftp://source-ftp-user:source-ftp-password@example.com/private";
    const malformedCredentialSourceUrl = "https://source-space-user:source-space-password@example.com/path with space";
    const unsupportedResourceSource = "javascript:alert('resource-source')";
    const slashlessResourceSource = "https:example.com/slashless";
    const whitespaceResourceSource = "https://example.com/path with space";
    const createResource = await requestJson(server.baseUrl, cookieJar, "/api/personal/records", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        domain: "notes-docs",
        title: resourceTitle,
        className: "resource",
        status: "active",
        body: "Regression-created external source identity.",
        url: sharedContentSourceUrl,
        externalSources: [
          `${sharedContentSourceUrl}?alternate=1`,
          unsupportedResourceSource,
          slashlessResourceSource,
          credentialBearingSourceUrl,
          unsupportedCredentialSourceUrl,
          malformedCredentialSourceUrl,
          whitespaceResourceSource,
          ""
        ],
        intents: ["research"]
      })
    });
    assert(createResource.response.ok && createResource.payload?.ok, `Resource create failed: ${JSON.stringify(createResource.payload)}`);
    const createdResource = createResource.payload.items?.find((item) => item.title === resourceTitle && item.className === "resource");
    assert(createdResource?.id, "Created legacy Resource record was not returned");

    const mediaRightsQueryToken = `${testRunId}-media-rights`;
    const mediaTitle = `${mediaRightsQueryToken}-safe`;
    const createMedia = await requestJson(server.baseUrl, cookieJar, "/api/personal/records", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        domain: "notes-docs",
        title: mediaTitle,
        className: "file",
        status: "active",
        body: "Regression-created file-shaped legacy record.",
        url: sharedContentSourceUrl,
        externalSources: ["legacy-local-file-reference"],
        intents: ["retain"]
      })
    });
    assert(createMedia.response.ok && createMedia.payload?.ok, `Media create failed: ${JSON.stringify(createMedia.payload)}`);
    const createdMedia = createMedia.payload.items?.find((item) => item.title === mediaTitle && item.className === "file");
    assert(createdMedia?.id, "Created legacy Media record was not returned");

    const mediaNoSourceTitle = `${mediaRightsQueryToken}-no-source`;
    const createMediaNoSource = await requestJson(server.baseUrl, cookieJar, "/api/personal/records", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        domain: "notes-docs",
        title: mediaNoSourceTitle,
        className: "file",
        status: "active",
        body: "Regression-created file record with no retained HTTP source evidence.",
        url: "",
        externalSources: [],
        intents: ["retain"]
      })
    });
    assert(
      createMediaNoSource.response.ok && createMediaNoSource.payload?.ok,
      `Source-evidence-gap Media create failed: ${JSON.stringify(createMediaNoSource.payload)}`
    );
    const createdMediaNoSource = createMediaNoSource.payload.items?.find(
      (item) => item.title === mediaNoSourceTitle && item.className === "file"
    );
    assert(createdMediaNoSource?.id, "Source-evidence-gap legacy Media record was not returned");

    const mediaWithheldTitle = `${mediaRightsQueryToken}-withheld`;
    const createMediaWithheld = await requestJson(server.baseUrl, cookieJar, "/api/personal/records", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        domain: "notes-docs",
        title: mediaWithheldTitle,
        className: "file",
        status: "active",
        body: "Regression-created file record whose unsafe source evidence must remain server-side.",
        url: credentialBearingSourceUrl,
        externalSources: [unsupportedCredentialSourceUrl, malformedCredentialSourceUrl],
        intents: ["retain"]
      })
    });
    assert(
      createMediaWithheld.response.ok && createMediaWithheld.payload?.ok,
      `Credential-evidence Media create failed: ${JSON.stringify(createMediaWithheld.payload)}`
    );
    const createdMediaWithheld = createMediaWithheld.payload.items?.find(
      (item) => item.title === mediaWithheldTitle && item.className === "file"
    );
    assert(createdMediaWithheld?.id, "Credential-evidence legacy Media record was not returned");

    const duplicateToken = `${testRunId}-media-duplicates`;
    const duplicateCredentialUrl = "https://dup-user:dup-password@example.com/media/duplicate-alpha?token=dup-secret#private";
    const duplicateFixtures = [
      {
        key: "alpha-a",
        title: `${duplicateToken}-alpha-a`,
        url: "HTTPS://Example.com:443/media/duplicate-alpha#first",
        externalSources: ["https://example.com/media/duplicate-alpha#same-record"]
      },
      {
        key: "alpha-b",
        title: `${duplicateToken}-alpha-b`,
        url: "https://example.com/media/duplicate-alpha#second",
        externalSources: []
      },
      {
        key: "beta-a",
        title: `${duplicateToken}-beta-a`,
        url: "https://example.com/media/duplicate-beta#first",
        externalSources: []
      },
      {
        key: "beta-b",
        title: `${duplicateToken}-beta-b`,
        url: "https://EXAMPLE.com:443/media/duplicate-beta#second",
        externalSources: []
      },
      {
        key: "unique",
        title: `${duplicateToken}-unique`,
        url: "https://example.com/media/duplicate-unique",
        externalSources: []
      },
      {
        key: "withheld",
        title: `${duplicateToken}-withheld`,
        url: duplicateCredentialUrl,
        externalSources: []
      },
      {
        key: "invalid",
        title: `${duplicateToken}-invalid`,
        url: "https://example.com/media/duplicate-beta with-space",
        externalSources: []
      }
    ];
    const createdDuplicateMedia = [];
    for (const fixture of duplicateFixtures) {
      const created = await requestJson(server.baseUrl, cookieJar, "/api/personal/records", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken
        },
        body: JSON.stringify({
          domain: "notes-docs",
          title: fixture.title,
          className: "file",
          status: "active",
          body: `Isolated exact-source evidence fixture ${fixture.key}.`,
          url: fixture.url,
          externalSources: fixture.externalSources,
          intents: ["retain"]
        })
      });
      assert(created.response.ok && created.payload?.ok, `Media duplicate-evidence fixture ${fixture.key} failed to create`);
      const item = created.payload.items?.find(
        (candidate) => candidate.title === fixture.title && candidate.className === "file"
      );
      assert(item?.id, `Media duplicate-evidence fixture ${fixture.key} was not returned`);
      createdDuplicateMedia.push({ ...fixture, id: item.id });
    }

    const mediaUsageSourceRef = {
      module: "media",
      objectType: "media_asset",
      objectId: createdMedia.id,
      label: mediaTitle
    };
    const createMediaUsageProjectLink = await requestJson(server.baseUrl, cookieJar, "/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        operation: "create",
        family: "links",
        input: {
          projectId: promotedProject.id,
          source: mediaUsageSourceRef,
          relationship: "review_input",
          relationshipStrength: "normal",
          projectSpecificNote: "Regression verifies the Media usage index without creating AssetUsage."
        }
      })
    });
    assert(
      createMediaUsageProjectLink.response.ok &&
        createMediaUsageProjectLink.payload?.item?.source?.objectId === createdMedia.id &&
        createMediaUsageProjectLink.payload.item.linkState === "active",
      `Media-backed Project reference failed: ${JSON.stringify(createMediaUsageProjectLink.payload)}`
    );
    const mediaUsageProjectLink = createMediaUsageProjectLink.payload.item;

    const createMediaUsageFollowUp = await requestJson(server.baseUrl, cookieJar, "/api/personal/ops", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        family: "followUps",
        input: {
          title: `${testRunId}-media-reference-follow-up`,
          followUpType: "other",
          context: "Inspect a retained Media reference without duplicating or mutating the asset.",
          lifecycle: "active",
          followUpState: "open",
          priority: "medium",
          sourceRefs: [mediaUsageSourceRef]
        }
      })
    });
    assert(
      createMediaUsageFollowUp.response.ok &&
        createMediaUsageFollowUp.payload?.created &&
        createMediaUsageFollowUp.payload?.item?.sourceRefs?.some(
          (reference) => reference.module === "media" && reference.objectId === createdMedia.id
        ),
      `Media-backed Personal Ops reference failed: ${JSON.stringify(createMediaUsageFollowUp.payload)}`
    );
    const mediaUsageFollowUp = createMediaUsageFollowUp.payload.item;

    const sourceRecordExpectations = [
      { id: createdNote.id, className: "note", label: "Note", expectedUrl: sharedContentSourceUrl },
      { id: createdResource.id, className: "resource", label: "Resource", expectedUrl: sharedContentSourceUrl },
      { id: createdMedia.id, className: "file", label: "Media", expectedUrl: sharedContentSourceUrl },
      { id: createdMediaNoSource.id, className: "file", label: "Media without source evidence", expectedUrl: "" },
      { id: createdMediaWithheld.id, className: "file", label: "Media with withheld source evidence", expectedUrl: credentialBearingSourceUrl },
      ...createdDuplicateMedia.map((fixture) => ({
        id: fixture.id,
        className: "file",
        label: `Media duplicate-evidence fixture ${fixture.key}`,
        expectedUrl: fixture.url
      }))
    ];
    const personalRecordsSourcePath = path.join(serverEnv.FREMEN_DATA_DIR, "personal-records.json");
    const contentSourceBytesBeforeRouteReads = await readFile(personalRecordsSourcePath);
    const contentGraphRecordsBeforeRouteReads = await requestJson(
      server.baseUrl,
      cookieJar,
      "/api/personal/records"
    );
    assert(
      contentGraphRecordsBeforeRouteReads.response.ok && contentGraphRecordsBeforeRouteReads.payload?.ok,
      `Unable to capture content source records before route reads: ${JSON.stringify(contentGraphRecordsBeforeRouteReads.payload)}`
    );
    const sourceRecordSnapshots = new Map();
    for (const expectation of sourceRecordExpectations) {
      const matches = contentGraphRecordsBeforeRouteReads.payload.items.filter(
        (item) => item.id === expectation.id
      );
      assert(matches.length === 1, `${expectation.label} source record was not unique before route reads`);
      assert(
        matches[0].className === expectation.className,
        `${expectation.label} source record changed ownership class before route reads`
      );
      assert(
        (matches[0].url || "") === (expectation.expectedUrl || ""),
        `${expectation.label} did not retain its original source URL`
      );
      sourceRecordSnapshots.set(expectation.id, JSON.stringify(matches[0]));
    }

    const noteLinksTab = await requestText(
      server.baseUrl,
      cookieJar,
      `/admin/notes/${createdNote.id}?tab=links`
    );
    assert(noteLinksTab.response.ok, `Note Links route failed: ${describeStatus(noteLinksTab.response)}`);
    assertSelectedTab(
      noteLinksTab.body,
      `note-detail-${createdNote.id}-tab-links`,
      "Notes direct Links tab URL state"
    );
    assert(noteLinksTab.body.includes(updatedNoteTitle), "Note Links route missing the selected Note title");
    assert(
      noteLinksTab.body.includes(`/admin/resources/${createdResource.id}`),
      "Note Links route did not expose the matching Resource owner route"
    );
    assert(
      noteLinksTab.body.includes("Candidate graph") && noteLinksTab.body.includes("not persisted"),
      "Note Links route did not disclose that the exact-URL relationship is only a read-only candidate"
    );
    assert(
      countRenderedToken(noteLinksTab.body, `data-content-target="resources:${createdResource.id}"`) === 1,
      "Note Links route repeated one Resource owner target for multiple legacy evidence signals"
    );

    const resourceDirectory = await requestText(server.baseUrl, cookieJar, `/admin/resources?selected=${createdResource.id}`);
    assert(resourceDirectory.response.ok && resourceDirectory.body.includes(resourceTitle), "Resource missing from the Resources directory");
    assert(
      !resourceDirectory.body.includes(`id="dense-object-row-${createdMedia.id}-title"`),
      "Media file rendered as a Resources directory row"
    );
    assert(
      !resourceDirectory.body.includes(`id="dense-object-row-${createdNote.id}-title"`),
      "Note rendered as a Resources directory row"
    );
    const resourceDetail = await requestText(server.baseUrl, cookieJar, `/admin/resources/${createdResource.id}`);
    assert(resourceDetail.response.ok, `Resource detail route failed: ${describeStatus(resourceDetail.response)}`);
    for (const expected of [resourceTitle, "Fetched title", "Not fetched", "Legacy URL unverified", "Open external source"]) {
      assert(resourceDetail.body.includes(expected), `Resource detail missing expected boundary text: ${expected}`);
    }

    const primaryResourceEvidenceId = `${createdResource.id}:url`;
    const resourceSourceTab = await requestText(
      server.baseUrl,
      cookieJar,
      `/admin/resources/${createdResource.id}?tab=source&item=${encodeURIComponent(primaryResourceEvidenceId)}`
    );
    assert(resourceSourceTab.response.ok, `Resource Source route failed: ${describeStatus(resourceSourceTab.response)}`);
    assertSelectedTab(
      resourceSourceTab.body,
      `resource-${createdResource.id}-tab-source`,
      "Resources direct Source tab URL state"
    );
    for (const expected of [
      "Stored evidence, not a live source check",
      "Openable fields",
      "Syntax accepted · not checked",
      "Unsupported protocol withheld",
      "Invalid URL withheld",
      "Embedded credentials withheld",
      "[credentials withheld] https://example.com/",
      "Health result unavailable",
      "Exact Resource candidates"
    ]) {
      assert(resourceSourceTab.body.includes(expected), `Resource Source route missing evidence classification: ${expected}`);
    }
    for (const withheldSecret of [
      "source-user",
      "source-password",
      "source-secret",
      "source-ftp-user",
      "source-ftp-password",
      "source-space-user",
      "source-space-password"
    ]) {
      assert(
        !resourceSourceTab.body.includes(withheldSecret),
        `Resource Source route serialized a credential-bearing legacy value: ${withheldSecret}`
      );
    }

    for (const evidenceIndex of [3, 4, 5]) {
      const credentialResourceEvidenceId = `${createdResource.id}:externalSources[${evidenceIndex}]`;
      const credentialResourceSourceTab = await requestText(
        server.baseUrl,
        cookieJar,
        `/admin/resources/${createdResource.id}?tab=source&item=${encodeURIComponent(credentialResourceEvidenceId)}`
      );
      assert(
        credentialResourceSourceTab.response.ok &&
          credentialResourceSourceTab.body.includes("Embedded credentials withheld") &&
          credentialResourceSourceTab.body.includes("Not eligible for matching") &&
          !credentialResourceSourceTab.body.includes('aria-label="Selected source evidence actions"') &&
          !credentialResourceSourceTab.body.includes("Open candidate in new tab"),
        `Credential-bearing Resource evidence ${evidenceIndex} became visible, openable, or matchable`
      );
    }
    pass("Resource Source classifies literal URL evidence while withholding credentials from the client page");

    const resourceLinksTab = await requestText(
      server.baseUrl,
      cookieJar,
      `/admin/resources/${createdResource.id}?tab=links`
    );
    assert(resourceLinksTab.response.ok, `Resource Links route failed: ${describeStatus(resourceLinksTab.response)}`);
    assertSelectedTab(
      resourceLinksTab.body,
      `resource-${createdResource.id}-tab-links`,
      "Resources direct Links tab URL state"
    );
    for (const expected of [
      "Candidate graph · not persisted links",
      "Resolved owner routes",
      updatedNoteTitle,
      mediaTitle,
      `/admin/notes/${createdNote.id}`,
      `/admin/media/${createdMedia.id}`
    ]) {
      assert(resourceLinksTab.body.includes(expected), `Resource Links route missing owner-boundary evidence: ${expected}`);
    }
    assert(
      countRenderedToken(resourceLinksTab.body, `data-content-target="notes:${createdNote.id}"`) === 1,
      "Resource Links route repeated one Note owner target for multiple legacy evidence signals"
    );

    const resourceNotesTab = await requestText(
      server.baseUrl,
      cookieJar,
      `/admin/resources/${createdResource.id}?tab=notes`
    );
    assert(resourceNotesTab.response.ok, `Resource Notes route failed: ${describeStatus(resourceNotesTab.response)}`);
    assertSelectedTab(
      resourceNotesTab.body,
      `resource-${createdResource.id}-tab-notes`,
      "Resources direct Notes tab URL state"
    );
    for (const expected of [
      "Source material is not authored knowledge.",
      "Exact normalized URL candidate · not a persisted citation",
      updatedNoteTitle,
      `/admin/notes/${createdNote.id}`
    ]) {
      assert(resourceNotesTab.body.includes(expected), `Resource Notes route missing ownership evidence: ${expected}`);
    }
    assert(
      countRenderedToken(resourceNotesTab.body, `data-content-target="notes:${createdNote.id}"`) === 1,
      "Resource Notes route repeated one Note for multiple exact URL evidence signals"
    );

    const resourceReviewTab = await requestText(
      server.baseUrl,
      cookieJar,
      `/admin/resources/${createdResource.id}?tab=review`
    );
    assert(resourceReviewTab.response.ok, `Resource Review route failed: ${describeStatus(resourceReviewTab.response)}`);
    assertSelectedTab(
      resourceReviewTab.body,
      `resource-${createdResource.id}-tab-review`,
      "Resources direct Review tab URL state"
    );
    for (const expected of [
      "Nine review contracts",
      "Resource-local evidence review · not a Reviews run",
      "URL reachable",
      "Source identity confirmed",
      "Citation metadata complete",
      "Key claims reviewed",
      "Quote / snippet anchors confirmed",
      "Notes citations current",
      "Linked usage reviewed",
      "Snapshot / fallback available",
      "Duplicate source check",
      "No persisted draft outcome",
      updatedNoteTitle,
      `/admin/notes/${createdNote.id}`
    ]) {
      assert(resourceReviewTab.body.includes(expected), `Resource Review route missing literal evidence contract: ${expected}`);
    }
    assert(
      countRenderedToken(resourceReviewTab.body, `data-content-target="notes:${createdNote.id}"`) === 1,
      "Resource Review route repeated one Note owner target for multiple exact evidence signals"
    );
    for (const forbidden of ["3 of 9", "HTTP 200", "Nielsen Norman Group", "Jun 18"]) {
      assert(
        !resourceReviewTab.body.includes(forbidden),
        `Resource Review route rendered a mockup value as current evidence: ${forbidden}`
      );
    }

    const mediaDirectoryAfterCreate = await requestText(server.baseUrl, cookieJar, `/admin/media?selected=${createdMedia.id}`);
    assert(mediaDirectoryAfterCreate.response.ok && mediaDirectoryAfterCreate.body.includes(mediaTitle), "Media record missing from the Media directory");
    assert(
      !mediaDirectoryAfterCreate.body.includes(`id="dense-object-row-${createdResource.id}-title"`),
      "Resource rendered as a Media directory row"
    );
    assert(
      !mediaDirectoryAfterCreate.body.includes(`id="dense-object-row-${createdNote.id}-title"`),
      "Note rendered as a Media directory row"
    );
    const mediaDetail = await requestText(server.baseUrl, cookieJar, `/admin/media/${createdMedia.id}`);
    assert(mediaDetail.response.ok, `Media detail route failed: ${describeStatus(mediaDetail.response)}`);
    for (const expected of [mediaTitle, "Needs confirmation", "Internal / review", "A URL is not a Media binary", "Unresolved Resource candidate"]) {
      assert(mediaDetail.body.includes(expected), `Media detail missing expected ownership text: ${expected}`);
    }

    const mediaLinksTab = await requestText(
      server.baseUrl,
      cookieJar,
      `/admin/media/${createdMedia.id}?tab=links`
    );
    assert(mediaLinksTab.response.ok, `Media Links route failed: ${describeStatus(mediaLinksTab.response)}`);
    assertSelectedTab(
      mediaLinksTab.body,
      `media-detail-${createdMedia.id}-tab-links`,
      "Media direct Links tab URL state"
    );
    assert(mediaLinksTab.body.includes(sharedContentSourceUrl), "Media Links route lost its Resource-owned URL candidate");
    const encodedSharedContentSourceUrl = encodeURIComponent(sharedContentSourceUrl);
    assert(
      mediaLinksTab.body.includes(`/admin/resources?query=${encodedSharedContentSourceUrl}`),
      "Media Links route did not navigate its URL candidate to the Resources owner"
    );

    const mediaNeedsReviewAfterCreate = await requestText(
      server.baseUrl,
      cookieJar,
      "/admin/media/needs-review"
    );
    assert(
      mediaNeedsReviewAfterCreate.response.ok,
      `Media Needs Review reload failed: ${describeStatus(mediaNeedsReviewAfterCreate.response)}`
    );
    for (const expected of [mediaTitle, "Needs Review", "Legacy readiness triage", "Read-only"]) {
      assert(
        mediaNeedsReviewAfterCreate.body.includes(expected),
        `Media Needs Review reload missing dynamic legacy-readiness evidence: ${expected}`
      );
    }
    assert(
      mediaNeedsReviewAfterCreate.body.includes("AssetReview") &&
        mediaNeedsReviewAfterCreate.body.includes("not connected"),
      "Media Needs Review reload falsely implied that a native AssetReview exists"
    );
    for (const mockupConstant of [
      "11 assets need review",
      "6 metadata",
      "3 rights",
      "2 duplicates"
    ]) {
      assert(
        !mediaNeedsReviewAfterCreate.body.includes(mockupConstant),
        `Media Needs Review reload rendered a mockup constant as live data: ${mockupConstant}`
      );
    }

    const mediaMissingMetadataAfterCreate = await requestText(
      server.baseUrl,
      cookieJar,
      `/admin/media/missing-metadata?selected=${createdMedia.id}&tab=metadata&issue=source`
    );
    assert(
      mediaMissingMetadataAfterCreate.response.ok,
      `Media Missing Metadata reload failed: ${describeStatus(mediaMissingMetadataAfterCreate.response)}`
    );
    assertSelectedTab(
      mediaMissingMetadataAfterCreate.body,
      `media-inspector-${createdMedia.id}-tab-metadata`,
      "Media Missing Metadata direct tab URL state"
    );
    for (const expected of [
      mediaTitle,
      "Legacy metadata evidence",
      "Asset type",
      "Filename",
      "MIME type",
      "File size",
      "Checksum",
      "Source / provenance",
      "Owner / creator",
      "Alt text / OCR applicability",
      "Rights state",
      "Linked context",
      "Unavailable in legacy adapter",
      "Candidate only",
      sharedContentSourceUrl,
      `/admin/resources/${createdResource.id}`
    ]) {
      assert(
        mediaMissingMetadataAfterCreate.body.includes(expected),
        `Media Missing Metadata route missing literal evidence boundary: ${expected}`
      );
    }
    for (const forbidden of [
      "68% complete",
      "76%",
      "review_screenshot.png",
      "1728×972",
      "1.8 MB"
    ]) {
      assert(
        !mediaMissingMetadataAfterCreate.body.includes(forbidden),
        `Media Missing Metadata route rendered a mockup value as live metadata: ${forbidden}`
      );
    }

    const mediaRightsUsageAfterCreate = await requestText(
      server.baseUrl,
      cookieJar,
      `/admin/media/rights-usage?query=${encodeURIComponent(mediaRightsQueryToken)}&selected=${createdMedia.id}&tab=rights&issue=all&sort=title&keep=1&view=all`
    );
    assert(
      mediaRightsUsageAfterCreate.response.ok,
      `Media Rights / Usage reload failed: ${describeStatus(mediaRightsUsageAfterCreate.response)}`
    );
    assertSelectedTab(
      mediaRightsUsageAfterCreate.body,
      `media-inspector-${createdMedia.id}-tab-rights`,
      "Media Rights / Usage direct Rights tab URL state"
    );
    for (const expected of [
      mediaTitle,
      mediaNoSourceTitle,
      mediaWithheldTitle,
      "Rights / Usage",
      "Needs confirmation · Resource candidate retained",
      "Needs confirmation · source evidence unavailable",
      "Canonical state and operating scope are separate",
      "Public use",
      "Commercial use",
      "Modification",
      "Unverified",
      "Not recorded",
      "Native usage registry",
      "not connected",
      sharedContentSourceUrl,
      `/admin/resources/${createdResource.id}`,
      "aria-label=\"Legacy assets: 3 (search scope)\"",
      "aria-label=\"Needs confirmation: 3 (canonical state)\"",
      "aria-label=\"Confirmed evidence: 0 (timestamp required)\"",
      "aria-label=\"Resource candidates: 1 (URLs stay in Resources)\"",
      "aria-label=\"Source evidence unavailable: 2 (not proof of absence)\"",
      "aria-label=\"Provisional internal / review: 3 (not a rights grant)\"",
      "aria-label=\"Native usage registry: — (not connected)\""
    ]) {
      assert(
        mediaRightsUsageAfterCreate.body.includes(expected),
        `Media Rights / Usage route missing dynamic evidence: ${expected}`
      );
    }
    for (const forbidden of [
      "Review screenshot",
      "12 unknown",
      "24 in active use",
      "72%",
      "1.8 MB",
      "1728×972",
      "expires",
      "license expiry"
    ]) {
      assert(
        !mediaRightsUsageAfterCreate.body.toLowerCase().includes(forbidden.toLowerCase()),
        `Media Rights / Usage route rendered invented current evidence: ${forbidden}`
      );
    }

    const withheldMediaProperties = await requestText(
      server.baseUrl,
      cookieJar,
      `/admin/media/rights-usage?query=${encodeURIComponent(mediaRightsQueryToken)}&selected=${createdMediaWithheld.id}&tab=properties`
    );
    assert(
      withheldMediaProperties.response.ok &&
        withheldMediaProperties.body.includes("[credentials withheld] https://example.com/"),
      "Media Rights / Usage did not preserve a redacted source-evidence boundary"
    );
    for (const withheldSecret of [
      "source-user",
      "source-password",
      "source-secret",
      "source-ftp-user",
      "source-ftp-password",
      "source-space-user",
      "source-space-password",
      "/private?token="
    ]) {
      assert(
        !withheldMediaProperties.body.includes(withheldSecret) &&
          !mediaRightsUsageAfterCreate.body.includes(withheldSecret),
        `Media Rights / Usage serialized credential-bearing source evidence: ${withheldSecret}`
      );
    }
    pass("Media Rights / Usage derives isolated evidence counts and withholds unsafe source credentials");

    const mediaDuplicatesAfterCreate = await requestText(
      server.baseUrl,
      cookieJar,
      `/admin/media/duplicates?query=${encodeURIComponent(duplicateToken)}&sort=title`
    );
    assert(
      mediaDuplicatesAfterCreate.response.ok,
      `Media Duplicates evidence reload failed: ${describeStatus(mediaDuplicatesAfterCreate.response)}`
    );
    assert(
      countRenderedToken(mediaDuplicatesAfterCreate.body, 'data-media-duplicate-group="') === 2,
      "Media Duplicates did not derive exactly two exact-source groups"
    );
    for (const fixture of createdDuplicateMedia.filter((candidate) => ["alpha-a", "alpha-b", "beta-a", "beta-b"].includes(candidate.key))) {
      assert(
        countRenderedToken(mediaDuplicatesAfterCreate.body, fixture.title) >= 1,
        `Media Duplicates exact-source directory omitted ${fixture.key}`
      );
    }
    for (const expected of [
      "https://example.com/media/duplicate-alpha",
      "https://example.com/media/duplicate-beta",
      "Native cases",
      "Repository not connected",
      "Checksum evidence",
      "Not computed"
    ]) {
      assert(
        mediaDuplicatesAfterCreate.body.includes(expected),
        `Media Duplicates evidence route missing dynamic boundary: ${expected}`
      );
    }

    const mediaInUseAfterNativeReferences = await requestText(
      server.baseUrl,
      cookieJar,
      `/admin/media/in-use?query=${encodeURIComponent(mediaTitle)}&selected=${encodeURIComponent(createdMedia.id)}&tab=usage&sort=locations-desc`
    );
    assert(
      mediaInUseAfterNativeReferences.response.ok,
      `Media In Use native-reference reload failed: ${describeStatus(mediaInUseAfterNativeReferences.response)}`
    );
    assertSelectedTab(
      mediaInUseAfterNativeReferences.body,
      "media-in-use-tabs-tab-usage",
      "Media In Use direct Usage tab URL state"
    );
    for (const expected of [
      mediaTitle,
      promotedProject.name,
      `${testRunId}-media-reference-follow-up`,
      `/admin/projects/${promotedProject.id}`,
      `/admin/personal/follow-ups?selected=${encodeURIComponent(mediaUsageFollowUp.id)}`,
      "Native reference locations",
      "Target-owned placements, not a complete usage registry.",
      "AssetUsage records",
      "Repository not connected"
    ]) {
      assert(
        mediaInUseAfterNativeReferences.body.includes(expected),
        `Media In Use native-reference route missing literal evidence: ${expected}`
      );
    }
    assert(
      countRenderedToken(mediaInUseAfterNativeReferences.body, 'data-media-usage-record="') === 1,
      "Media In Use query did not narrow the owner-reference directory to one Media evidence record"
    );
    for (const forbidden of [
      "Public-facing",
      "42 active usages",
      "candidate available / not confirmed",
      "review_screenshot_clean.png",
      "Replace everywhere\" aria-disabled=\"false"
    ]) {
      assert(
        !mediaInUseAfterNativeReferences.body.includes(forbidden),
        `Media In Use native-reference route rendered invented usage state: ${forbidden}`
      );
    }
    assert(mediaUsageProjectLink.id && mediaUsageFollowUp.id, "Media reference fixtures lost their stable source identities");
    pass("Media In Use indexes Project and Personal Ops owner references without creating AssetUsage");

    const alphaDuplicates = await requestText(
      server.baseUrl,
      cookieJar,
      `/admin/media/duplicates?query=${encodeURIComponent(`${duplicateToken}-alpha`)}&sort=title`
    );
    assert(
      alphaDuplicates.response.ok && countRenderedToken(alphaDuplicates.body, 'data-media-duplicate-group="') === 1,
      "Media Duplicates alpha query did not narrow to one exact-source group"
    );
    const uniqueDuplicates = await requestText(
      server.baseUrl,
      cookieJar,
      `/admin/media/duplicates?query=${encodeURIComponent(`${duplicateToken}-unique`)}`
    );
    assert(
      uniqueDuplicates.response.ok &&
        countRenderedToken(uniqueDuplicates.body, 'data-media-duplicate-group="') === 0 &&
        uniqueDuplicates.body.includes("No evidence groups match this view"),
      "Media Duplicates unique-source query falsely produced a shared-source group"
    );
    const withheldDuplicates = await requestText(
      server.baseUrl,
      cookieJar,
      `/admin/media/duplicates?query=${encodeURIComponent(`${duplicateToken}-withheld`)}`
    );
    assert(
      withheldDuplicates.response.ok && countRenderedToken(withheldDuplicates.body, 'data-media-duplicate-group="') === 0,
      "Media Duplicates credential-bearing source falsely produced a matchable group"
    );
    for (const forbidden of [
      "dup-user",
      "dup-password",
      "dup-secret",
      "/media/duplicate-alpha?token=",
      "94%",
      "checksum match",
      "exact binary match",
      "visual match",
      "auto-merge"
    ]) {
      assert(
        !mediaDuplicatesAfterCreate.body.toLowerCase().includes(forbidden.toLowerCase()) &&
          !withheldDuplicates.body.toLowerCase().includes(forbidden.toLowerCase()),
        `Media Duplicates serialized unsafe or invented evidence: ${forbidden}`
      );
    }
    await checkMediaDuplicatesBrowserState(server.baseUrl, cookieJar, duplicateToken);
    pass("Media Duplicates derives exact-source evidence, preserves route state, and emits no mutation");

    const mediaUploadQueueAfterCreate = await requestText(
      server.baseUrl,
      cookieJar,
      "/admin/media/upload-queue"
    );
    assert(
      mediaUploadQueueAfterCreate.response.ok,
      `Media Upload Queue reload failed: ${describeStatus(mediaUploadQueueAfterCreate.response)}`
    );
    assert(
      mediaUploadQueueAfterCreate.body.includes("No local files in preview") &&
        mediaUploadQueueAfterCreate.body.includes("Native queue records"),
      "Media Upload Queue reload did not return to its explicit empty local-only state"
    );
    assert(
      !mediaUploadQueueAfterCreate.body.includes(mediaTitle) &&
        !mediaUploadQueueAfterCreate.body.includes(sharedContentSourceUrl),
      "Media Upload Queue incorrectly adapted a durable legacy Media or Resource record into local intake"
    );
    pass("Media Upload Queue remains ephemeral and does not reinterpret legacy records");

    for (const [pathname, label] of [
      [`/admin/notes/${createdResource.id}`, "Resource through Notes"],
      [`/admin/notes/${createdMedia.id}`, "Media through Notes"],
      [`/admin/resources/${createdNote.id}`, "Note through Resources"],
      [`/admin/resources/${createdMedia.id}`, "Media through Resources"],
      [`/admin/media/${createdNote.id}`, "Note through Media"],
      [`/admin/media/${createdResource.id}`, "Resource through Media"]
    ]) {
      const wrongOwnerRoute = await requestText(server.baseUrl, cookieJar, pathname);
      assert(
        isAppRouterNotFound(wrongOwnerRoute.response, wrongOwnerRoute.body),
        `${label} did not fail closed at its wrong-owner detail route: ${describeStatus(wrongOwnerRoute.response)}`
      );
    }

    const notesAfterContentGraphRecords = await requestText(server.baseUrl, cookieJar, "/admin/notes");
    assert(
      !notesAfterContentGraphRecords.body.includes(`id="dense-object-row-${createdResource.id}-title"`),
      "Resource rendered as a Notes authored-knowledge directory row"
    );
    assert(
      !notesAfterContentGraphRecords.body.includes(`id="dense-object-row-${createdMedia.id}-title"`),
      "Media file rendered as a Notes authored-knowledge directory row"
    );

    const contentSourceBytesAfterRouteReads = await readFile(personalRecordsSourcePath);
    assert(
      contentSourceBytesBeforeRouteReads.equals(contentSourceBytesAfterRouteReads),
      "Read-only Resource or Media route rendering changed personal-records.json bytes"
    );

    const contentGraphRecordsAfterRouteReads = await requestJson(
      server.baseUrl,
      cookieJar,
      "/api/personal/records"
    );
    assert(
      contentGraphRecordsAfterRouteReads.response.ok && contentGraphRecordsAfterRouteReads.payload?.ok,
      `Unable to reload content source records after route reads: ${JSON.stringify(contentGraphRecordsAfterRouteReads.payload)}`
    );
    for (const expectation of sourceRecordExpectations) {
      const matches = contentGraphRecordsAfterRouteReads.payload.items.filter(
        (item) => item.id === expectation.id
      );
      assert(matches.length === 1, `${expectation.label} source record was duplicated by content route reads`);
      assert(
        matches[0].className === expectation.className,
        `${expectation.label} source record changed ownership class after content route reads`
      );
      assert(
        JSON.stringify(matches[0]) === sourceRecordSnapshots.get(expectation.id),
        `${expectation.label} source record was mutated by read-only Resource or Media route rendering`
      );
    }
    pass("Content tabs restore URL state and expose read-only owner-route candidates without duplicate objects");
    pass("Media legacy-readiness triage remains dynamic, non-native, and source-record preserving");
    pass("Resource review exposes nine literal evidence contracts without inventing review completion");
    pass("Media metadata triage preserves adapter truth and owner routes without simulating completion");
    pass("Resources, Media, and Notes remain ownership-separated across index and canonical detail routes");

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

    logStep("Checking native ReviewRun templates, gates, persistence, and reversible lifecycle");
    const initialNativeReviews = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs?includeArchived=1");
    assert(
      initialNativeReviews.response.ok &&
        initialNativeReviews.payload?.ok &&
        initialNativeReviews.payload.state?.schemaVersion === 1 &&
        Array.isArray(initialNativeReviews.payload.state?.runs) &&
        initialNativeReviews.payload.state.runs.length === 0,
      `Native Reviews state did not start isolated and empty: ${JSON.stringify(initialNativeReviews.payload)}`
    );

    const rejectReviewRunCsrf = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: {
          cadence: "weekly",
          periodStart: "2026-07-06",
          periodEnd: "2026-07-12",
          current: false
        }
      })
    });
    assert(
      rejectReviewRunCsrf.response.status === 403 && !rejectReviewRunCsrf.payload?.ok,
      `Native ReviewRun create accepted missing CSRF proof: ${JSON.stringify(rejectReviewRunCsrf.payload)}`
    );

    const createWeeklyReviewRun = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        input: {
          cadence: "weekly",
          title: `${testRunId} Weekly Review`,
          periodStart: "2026-07-06",
          periodEnd: "2026-07-12",
          dueAt: "2026-07-13",
          ownerId: "Codex Regression",
          current: false
        }
      })
    });
    assert(
      createWeeklyReviewRun.response.ok &&
        createWeeklyReviewRun.payload?.ok &&
        createWeeklyReviewRun.payload.item?.cadence === "weekly" &&
        createWeeklyReviewRun.payload.item.checklist?.length === 10 &&
        createWeeklyReviewRun.payload.view?.counts?.requiredChecks === 8,
      `Weekly ReviewRun did not instantiate the ten-check template: ${JSON.stringify(createWeeklyReviewRun.payload)}`
    );
    let weeklyReviewRun = createWeeklyReviewRun.payload.item;
    let weeklyReviewView = createWeeklyReviewRun.payload.view;

    const rejectBlockedWeeklyCompletion = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        id: weeklyReviewRun.id,
        expectedUpdatedAt: weeklyReviewRun.updatedAt,
        patch: { action: "complete" }
      })
    });
    assert(
      rejectBlockedWeeklyCompletion.response.status === 409 &&
        rejectBlockedWeeklyCompletion.payload?.code === "conflict" &&
        rejectBlockedWeeklyCompletion.payload?.fieldErrors?.completion?.length > 0,
      `Weekly ReviewRun bypassed its completion blockers: ${JSON.stringify(rejectBlockedWeeklyCompletion.payload)}`
    );

    const updateWeeklySummary = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        id: weeklyReviewRun.id,
        expectedUpdatedAt: weeklyReviewRun.updatedAt,
        patch: {
          action: "update_summary",
          summary: {
            summary: "The weekly native ReviewRun exercised explicit evidence and ownership gates.",
            wins: "Native persistence remained isolated and auditable.",
            nextFocus: "Continue into the next verified phase."
          }
        }
      })
    });
    assert(
      updateWeeklySummary.response.ok &&
        updateWeeklySummary.payload?.item?.summary?.summary.includes("explicit evidence"),
      `Weekly ReviewRun summary save failed: ${JSON.stringify(updateWeeklySummary.payload)}`
    );
    weeklyReviewRun = updateWeeklySummary.payload.item;
    weeklyReviewView = updateWeeklySummary.payload.view;

    const rejectStaleWeeklyReview = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        id: weeklyReviewRun.id,
        expectedUpdatedAt: createWeeklyReviewRun.payload.item.updatedAt,
        patch: {
          action: "update_summary",
          summary: { summary: "This stale ReviewRun overwrite must not persist." }
        }
      })
    });
    assert(
      rejectStaleWeeklyReview.response.status === 409 && rejectStaleWeeklyReview.payload?.code === "stale",
      `Native Reviews accepted a stale overwrite: ${JSON.stringify(rejectStaleWeeklyReview.payload)}`
    );

    const weeklyFinanceEvidence = weeklyReviewRun.evidence.find(
      (item) => item.requirementId === "weekly-finance-snapshot"
    );
    assert(weeklyFinanceEvidence?.id, "Weekly template did not create its Finance evidence requirement");
    const rejectIncompleteEvidenceWaiver = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        id: weeklyReviewRun.id,
        expectedUpdatedAt: weeklyReviewRun.updatedAt,
        patch: {
          action: "update_evidence",
          evidence: { evidenceId: weeklyFinanceEvidence.id, state: "waived" }
        }
      })
    });
    assert(
      rejectIncompleteEvidenceWaiver.response.status === 400 &&
        rejectIncompleteEvidenceWaiver.payload?.code === "validation",
      `Review evidence was waived without reason and risk note: ${JSON.stringify(rejectIncompleteEvidenceWaiver.payload)}`
    );

    const waiveWeeklyFinanceEvidence = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        id: weeklyReviewRun.id,
        expectedUpdatedAt: weeklyReviewRun.updatedAt,
        patch: {
          action: "update_evidence",
          evidence: {
            evidenceId: weeklyFinanceEvidence.id,
            state: "waived",
            waiver: {
              reason: "The isolated regression environment has no Finance-owned ledger snapshot.",
              riskNote: "This waiver is test-only and cannot establish real Finance readiness."
            }
          }
        }
      })
    });
    assert(
      waiveWeeklyFinanceEvidence.response.ok &&
        waiveWeeklyFinanceEvidence.payload?.item?.evidence?.some(
          (item) => item.id === weeklyFinanceEvidence.id && item.state === "waived" && item.waiver?.riskNote
        ),
      `Structured Review evidence waiver failed: ${JSON.stringify(waiveWeeklyFinanceEvidence.payload)}`
    );
    weeklyReviewRun = waiveWeeklyFinanceEvidence.payload.item;
    weeklyReviewView = waiveWeeklyFinanceEvidence.payload.view;
    pass("Reviews requires CSRF proof, optimistic concurrency, summary state, and structured evidence waivers");

    const reviewContextSource = {
      module: "projects",
      objectType: "blocker",
      objectId: projectBlocker.id,
      containerObjectId: promotedProject.id,
      label: `${testRunId}-project-blocker`
    };
    const linkReviewContext = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        id: weeklyReviewRun.id,
        expectedUpdatedAt: weeklyReviewRun.updatedAt,
        patch: {
          action: "link_context",
          sourceRef: reviewContextSource,
          relationship: "blocker_source"
        }
      })
    });
    assert(
      linkReviewContext.response.ok &&
        linkReviewContext.payload?.item?.contextLinks?.some(
          (link) =>
            link.sourceRef?.objectId === projectBlocker.id &&
            link.sourceRef?.containerObjectId === promotedProject.id &&
            link.sourceRef?.route?.includes(`/admin/projects/${promotedProject.id}?tab=timeline`) &&
            link.state === "linked"
        ),
      `Review context link failed: ${JSON.stringify(linkReviewContext.payload)}`
    );
    weeklyReviewRun = linkReviewContext.payload.item;
    weeklyReviewView = linkReviewContext.payload.view;

    const linkReviewMediaContext = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        id: weeklyReviewRun.id,
        expectedUpdatedAt: weeklyReviewRun.updatedAt,
        patch: {
          action: "link_context",
          sourceRef: mediaUsageSourceRef,
          relationship: "evidence"
        }
      })
    });
    assert(
      linkReviewMediaContext.response.ok &&
        linkReviewMediaContext.payload?.item?.contextLinks?.some(
          (link) => link.sourceRef?.module === "media" && link.sourceRef?.objectId === createdMedia.id && link.state === "linked"
        ),
      `Review Media reference failed: ${JSON.stringify(linkReviewMediaContext.payload)}`
    );
    weeklyReviewRun = linkReviewMediaContext.payload.item;
    weeklyReviewView = linkReviewMediaContext.payload.view;
    const linkedReviewContext = weeklyReviewRun.contextLinks.find(
      (link) => link.sourceRef?.objectId === projectBlocker.id
    );

    const unlinkReviewContext = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        id: weeklyReviewRun.id,
        expectedUpdatedAt: weeklyReviewRun.updatedAt,
        patch: { action: "unlink_context", contextLinkId: linkedReviewContext.id }
      })
    });
    assert(
      unlinkReviewContext.response.ok &&
        unlinkReviewContext.payload?.item?.contextLinks?.some(
          (link) =>
            link.id === linkedReviewContext.id &&
            link.state === "removed" &&
            link.removedAt &&
            link.sourceRef?.objectId === projectBlocker.id &&
            link.sourceRef?.containerObjectId === promotedProject.id
        ),
      `Review context soft unlink failed: ${JSON.stringify(unlinkReviewContext.payload)}`
    );
    weeklyReviewRun = unlinkReviewContext.payload.item;
    weeklyReviewView = unlinkReviewContext.payload.view;
    const reloadedWeeklyContext = await requestJson(
      server.baseUrl,
      cookieJar,
      `/api/reviews/runs?id=${encodeURIComponent(weeklyReviewRun.id)}`
    );
    const reloadedNestedProjectRef = reloadedWeeklyContext.payload?.item?.contextLinks?.find(
      (link) => link.id === linkedReviewContext.id
    )?.sourceRef;
    assert(
      reloadedWeeklyContext.response.ok &&
        reloadedNestedProjectRef?.objectId === projectBlocker.id &&
        reloadedNestedProjectRef?.containerObjectId === promotedProject.id &&
        reloadedNestedProjectRef?.route ===
          `/admin/projects/${promotedProject.id}?tab=timeline&item=${encodeURIComponent(projectBlocker.id)}`,
      `Nested Project source lost its parent or canonical owner route after Review reload: ${JSON.stringify(reloadedNestedProjectRef)}`
    );
    pass("Review context unlink is soft and retains the nested Projects owner, parent, and canonical route");

    const mediaInUseWithReview = await requestText(
      server.baseUrl,
      cookieJar,
      `/admin/media/in-use?query=${encodeURIComponent(mediaTitle)}&selected=${encodeURIComponent(createdMedia.id)}&tab=usage&sort=locations-desc`
    );
    assert(
      mediaInUseWithReview.response.ok &&
        mediaInUseWithReview.body.includes(mediaTitle) &&
        mediaInUseWithReview.body.includes(promotedProject.name) &&
        mediaInUseWithReview.body.includes(`${testRunId}-media-reference-follow-up`) &&
        mediaInUseWithReview.body.includes(weeklyReviewRun.title) &&
        mediaInUseWithReview.body.includes(`/admin/reviews/${weeklyReviewRun.id}`),
      `Media In Use did not integrate the Review-owned reference: ${describeStatus(mediaInUseWithReview.response)}`
    );
    assert(
      countRenderedToken(mediaInUseWithReview.body, ">Open owner</a>") >= 3,
      "Media In Use did not expose first-class owner navigation for Project, Review, and Personal Ops locations"
    );
    await checkMediaInUseBrowserState(server.baseUrl, cookieJar, mediaTitle);
    const mediaSourceAfterInUseReads = await requestJson(
      server.baseUrl,
      cookieJar,
      "/api/personal/records"
    );
    const retainedMediaAfterInUse = mediaSourceAfterInUseReads.payload?.items?.find(
      (item) => item.id === createdMedia.id
    );
    assert(
      mediaSourceAfterInUseReads.response.ok &&
        retainedMediaAfterInUse &&
        JSON.stringify(retainedMediaAfterInUse) === sourceRecordSnapshots.get(createdMedia.id),
      "Media In Use reads changed the source Personal Record"
    );
    pass("Media In Use preserves three target-owned references, URL history, mobile focus, and zero mutations");

    const addReviewCarryForward = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        id: weeklyReviewRun.id,
        expectedUpdatedAt: weeklyReviewRun.updatedAt,
        patch: {
          action: "upsert_carry_forward",
          carryForward: {
            title: `${testRunId} next-phase follow-up`,
            sourceType: "summary",
            sourceId: "carryForward",
            sourceRef: {
              module: "reviews",
              objectType: "review_run",
              objectId: weeklyReviewRun.id,
              label: weeklyReviewRun.title
            },
            destinationModule: "personal_ops",
            destinationObjectType: "follow_up",
            ownerId: "Codex Regression",
            reason: "The next phase remains outside this ReviewRun.",
            nextAction: "Create or link the Personal Ops follow-up before the next review.",
            dueDate: "2026-07-20",
            state: "assigned"
          }
        }
      })
    });
    assert(
      addReviewCarryForward.response.ok &&
        addReviewCarryForward.payload?.item?.carryForward?.some(
          (item) =>
            item.title === `${testRunId} next-phase follow-up` &&
            item.state === "assigned" &&
            item.destinationModule === "personal_ops" &&
            item.ownerId &&
            item.reason &&
            item.nextAction
        ),
      `Review carry-forward did not preserve its explicit destination contract: ${JSON.stringify(addReviewCarryForward.payload)}`
    );
    weeklyReviewRun = addReviewCarryForward.payload.item;
    weeklyReviewView = addReviewCarryForward.payload.view;

    for (const checklistItem of weeklyReviewRun.checklist.filter((item) => item.required && item.state !== "complete")) {
      const resolveWeeklyChecklist = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken
        },
        body: JSON.stringify({
          id: weeklyReviewRun.id,
          expectedUpdatedAt: weeklyReviewRun.updatedAt,
          patch: {
            action: "update_checklist",
            checklist: { itemId: checklistItem.id, state: "complete" }
          }
        })
      });
      assert(
        resolveWeeklyChecklist.response.ok &&
          resolveWeeklyChecklist.payload?.item?.checklist?.find((item) => item.id === checklistItem.id)?.state === "complete",
        `Weekly checklist item did not resolve: ${checklistItem.definitionId}:${JSON.stringify(resolveWeeklyChecklist.payload)}`
      );
      weeklyReviewRun = resolveWeeklyChecklist.payload.item;
      weeklyReviewView = resolveWeeklyChecklist.payload.view;
    }
    assert(
      weeklyReviewView?.canComplete === true && weeklyReviewView.blockers?.length === 0,
      `Weekly ReviewRun remained blocked after its explicit requirements were resolved: ${JSON.stringify(weeklyReviewView)}`
    );

    const completeWeeklyReview = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        id: weeklyReviewRun.id,
        expectedUpdatedAt: weeklyReviewRun.updatedAt,
        patch: { action: "complete" }
      })
    });
    assert(
      completeWeeklyReview.response.ok &&
        completeWeeklyReview.payload?.item?.lifecycle === "completed" &&
        completeWeeklyReview.payload.item.completedAt &&
        completeWeeklyReview.payload.item.completedBy,
      `Weekly ReviewRun completion failed after blockers were resolved: ${JSON.stringify(completeWeeklyReview.payload)}`
    );
    weeklyReviewRun = completeWeeklyReview.payload.item;
    weeklyReviewView = completeWeeklyReview.payload.view;
    pass("Weekly ReviewRun persists carry-forward and cannot complete until all ten-check template gates resolve");

    const createMonthlyReviewRun = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        input: {
          cadence: "monthly",
          title: `${testRunId} Monthly Review`,
          periodStart: "2026-06-01",
          periodEnd: "2026-06-30",
          dueAt: "2026-07-01",
          ownerId: "Codex Regression",
          current: false
        }
      })
    });
    assert(
      createMonthlyReviewRun.response.ok &&
        createMonthlyReviewRun.payload?.item?.cadence === "monthly" &&
        createMonthlyReviewRun.payload.item.checklist?.length === 13,
      `Monthly ReviewRun did not instantiate the thirteen-check template: ${JSON.stringify(createMonthlyReviewRun.payload)}`
    );
    let monthlyReviewRun = createMonthlyReviewRun.payload.item;
    let monthlyReviewView = createMonthlyReviewRun.payload.view;

    const monthlyFinanceBridgePage = await requestText(
      server.baseUrl,
      cookieJar,
      `/admin/reviews/${encodeURIComponent(monthlyReviewRun.id)}?tab=finance&reload=${Date.now()}`
    );
    assert(
      monthlyFinanceBridgePage.response.ok &&
        monthlyFinanceBridgePage.body.includes("Finance-owned monthly close") &&
        monthlyFinanceBridgePage.body.includes("Read-only bridge"),
      `Monthly Review Finance tab did not render its ownership boundary: ${describeStatus(monthlyFinanceBridgePage.response)}`
    );
    assert(
      countRenderedToken(
        monthlyFinanceBridgePage.body,
        'href="/admin/finance/monthly-review"'
      ) >= 1,
      "Reviews Finance bridge did not target the canonical Finance Monthly Review route"
    );
    assert(
      countRenderedToken(monthlyFinanceBridgePage.body, 'href="/admin/finance?view=review"') === 0,
      "Reviews Finance bridge still targets the legacy Finance view query"
    );
    pass("Monthly Reviews bridge to the canonical read-only Finance Monthly Review route");

    const updateMonthlySummary = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        id: monthlyReviewRun.id,
        expectedUpdatedAt: monthlyReviewRun.updatedAt,
        patch: {
          action: "update_summary",
          summary: {
            summary: "Monthly close coordination is ready for its external Finance verification.",
            nextFocus: "Advance only after Finance owns and confirms close readiness."
          }
        }
      })
    });
    assert(updateMonthlySummary.response.ok, `Monthly Review summary save failed: ${JSON.stringify(updateMonthlySummary.payload)}`);
    monthlyReviewRun = updateMonthlySummary.payload.item;
    monthlyReviewView = updateMonthlySummary.payload.view;

    for (const evidenceItem of monthlyReviewRun.evidence.filter((item) => item.blocksCompletion)) {
      const sourceModule = evidenceItem.allowedSourceModules[0];
      const linkMonthlyEvidence = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken
        },
        body: JSON.stringify({
          id: monthlyReviewRun.id,
          expectedUpdatedAt: monthlyReviewRun.updatedAt,
          patch: {
            action: "update_evidence",
            evidence: {
              evidenceId: evidenceItem.id,
              state: "linked",
              sourceRef: {
                module: sourceModule,
                objectType: "review_evidence_source",
                objectId: `${testRunId}-${evidenceItem.requirementId}`,
                label: `${evidenceItem.title} regression source`
              }
            }
          }
        })
      });
      assert(
        linkMonthlyEvidence.response.ok &&
          linkMonthlyEvidence.payload?.item?.evidence?.find((item) => item.id === evidenceItem.id)?.state === "linked",
        `Monthly evidence requirement did not link: ${evidenceItem.requirementId}:${JSON.stringify(linkMonthlyEvidence.payload)}`
      );
      monthlyReviewRun = linkMonthlyEvidence.payload.item;
      monthlyReviewView = linkMonthlyEvidence.payload.view;
    }

    for (const checklistItem of monthlyReviewRun.checklist.filter((item) => item.required)) {
      const resolveMonthlyChecklist = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken
        },
        body: JSON.stringify({
          id: monthlyReviewRun.id,
          expectedUpdatedAt: monthlyReviewRun.updatedAt,
          patch: {
            action: "update_checklist",
            checklist: { itemId: checklistItem.id, state: "complete" }
          }
        })
      });
      assert(
        resolveMonthlyChecklist.response.ok &&
          resolveMonthlyChecklist.payload?.item?.checklist?.find((item) => item.id === checklistItem.id)?.state === "complete",
        `Monthly checklist item did not resolve: ${checklistItem.definitionId}:${JSON.stringify(resolveMonthlyChecklist.payload)}`
      );
      monthlyReviewRun = resolveMonthlyChecklist.payload.item;
      monthlyReviewView = resolveMonthlyChecklist.payload.view;
    }
    assert(
      monthlyReviewView?.canComplete === false &&
        monthlyReviewView.blockers?.length === 1 &&
        monthlyReviewView.blockers[0]?.type === "external_gate" &&
        monthlyReviewView.blockers[0]?.routeTab === "finance",
      `Monthly Review did not stop exclusively at the Finance-owned external gate: ${JSON.stringify(monthlyReviewView)}`
    );

    const rejectMonthlyFinanceClose = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        id: monthlyReviewRun.id,
        expectedUpdatedAt: monthlyReviewRun.updatedAt,
        patch: { action: "complete" }
      })
    });
    assert(
      rejectMonthlyFinanceClose.response.status === 409 &&
        rejectMonthlyFinanceClose.payload?.code === "conflict" &&
        rejectMonthlyFinanceClose.payload?.fieldErrors?.completion?.some((message) => message.includes("Finance close")),
      `Monthly Review completed without Finance-owned close verification: ${JSON.stringify(rejectMonthlyFinanceClose.payload)}`
    );
    pass("Monthly Review resolves thirteen native checks but remains honestly blocked by Finance's external close gate");

    const monthlyDecisionReadinessChecks = [
      "Finance decisions filed",
      "Budget variance decisions resolved",
      "Carry-forward destinations selected",
      "Project blockers assigned",
      "Personal Ops decisions created",
      "Evidence linked to high-risk decisions",
      "Waived decisions have reasons",
      "Deferred decisions have review dates",
      "Monthly decision summary saved"
    ];
    const monthlyDecisionPage = await requestText(
      server.baseUrl,
      cookieJar,
      `/admin/reviews/${encodeURIComponent(monthlyReviewRun.id)}?tab=decisions&reload=${Date.now()}`
    );
    assert(
      monthlyDecisionPage.response.ok && monthlyDecisionPage.body.includes("Decision readiness · nine explicit checks"),
      `Monthly Decisions route did not render its explicit readiness ledger: ${describeStatus(monthlyDecisionPage.response)}`
    );
    for (const check of monthlyDecisionReadinessChecks) {
      assert(monthlyDecisionPage.body.includes(check), `Monthly Decisions route omitted readiness check: ${check}`);
    }
    assert(
      !monthlyDecisionPage.body.includes("readiness percentage"),
      "Monthly Decisions route introduced an undocumented readiness percentage"
    );
    pass("Monthly Decisions renders all nine explicit readiness checks without an invented score");

    const archiveMonthlyReview = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        id: monthlyReviewRun.id,
        expectedUpdatedAt: monthlyReviewRun.updatedAt,
        patch: {
          action: "archive",
          reason: "Regression verifies reversible ReviewRun archive without legacy deletion."
        }
      })
    });
    assert(
      archiveMonthlyReview.response.ok &&
        archiveMonthlyReview.payload?.item?.lifecycle === "archived" &&
        archiveMonthlyReview.payload.item.archivedAt &&
        archiveMonthlyReview.payload.item.lifecycleBeforeArchive,
      `Monthly Review soft archive failed: ${JSON.stringify(archiveMonthlyReview.payload)}`
    );

    const reviewsWithoutArchive = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs");
    const reviewsWithArchive = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs?includeArchived=1");
    assert(
      reviewsWithoutArchive.response.ok &&
        !reviewsWithoutArchive.payload?.items?.some((view) => view.run?.id === monthlyReviewRun.id) &&
        reviewsWithArchive.payload?.items?.some(
          (view) => view.run?.id === monthlyReviewRun.id && view.run.lifecycle === "archived"
        ),
      "Archived ReviewRun was not hidden by default and retained with includeArchived"
    );

    const restoreMonthlyReview = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        id: monthlyReviewRun.id,
        expectedUpdatedAt: archiveMonthlyReview.payload.item.updatedAt,
        patch: { action: "restore" }
      })
    });
    assert(
      restoreMonthlyReview.response.ok &&
        restoreMonthlyReview.payload?.item?.lifecycle === "in_progress" &&
        !restoreMonthlyReview.payload.item.archivedAt,
      `Monthly Review restore failed: ${JSON.stringify(restoreMonthlyReview.payload)}`
    );
    monthlyReviewRun = restoreMonthlyReview.payload.item;
    monthlyReviewView = restoreMonthlyReview.payload.view;

    const persistedNativeReviews = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs?includeArchived=1");
    assert(
      persistedNativeReviews.response.ok &&
        persistedNativeReviews.payload?.state?.runs?.length === 2 &&
        persistedNativeReviews.payload.state.runs.some(
          (run) => run.id === weeklyReviewRun.id && run.lifecycle === "completed" && run.carryForward?.length === 1
        ) &&
        persistedNativeReviews.payload.state.runs.some(
          (run) => run.id === monthlyReviewRun.id && run.lifecycle === "in_progress"
        ) &&
        persistedNativeReviews.payload.state.auditEvents?.length >= 20,
      `Native ReviewRuns or audit history did not persist: ${JSON.stringify(persistedNativeReviews.payload)}`
    );

    const weeklyReviewDetail = await requestText(
      server.baseUrl,
      cookieJar,
      `/admin/reviews/${encodeURIComponent(weeklyReviewRun.id)}?tab=overview&reload=${Date.now()}`
    );
    assert(
      weeklyReviewDetail.response.ok &&
        weeklyReviewDetail.body.includes(`${testRunId} Weekly Review`) &&
        weeklyReviewDetail.body.includes("Completed") &&
        weeklyReviewDetail.body.includes("Completed Review reopen semantics are intentionally unresolved."),
      `Canonical completed Review detail did not preserve read-only context: ${describeStatus(weeklyReviewDetail.response)}`
    );
    pass("Native ReviewRun create, update, complete, archive, restore, reload, and audit state persist independently");

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
    pass("Legacy weekly review create and update flow remains intact");

    const legacyWeeklyListPage = await requestText(server.baseUrl, cookieJar, "/admin/reviews/weekly");
    const legacyMonthlyListPage = await requestText(server.baseUrl, cookieJar, "/admin/reviews/monthly");
    const legacyWeeklyDetailPage = await requestText(
      server.baseUrl,
      cookieJar,
      `/admin/reviews/weekly/${encodeURIComponent(reviewId)}`
    );
    assert(
      legacyWeeklyListPage.response.ok && legacyWeeklyListPage.body.includes("Live history"),
      `Legacy Weekly Review list route failed: ${describeStatus(legacyWeeklyListPage.response)}`
    );
    assert(
      legacyMonthlyListPage.response.ok && legacyMonthlyListPage.body.includes("Monthly Review"),
      `Legacy Monthly Review list route failed: ${describeStatus(legacyMonthlyListPage.response)}`
    );
    assert(
      legacyWeeklyDetailPage.response.ok && legacyWeeklyDetailPage.body.includes("Weekly Review Form"),
      `Legacy Weekly Review detail route failed: ${describeStatus(legacyWeeklyDetailPage.response)}`
    );

    const convertLegacyReview = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ action: "convert_legacy", legacyReviewEntryId: reviewId })
    });
    assert(
      convertLegacyReview.response.ok &&
        convertLegacyReview.payload?.created === true &&
        convertLegacyReview.payload.item?.legacyReviewEntryId === reviewId &&
        convertLegacyReview.payload.item.checklist?.length === 10 &&
        convertLegacyReview.payload.mapping?.legacyReviewEntryId === reviewId,
      `Explicit legacy Review conversion failed: ${JSON.stringify(convertLegacyReview.payload)}`
    );

    const convertLegacyReviewAgain = await requestJson(server.baseUrl, cookieJar, "/api/reviews/runs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ action: "convert_legacy", legacyReviewEntryId: reviewId })
    });
    assert(
      convertLegacyReviewAgain.response.ok &&
        convertLegacyReviewAgain.payload?.created === false &&
        convertLegacyReviewAgain.payload.item?.id === convertLegacyReview.payload.item.id &&
        convertLegacyReviewAgain.payload.mapping?.id === convertLegacyReview.payload.mapping.id,
      `Legacy Review conversion was not idempotent: ${JSON.stringify(convertLegacyReviewAgain.payload)}`
    );

    const legacyReviewAfterConversion = await requestJson(
      server.baseUrl,
      cookieJar,
      `/api/reviews?id=${encodeURIComponent(reviewId)}&kind=weekly`
    );
    const nativeStateAfterLegacyConversion = await requestJson(
      server.baseUrl,
      cookieJar,
      "/api/reviews/runs?includeArchived=1"
    );
    assert(
      legacyReviewAfterConversion.response.ok &&
        legacyReviewAfterConversion.payload?.item?.values?.blockers === `${testRunId}-blocker` &&
        nativeStateAfterLegacyConversion.payload?.state?.legacyMappings?.length === 1 &&
        nativeStateAfterLegacyConversion.payload.state.runs?.length === 3,
      "Legacy Review conversion did not preserve the original entry alongside one native mapping"
    );
    pass("Legacy Review APIs and routes remain compatible while explicit conversion is idempotent and non-destructive");

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
    console.error(error instanceof Error ? error.stack || error.message : String(error));
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
