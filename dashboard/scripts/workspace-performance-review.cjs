const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const base = "http://127.0.0.1:3198",
  out = path.resolve("output/workspace-review/performance.json");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "America/New_York",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const measurements = {
    fixtureCount: 1000,
    environment:
      "Local Chromium development build; warm route, synthetic network responses; not production or physical-device timings",
  };
  try {
    await page.request.post(`${base}/api/admin/login`, {
      form: { password: "local-design-fixture" },
    });
    const snapshot = await (
      await page.request.get(`${base}/api/planning`)
    ).json();
    const today = new Date().toLocaleDateString("en-CA"),
      stamp = new Date().toISOString();
    const longName =
      "Riverside studio archive and accessible courtyard entrance";
    snapshot.state.places = Array.from({ length: 1000 }, (_, i) => ({
      id: `perf-place-${i}`,
      createdAt: stamp,
      updatedAt: stamp,
      name: `Place ${String(i).padStart(4, "0")} · ${longName}`,
      address: i % 3 ? "Cincinnati, Ohio" : "",
      latitude: 39 + (i % 30) / 100,
      longitude: -84 + (i % 27) / 100,
      notes: "",
      tags: [],
      linkedRefs: [],
    }));
    snapshot.state.events = Array.from({ length: 1000 }, (_, i) => ({
      id: `perf-event-${i}`,
      createdAt: stamp,
      updatedAt: stamp,
      title: `Event ${String(i).padStart(4, "0")} · ${longName}`,
      description: "",
      start: `${today}T09:00:00`,
      end: `${today}T10:00:00`,
      timeZone: "America/New_York",
      calendarId: "native",
      allDay: false,
      kind: "event",
      reminderMinutes: null,
      recurrence: "",
      exceptions: {},
      linkedRefs: [],
      location: "",
    }));
    await page.route(`${base}/api/planning`, (route) =>
      route.fulfill({ json: snapshot }),
    );
    await page.goto(`${base}/admin/map`);
    await page.getByRole("button", { name: /Place 0999/ }).waitFor();
    let start = Date.now();
    await page.getByPlaceholder("Search saved places").fill("Place 0999");
    await page.waitForFunction(
      () => document.querySelectorAll(".work-row[aria-pressed]").length === 1,
    );
    measurements.mapFilterMs = Date.now() - start;
    start = Date.now();
    await page.getByRole("button", { name: /Place 0999/ }).click();
    await page.getByRole("heading", { name: /Place 0999/ }).waitFor();
    measurements.mapSelectionMs = Date.now() - start;
    await page.goto(`${base}/admin/calendar`);
    await page
      .getByRole("button", { name: /1000 overlapping events/ })
      .waitFor();
    start = Date.now();
    await page.getByRole("button", { name: /1000 overlapping events/ }).click();
    const overlap = page.getByRole("dialog", { name: "Overlapping events" });
    await overlap.getByRole("button", { name: /Event 0000/ }).waitFor();
    measurements.calendarOverlapOpenMs = Date.now() - start;
    assert.equal(
      await overlap.locator(".work-row").count(),
      50,
      "Bounded initial overlap list",
    );
    start = Date.now();
    await overlap.getByLabel("Find an overlapping event").fill("Event 0999");
    await overlap.getByRole("button", { name: /Event 0999/ }).waitFor();
    measurements.calendarOverlapSearchMs = Date.now() - start;
    await page.keyboard.press("Escape");
    await overlap.waitFor({ state: "hidden" });
    start = Date.now();
    await page.getByPlaceholder("Search events").fill("Event 0999");
    await page
      .getByRole("button", { name: /Event 0999/ })
      .first()
      .waitFor();
    measurements.calendarFilterMs = Date.now() - start;
    for (const [key, value] of Object.entries(measurements))
      if (key.endsWith("Ms"))
        assert.ok(
          value < 1500,
          `${key} exceeded 1.5s coarse local regression ceiling: ${value}`,
        );
    assert.deepEqual(errors, []);
    const luminance = (hex) => {
      const rgb = hex
        .match(/[a-f\d]{2}/gi)
        .map((v) => parseInt(v, 16) / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    };
    measurements.contrast = [];
    for (const ink of [
      "102026",
      "23383f",
      "60747c",
      "133c5e",
      "526442",
      "565b86",
    ])
      for (const surface of ["ffffff", "f4f7f5"]) {
        const a = luminance(ink),
          b = luminance(surface),
          ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        assert.ok(ratio >= 4.5, `Contrast ${ink} / ${surface} = ${ratio}`);
        measurements.contrast.push({
          ink,
          surface,
          ratio: Math.round(ratio * 100) / 100,
        });
      }
    fs.writeFileSync(out, JSON.stringify(measurements, null, 2));
    console.log(JSON.stringify(measurements));
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
