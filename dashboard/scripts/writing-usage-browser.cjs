const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {spawn} = require("node:child_process");
const {chromium, expect} = require("@playwright/test");
const {buildSignedAdminSessionToken} = require("../lib/auth.ts");

module.exports = async function testLibrary({temp, adText, ad, note, writeRecords, copy}) {
  const id = crypto.randomUUID();
  const manifest = {format:"unigentamos-vault-media-v1", digestAlgorithm:"chunk-root-v1", objectId:id, mediaId:id,
    contentRoot:"a".repeat(64), byteLength:12, chunkSize:1048576, totalChunks:1, fileName:"Ad.png", mimeType:"image/png", createdAt:ad.createdAt};
  writeRecords([{...ad, mediaProfile:{version:1, manifest, linkedRefs:[], altText:""}}, {...note, body:note.body + "\n" + copy}]);
  const secret = crypto.randomUUID(), port = crypto.randomInt(22000, 35000), base = "http://127.0.0.1:" + port;
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd:path.resolve(__dirname,".."), env:{...process.env, FREMEN_DATA_DIR:temp, VERCEL:"", ADMIN_PASSWORD:"fixture", ADMIN_SESSION_SECRET:secret}, windowsHide:true,
    stdio:["ignore", "pipe", "pipe"]
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error("Dashboard startup timed out")), 25000);
      server.stdout.on("data", data => { if (String(data).includes("Ready in")) { clearTimeout(timeout); resolve(); } });
      server.once("error", reject);
      server.once("exit", code => { clearTimeout(timeout); reject(Error("Dashboard exited " + code)); });
    });
    const installed = "C:/Program Files/Google/Chrome/Application/chrome.exe";
    browser = await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE || (fs.existsSync(installed) ? installed : undefined)});
    const context = await browser.newContext({viewport:{width:1280, height:860}, serviceWorkers:"block"});
    await context.addCookies([{name:"admin_session", url:base, value:buildSignedAdminSessionToken(secret, 300)}, {name:"admin_csrf", url:base, value:crypto.randomUUID()}]);
    await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    // Record clipboard writes in the browser without touching the user's OS clipboard.
    await context.addInitScript(() => {
      window.fixtureCopies = [];
      Object.defineProperty(navigator, "clipboard", {value:{writeText:async text => { window.fixtureCopies.push(text); }}});
    });
    const page = await context.newPage();
    const settings = base + "/admin/personal/settings";
    await page.goto(settings);
    const sections = page.getByRole("navigation", {name:"Settings sections"});
    for (const name of ["Writing","Accessibility","Calendar and Map","Language and region","Calendar and tasks","Home and navigation","Search","Notifications"]) {
      await expect(sections.getByRole("link",{name:new RegExp("^"+name)})).toBeVisible();
    }
    await sections.getByRole("link", {name:/Writing/}).click();
    const object = page.getByRole("region", {name:"Object links"}), skills = page.getByRole("region", {name:"Skill shortcuts"});
    await expect(object).toContainText("@@Alex");
    await expect(skills).toContainText("##Prompt");
    await object.getByLabel("Object shortcut", {exact:true}).fill("##");
    await page.getByRole("button", {name:"Save shortcuts"}).click();
    await expect(page.getByRole("main", {name:"Personal settings"}).getByRole("alert")).toContainText("distinct shortcuts");
    await object.getByLabel("Object shortcut", {exact:true}).fill("!!");
    await page.getByRole("button", {name:"Save shortcuts"}).click();
    await page.reload();
    await expect(object).toContainText("!!Alex");
    await page.setViewportSize({width:390, height:844});
    const upper = await object.boundingBox(), lower = await skills.boundingBox();
    assert.ok(upper && lower && lower.y >= upper.y + upper.height && lower.x + lower.width <= 390);
    await page.getByRole("main", {name:"Personal settings"}).getByRole("link", {name:"Settings",exact:true}).click();
    await sections.getByRole("link", {name:/Accessibility/}).click();
    await page.getByRole("switch", {name:"Stronger keyboard focus"}).check();
    await page.getByRole("switch", {name:"Reduce motion"}).check();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-strong-focus", "");
    await expect(page.locator("html")).toHaveAttribute("data-product-motion", "reduce");
    await page.getByLabel("Reading text size").selectOption("larger");
    await expect(page.locator("html")).toHaveAttribute("data-reading-size","larger");
    await page.goto(settings + "/regional");
    await page.getByLabel("Clock",{exact:true}).selectOption("24");
    await page.getByLabel("First day of the week",{exact:true}).selectOption("monday");
    await page.goto(settings + "/navigation");
    await page.getByLabel("After sign-in and from the home logo",{exact:true}).selectOption("/admin/notes");
    await expect(page.getByRole("link",{name:"Unigentamos home"})).toHaveAttribute("href","/admin/notes");
    await page.goto(settings + "/planning");
    await page.getByLabel("Task kind",{exact:true}).selectOption("routine");
    await page.getByRole("switch",{name:"Start new tasks on the selected day"}).check();
    await page.getByLabel("Appointments",{exact:true}).selectOption("30");
    await page.getByRole("link",{name:"Manage calendars and subscriptions"}).click();
    await expect(page.getByRole("dialog").last()).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button",{name:"Add event",exact:true}).click();
    await expect(page.getByLabel("Reminder amount")).toHaveValue("30");
    await page.keyboard.press("Escape");
    await page.goto(settings + "/calendar-map");
    const second = await context.newPage();
    await second.goto(settings + "/calendar-map");
    await page.getByRole("switch", {name:"Addresses",exact:true}).uncheck();
    await expect(second.getByRole("switch", {name:"Addresses",exact:true})).not.toBeChecked();
    await second.getByRole("switch", {name:"Use images for pins"}).check();
    await expect(page.getByRole("switch", {name:"Use images for pins"})).toBeChecked();
    assert.equal(await page.evaluate(() => localStorage.getItem("map:pin-display")), "images");
    await second.close();
    await page.setViewportSize({width:1280, height:860});
    console.log("Settings navigation, mobile panels, custom shortcuts, accessible display, and cross-tab Calendar and Map preferences passed.");
    await page.goto(base + "/admin/personal/settings?skill=prompt");
    const library = page.getByRole("region", {name:"Prompt saved uses", exact:true});
    await library.getByRole("searchbox").fill("Artwork");
    await expect(library.getByRole("link")).toHaveCount(1);
    const copyTwice = async (button, expected) => {
      await button.click();
      await button.click();
      assert.deepEqual(await page.evaluate(() => window.fixtureCopies.slice(-2)), [expected, expected]);
    };
    await copyTwice(library.getByRole("button", {name:/Copy prompt|Copied/}), adText);
    await library.getByRole("link", {name:"Artwork"}).click();
    await expect(page.getByRole("textbox", {name:"Media notes"})).toBeVisible();
    await copyTwice(page.getByRole("button", {name:/Copy prompt|Copied/}).first(), adText);
    await page.goto(base + "/admin/personal/canvas?board=sample&card=linked");
    await page.locator('.react-flow__node[data-id="linked"]').getByRole("button", {name:/Item actions/}).click();
    await page.getByRole("menuitem", {name:"Edit", exact:true}).click();
    await copyTwice(page.getByRole("dialog").getByRole("button", {name:/Copy prompt|Copied/}), adText);
    await page.goto(base + "/admin/notes/note");
    const copies = page.locator(".work-prose:visible").getByRole("button", {name:/Copy prompt|Copied/});
    await expect(copies).toHaveCount(2);
    await copyTwice(copies.nth(0), "First paragraph\n\nSecond paragraph");
    await copyTwice(copies.nth(1), "Separate prompt");
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw Error("Clipboard unavailable"); }; });
    await copies.nth(1).click();
    const fallback = page.locator(".work-prose:visible textarea[readonly]");
    await expect(fallback).toHaveValue("Separate prompt");
    assert.deepEqual(await fallback.evaluate(field => [field.selectionStart, field.selectionEnd]), [0, "Separate prompt".length]);
    console.log("Browser verified searchable ad prompt, source navigation, repeated exact clipboard writes from Settings, Media, Canvas, two independent Note passages and the manual copy fallback.");
  } finally { await browser?.close(); server.kill(); }
};
