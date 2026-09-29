const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict"),
  path = require("node:path"),
  fs = require("node:fs");
const base = "http://127.0.0.1:3198",
  out = path.resolve("output/workspace-review");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "America/New_York",
    recordVideo: { dir: path.join(out, "finish-recordings") },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.request.post(`${base}/api/admin/login`, {
    form: { password: "local-design-fixture" },
  });
  try {
    await page.goto(`${base}/admin/calendar`);
    await page
      .getByRole("button", {
        name: /overlapping events on.*Review the Riverside/,
      })
      .first()
      .click();
    await page
      .getByRole("dialog", { name: "Overlapping events" })
      .getByRole("button", { name: /Review the Riverside/ })
      .click();
    const editor = page.getByRole("dialog", { name: "Edit event" });
    await editor.waitFor();
    await page.waitForTimeout(400);
    assert.ok(
      await editor.evaluate((n) => n.contains(document.activeElement)),
      "Replacement editor owns focus",
    );
    await page.keyboard.press("Escape");
    await editor.waitFor({ state: "hidden" });
    console.log("PASS Overlap-to-editor focus ownership");
    const headers = {
      "x-csrf-token": (await context.cookies()).find(
        (c) => c.name === "admin_csrf",
      ).value,
    };
    const today = await page.evaluate(() =>
      new Date().toLocaleDateString("en-CA"),
    );
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - 2);
    const earlier = d.toLocaleDateString("en-CA");
    const result = await page.request.post(`${base}/api/planning`, {
      headers,
      data: {
        operation: "save",
        collection: "events",
        input: {
          title: `Reminder occurrence QA ${Date.now()}`,
          description: "",
          start: `${earlier}T01:00:00`,
          end: `${earlier}T02:00:00`,
          calendarId: "native",
          timeZone: "America/New_York",
          allDay: false,
          kind: "event",
          reminderMinutes: 15,
          recurrence: "FREQ=DAILY;COUNT=3",
          exceptions: {},
          linkedRefs: [],
          location: "",
        },
      },
    });
    assert.ok(result.ok(), await result.text());
    await page.getByRole("button", { name: /^Reminders/ }).click();
    const reminder = page
      .getByRole("dialog", { name: "Reminders" })
      .getByRole("link", { name: /Reminder occurrence QA/ })
      .first();
    await reminder.waitFor();
    const href = await reminder.getAttribute("href");
    assert.ok(href.includes("occurrence="));
    await reminder.click();
    await editor.waitFor();
    await page.waitForTimeout(350);
    assert.equal(
      await page
        .getByRole("button", { name: "Starts", exact: true })
        .getAttribute("data-value"),
      today,
      "Reminder opens the current occurrence, not its series origin",
    );
    assert.ok(
      await editor.evaluate((n) => n.contains(document.activeElement)),
      "Notification sheet does not steal focus",
    );
    await page.keyboard.press("Escape");
    console.log("PASS Recurring reminder occurrence and dialog focus");
    await page.route("**/api/planning/notifications?*", (route) =>
      route.fulfill({ status: 503, json: { error: "Unavailable" } }),
    );
    await page.goto(`${base}/admin/calendar`);
    await page.getByRole("button", { name: /^Reminders/ }).click();
    await page
      .getByRole("dialog", { name: "Reminders" })
      .getByRole("alert")
      .waitFor();
    assert.equal(await page.getByText(/No reminders due/).count(), 0);
    await page.keyboard.press("Escape");
    await page.unroute("**/api/planning/notifications?*");
    console.log("PASS Reminder failure is distinct from empty");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/admin/calendar`);
    await page.waitForTimeout(600);
    assert.equal(
      await page
        .locator("summary")
        .filter({ hasText: /reminders due/ })
        .count(),
      0,
    );
    await page.screenshot({
      path: path.join(out, "calendar-phone-finished.png"),
    });
    await page.goto(`${base}/admin/map`);
    await page.locator(".maplibregl-ctrl-attrib").waitFor();
    const attribution = await page
      .locator(".maplibregl-ctrl-attrib")
      .boundingBox();
    const launcher = await page
      .getByRole("button", { name: /Open AI assistant/ })
      .boundingBox();
    if (launcher) {
      assert.ok(
        attribution.y + attribution.height <= launcher.y ||
          attribution.x + attribution.width <= launcher.x,
        "Attribution clear of assistant",
      );
      const zoom = await page
        .getByRole("button", { name: "Zoom out", exact: true })
        .boundingBox();
      assert.ok(zoom.y + zoom.height <= launcher.y, "Zoom clear of assistant");
    }
    await page.screenshot({ path: path.join(out, "map-phone-finished.png") });
    console.log("PASS Phone Calendar and map attribution");
    for (const width of [768, 1024, 1280])
      for (const module of ["projects", "notes", "calendar", "map", "media"]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${base}/admin/${module}`);
        await page.locator("h1").first().waitFor();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          ),
          false,
          `${module} overflow at ${width}`,
        );
      }
    console.log(
      "PASS Intermediate widths 768, 1024 and 1280 for representative modules",
    );
    // Effective CSS width at a 1440px display with 200% browser zoom. This is
    // a reflow simulation, not a claim of physical browser-zoom verification.
    await page.setViewportSize({ width: 720, height: 500 });
    await page.goto(`${base}/admin/calendar`);
    await page.screenshot({
      path: path.join(out, "calendar-zoom-reflow-simulation.png"),
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      "Calendar reflows at 720 CSS px",
    );
    assert.deepEqual(errors, []);
    console.log("PASS Effective 200% zoom width simulation and no page errors");
  } catch (e) {
    await page.screenshot({ path: path.join(out, "finish-failure.png") });
    throw e;
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
