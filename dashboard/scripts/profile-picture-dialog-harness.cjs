// Local browser coverage for nested profile drafts and contrast while saving.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { webkit, expect } = require("@playwright/test");
const sharp = require("sharp");

const app = path.resolve(__dirname, "..");
const port = crypto.randomInt(22000, 46000);
const base = "http://127.0.0.1:" + port;
const secret = crypto.randomBytes(32).toString("hex");
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "profile-picture-dialog-"));
const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: app, stdio: "ignore", env: { ...process.env, ADMIN_PASSWORD: "test", ADMIN_SESSION_SECRET: secret, FREMEN_DATA_DIR: fixture,
    FREMEN_REQUIRE_SUPABASE: "false", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", RESEND_API_KEY: "", VERCEL: "" }
});

async function checkSurface(dialog) {
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate(el => {
    const background = getComputedStyle(el).backgroundColor;
    let opacity = 1;
    for (let node = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    const lum = color => {
      const channels = (color.match(/[\d.]+/g) || []).slice(0,3).map(v => Number(v)/255)
        .map(c => c <= .04045 ? c/12.92 : Math.pow((c+.055)/1.055,2.4));
      return channels[0]*.2126 + channels[1]*.7152 + channels[2]*.0722;
    };
    const heading = el.querySelector("h2");
    if (!heading || !background.startsWith("rgb(")) return false;
    const contrast = (lum(background)+.05)/(lum(getComputedStyle(heading).color)+.05);
    return contrast >= 4.5 && opacity >= .99 && el.scrollWidth <= el.clientWidth + 1;
  })).toBe(true);
}

async function run() {
  await expect.poll(async () => {try {return (await fetch(base)).ok;} catch {return false;}}, {timeout:20000}).toBe(true);
  const browser = await webkit.launch({executablePath:process.env.WEBKIT_EXECUTABLE});
  try {
    const context = await browser.newContext({ viewport:{width:390,height:844}, hasTouch:true, reducedMotion:"reduce" });
    await context.route(/^https:\/\//, route => route.abort());
    const payload = "v1." + (Date.now()+3600000) + ".qa";
    await context.addCookies([{name:"admin_session", value:payload+"."+crypto.createHmac("sha256",secret).update(payload).digest("base64url"), url:base},
      {name:"admin_csrf", value:"fixture", url:base}]);
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    const output = path.join(app,"output","profile-picture-dialog");
    fs.mkdirSync(output,{recursive:true});
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const file = {name:"test.png", mimeType:"image/png", buffer:await sharp({create:{width:200,height:120,channels:3,background:"#166f69"}}).png().toBuffer()};
    const dialog = page.locator(".people-photo-dialog");
    const created = await context.request.post(base+"/api/projects", {headers:{origin:base,"x-csrf-token":"fixture"},
      data:{operation:"create",family:"projects",input:{name:"Upload sample",description:"Local test",lifecycle:"active"}}});
    assert(created.ok(),await created.text());
    const project = (await created.json()).item;
    await page.goto(base+"/admin/projects/"+project.id);
    await page.getByRole("button",{name:"Add profile picture for Upload sample"}).click();
    await checkSurface(dialog);
    await dialog.locator('input[type=file]').first().setInputFiles(file);
    const save = dialog.getByRole("button",{name:"Save picture",exact:true});
    await expect(save).toBeEnabled();
    let release;
    const hold = new Promise(resolve => { release = resolve; });
    const routePath = "**/api/projects/photos/"+project.id;
    await page.route(routePath, async route => {
      if (route.request().method()==="POST") await hold;
      await route.continue();
    });
    try {
      const pending = page.waitForRequest(req => req.method()==="POST" && req.url().endsWith("/photos/"+project.id));
      await save.tap();
      await pending;
      await checkSurface(dialog);
      await page.screenshot({path:path.join(output,"project-saving-phone.png"),animations:"disabled"});
    } finally { release(); }
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Change profile picture for Upload sample"})).toBeVisible();

    await page.setViewportSize({width:1440,height:950});
    for (const type of ["person","organization"]) {
      // Enter each draft via its normal creation route.
      await page.goto(base+"/admin/people/new"+(type==="organization"?"?type=organization":""));
      const avatar = page.getByRole("button",{name:"Add profile picture for new "+type,exact:true});
      await expect(avatar).toBeVisible().catch(async error => {throw new Error(error.message+"\n"+(await page.locator("main").ariaSnapshot()).slice(0,2400));});
      await avatar.click();
      await checkSurface(dialog);
      if (type==="person") await page.screenshot({path:path.join(output,"people-picture-desktop.png"),animations:"disabled"});
      await dialog.locator('input[type=file]').first().setInputFiles(file);
      await dialog.getByRole("button",{name:"Use picture",exact:true}).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("button",{name:"Change profile picture for new "+type})).toBeVisible();
    }
    await page.goto(base+"/admin/map");
    await page.getByRole("button",{name:"Save place",exact:true}).click();
    await page.getByRole("button",{name:"Change place picture"}).click();
    const placeMenu = page.getByRole("dialog",{name:"Place picture",exact:true});
    await expect(placeMenu.getByRole("button",{name:"Paste",exact:true})).toBeVisible();
    await placeMenu.locator('input[type=file]').setInputFiles(file);
    await expect(placeMenu).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Change place picture"}).locator("img")).toBeVisible();
    assert.deepEqual(errors,[]);
    console.log("PASS: mobile project upload stays opaque while pending; People and organization draft pictures and Map picture upload.");
  } finally { await browser.close(); }
}
run().catch(error => {console.error(error);process.exitCode=1;}).finally(() => server.kill());
