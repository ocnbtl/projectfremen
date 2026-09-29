const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const base = "http://127.0.0.1:3198",
  out = path.resolve("output/workspace-review"),
  run = Date.now();
async function choose(page, label, value) {
  const trigger = page.getByLabel(label, { exact: true });
  if (await trigger.evaluate((n) => n.tagName === "SELECT"))
    return trigger.selectOption(value);
  await trigger.click();
  await page.locator(`[role="option"][data-select-value="${value}"]`).click();
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "America/New_York",
    recordVideo: { dir: path.join(out, "behavior-recordings") },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.request.post(`${base}/api/admin/login`, {
      form: { password: "local-design-fixture" },
    });
    await page.goto(`${base}/admin/calendar`);
    await page.getByRole("button", { name: "Add event", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill(`Calendar UI ${run}`);
    const width = await page
      .getByRole("button", { name: "Start time", exact: true })
      .evaluate((n) => n.getBoundingClientRect().width);
    assert.ok(width >= 130, "Readable time control");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.waitForTimeout(280);
    assert.equal(
      await page.evaluate(() =>
        document.activeElement === document.body
          ? "BODY"
          : document.activeElement.textContent.trim(),
      ),
      "Add event",
      "Restore opener focus",
    );
    await page.getByRole("button", { name: "Resume draft" }).click();
    await page.getByRole("button", { name: "Start time", exact: true }).click();
    await page.locator('input[type="time"]').fill("18:00");
    await page.locator('input[type="time"]').press("Enter");
    await page.getByRole("button", { name: "End time", exact: true }).click();
    await page.locator('input[type="time"]').fill("19:00");
    await page.locator('input[type="time"]').press("Enter");
    assert.equal(
      await page.getByLabel("Title", { exact: true }).inputValue(),
      `Calendar UI ${run}`,
    );
    await page.getByRole("button", { name: "Save event", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    let snapshot = await (
      await page.request.get(`${base}/api/planning`)
    ).json();
    assert.ok(
      snapshot.state.events.find((e) => e.title === `Calendar UI ${run}`),
    );
    console.log("PASS Calendar draft, focus, save and server readback");
    await choose(page, "Calendar view", "day");
    const resize = page.getByRole("button", {
      name: `Resize Calendar UI ${run}; use up or down arrows to change by 30 minutes`,
    });
    await resize.scrollIntoViewIfNeeded();
    await resize.focus();
    await page.keyboard.press("ArrowDown");
    await page.getByText("Event duration updated", { exact: true }).waitFor();
    let resized = await (await page.request.get(`${base}/api/planning`)).json();
    assert.ok(
      resized.state.events
        .find((e) => e.title === `Calendar UI ${run}`)
        .end.includes("19:30"),
      "Keyboard resize persisted",
    );
    console.log("PASS Calendar resize persists duration");
    const empty = page
      .getByRole("button", { name: /Add event .* at 16:00/ })
      .first();
    await empty.scrollIntoViewIfNeeded();
    const box = await empty.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 8);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 78, { steps: 5 });
    await page.mouse.up();
    await page.getByRole("dialog").waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Start time", exact: true })
        .getAttribute("data-value"),
      "16:00",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "End time", exact: true })
        .getAttribute("data-value"),
      "17:30",
    );
    await page
      .getByLabel("Title", { exact: true })
      .fill(`Dragged block ${run}`);
    await page.getByRole("button", { name: "Save event", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    console.log("PASS Drag creates a time range");
    const late = page
      .getByRole("button", { name: /Add event .* at 23:30/ })
      .first();
    await late.scrollIntoViewIfNeeded();
    await late.focus();
    await page.keyboard.press("Enter");
    await page
      .getByLabel("Title", { exact: true })
      .fill(`Midnight boundary ${run}`);
    const start = await page
        .getByRole("button", { name: "Starts", exact: true })
        .getAttribute("data-value"),
      end = await page
        .getByRole("button", { name: "Ends", exact: true })
        .getAttribute("data-value");
    assert.ok(end > start, "Late creation crosses midnight");
    await page.getByRole("button", { name: "Save event", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    console.log("PASS Keyboard time-slot creation across midnight");
    const firstEvent = snapshot.state.events.find(
      (e) => e.title === `Calendar UI ${run}`,
    );
    await page.goto(`${base}/admin/calendar?selected=${firstEvent.id}`);
    await page.getByRole("dialog").waitFor();
    await page
      .getByText("Calendar, repeat, people and location", { exact: true })
      .click();
    await page.getByLabel("Link a record", { exact: true }).fill("Alexandra");
    await page
      .getByRole("button", { name: /Alexandra Morgan-Williams.*people/ })
      .click();
    await page.getByRole("button", { name: "Save event", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    snapshot = await (await page.request.get(`${base}/api/planning`)).json();
    const saved = snapshot.state.events.find((e) => e.id === firstEvent.id);
    assert.equal(saved.linkedRefs[0].label, "Alexandra Morgan-Williams");
    const related = await (
      await page.request.get(
        `${base}/api/planning/related?module=people&type=person&id=${saved.linkedRefs[0].objectId}`,
      )
    ).json();
    assert.ok(related.items.find((x) => x.ref.objectId === firstEvent.id));
    console.log("PASS Event-to-People relationship resolves from owner");
    await page.goto(`${base}/admin/map`);
    await page.getByRole("button", { name: "Save place", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill(`Map place ${run}`);
    await page.getByLabel("Latitude", { exact: true }).fill("39.1");
    await page.getByLabel("Longitude", { exact: true }).fill("-84.5");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save place", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    snapshot = await (await page.request.get(`${base}/api/planning`)).json();
    const place = snapshot.state.places.find(
      (p) => p.name === `Map place ${run}`,
    );
    assert.ok(place);
    console.log("PASS Place save and readback");
    await page.getByRole("button", { name: "Plan trip", exact: true }).click();
    await page
      .getByLabel("Trip name", { exact: true })
      .fill(`Connected trip ${run}`);
    await choose(page, "Add a saved place", place.id);
    await choose(page, "Add a saved place", "studio");
    await page.getByRole("button", { name: "Save trip", exact: true }).click();
    await page
      .getByText("Trip saved. Its dates are available in Calendar.", {
        exact: true,
      })
      .first()
      .waitFor();
    const life = await (
      await page.request.get(`${base}/api/personal/life`)
    ).json();
    const trip = life.state.trips.find(
      (t) => t.name === `Connected trip ${run}`,
    );
    assert.equal(trip.stops.length, 2);
    assert.equal(trip.stops[0].placeId, place.id);
    console.log("PASS Map trip retains Personal ownership and ordered stops");
    await page
      .getByRole("button", { name: "Close details", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/admin/calendar`);
    await page.getByRole("button", { name: "Add event", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill("Phone draft");
    await page.screenshot({
      path: path.join(out, "calendar-phone-editor.png"),
    });
    const saveBounds = await page
      .getByRole("button", { name: "Save event", exact: true })
      .boundingBox();
    assert.ok(
      saveBounds.y + saveBounds.height < 844,
      "Save is visible in phone editor",
    );
    await page.keyboard.press("Escape");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${base}/admin/projects`);
    await page.locator('[role="listitem"]').first().waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: path.join(out, "projects-phone-verified.png"),
    });
    assert.deepEqual(errors, []);
    console.log("PASS Phone editor, reduced motion and no JavaScript errors");
  } catch (error) {
    await page.screenshot({ path: path.join(out, "behavior-failure.png") });
    console.error(error);
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
  }
})();
