const { chromium } = require("@playwright/test");
const fs = require("node:fs"),
  path = require("node:path");
const base = "http://127.0.0.1:3198",
  out = path.resolve("output/workspace-review");
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    recordVideo: {
      dir: path.join(out, "recordings"),
      size: { width: 1440, height: 1000 },
    },
  });
  const errors = [];
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.request.post(`${base}/api/admin/login`, {
    form: { password: "local-design-fixture", successPath: "/admin/calendar" },
  });
  for (const route of [
    "calendar",
    "map",
    "projects",
    "notes",
    "media",
    "people",
    "reviews",
    "resources",
    "finance",
    "personal",
  ]) {
    await page.goto(`${base}/admin/${route}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page
      .locator("h1")
      .first()
      .waitFor({ state: "attached", timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, `${route}-desktop.png`) });
    console.log(
      JSON.stringify({
        route,
        title: await page.title(),
        overflow: await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        headings: await page.locator("h1").allTextContents(),
      }),
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["calendar", "map", "projects", "notes", "media"]) {
    await page.goto(`${base}/admin/${route}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page
      .locator("h1")
      .first()
      .waitFor({ state: "attached", timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, `${route}-phone.png`) });
    console.log(
      JSON.stringify({
        route,
        phone: true,
        overflow: await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      }),
    );
  }
  fs.writeFileSync(
    path.join(out, "browser-errors.json"),
    JSON.stringify(errors, null, 2),
  );
  console.log(JSON.stringify({ errors, output: out }));
  await context.close();
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
