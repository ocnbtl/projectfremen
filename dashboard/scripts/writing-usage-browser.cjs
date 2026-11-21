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
