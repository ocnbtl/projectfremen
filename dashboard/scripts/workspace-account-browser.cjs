const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { fork } = require("node:child_process");
const { chromium } = require("@playwright/test");
const { createAccountFixture } = require("./workspace-account-fixture.cjs");

async function run() {
  const app = path.resolve(__dirname, ".."),
    host = "127.0.0.1";
  const typeFile=path.join(app,"next-env.d.ts");
  const previousTypes=fs.readFileSync(typeFile,"utf8");
  const probe = http.createServer();
  await new Promise((resolve) => probe.listen(0, host, resolve));
  const port = probe.address().port,
    base = "http://" + host + ":" + port;
  await new Promise((resolve) => probe.close(resolve));
  const fixture = await createAccountFixture();
  const password = "Test workspace only 2468";
  const ownerEmail = "owner@fixture.invalid",
    guestEmail = "guest@fixture.invalid";
  const ownerId = await fixture.addUser(ownerEmail, password);
  const guestId = await fixture.addUser(guestEmail, password);
  const environment = {
    ...process.env,
    NODE_ENV: "development",
    TURBOPACK: "1",
    __NEXT_DEV_SERVER: "1",
    UNIGENTAMOS_AUTH_MODE: "workspace",
    UNIGENTAMOS_ACCOUNT_ORIGIN: base,
    SUPABASE_URL: fixture.url,
    SUPABASE_SERVICE_ROLE_KEY: "fixture-service",
    SUPABASE_PUBLISHABLE_KEY: "fixture-public",
    ADMIN_PASSWORD: "isolated-old-admin",
    VERCEL: "",
    NEXT_TELEMETRY_DISABLED: "1",
    FREMEN_REQUIRE_SUPABASE: "true",
    RESEND_API_KEY: "",
    WORKSPACE_NOTIFICATION_FROM: "",
    WORKSPACE_PUSH_PUBLIC_KEY: "",
    WORKSPACE_PUSH_PRIVATE_KEY: "",
    WORKSPACE_PUSH_CONTACT: "",
  };
  // Use the Next server entry point directly so cleanup owns the serving process.
  const worker = fork(require.resolve("next/dist/server/lib/start-server"), [], {
    cwd: app,
    env: { ...environment, NEXT_PRIVATE_WORKER: "1" },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
  });
  worker.on("message", (message) => {
    if (message.nextWorkerReady)
      worker.send({ nextWorkerOptions: { dir: app, hostname: host, port, isDev: true, allowRetry: false } });
  });
  let output = "";
  for (const pipe of [worker.stdout, worker.stderr])
    pipe.on("data", (chunk) => {
      output = (output + chunk).slice(-7500);
    });
  let browser;
  try {
    const deadline = Date.now() + 150000;
    while (true) {
      if (worker.exitCode !== null) throw Error("Next server stopped: " + output);
      try {
        if ((await fetch(base + "/unigentamos-favicon.svg")).ok) break;
      } catch {}
      if (Date.now() > deadline) throw Error("Next startup timed out: " + output);
      await new Promise((r) => setTimeout(r, 300));
    }
    browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
    const makeContext = async (viewport) => {
      const context = await browser.newContext({ viewport });
      await context.route(/^https?:\/\//, (route) =>
        new URL(route.request().url()).origin === base ? route.continue() : route.abort(),
      );
      const page = await context.newPage();
      page.setDefaultTimeout(45000);
      page.setDefaultNavigationTimeout(120000);
      page.on("pageerror", (e) => console.error("Browser error", e.message));
      return { context, page };
    };
    async function signIn(page, email, value = password) {
      assert.equal((await page.goto(base + "/account", { waitUntil: "domcontentloaded" })).status(), 200);
      await page.getByLabel("Email address").fill(email);
      await page.getByLabel("Password", { exact: true }).fill(value);
      const signed = page.waitForResponse((r) => r.url() === base + "/api/account/login");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      const result = await signed;
      assert.equal(result.status(), 200, await result.text());
      await page.getByRole("heading", { name: "Your account" }).waitFor();
    }
    async function post(context, url, input, options = {}) {
      const csrf = (await context.cookies()).find((c) => c.name === "admin_csrf")?.value;
      return context.request.post(base + url, {
        data: input,
        headers: { origin: base, ...(csrf ? { "x-csrf-token": csrf } : {}), ...options },
      });
    }
    const a = await makeContext({ width: 1360, height: 950 }),
      b = await makeContext({ width: 390, height: 844 });
    for (const legacy of [
      "/admin",
      "/api/media",
      "/api/exports",
      "/api/admin/login",
      "/vault",
      "/api/vault/sync",
      "/api/calendar-feeds/token.ics",
      "/book/token",
      "/api/book/token",
      "/_next/image?url=%2Fvault&w=32&q=75",
    ])
      assert.equal((await a.context.request.get(base + legacy)).status(), 404, legacy);
    await signIn(a.page, ownerEmail);
    console.log("PASS account sign-in and legacy route exclusion.");
    const jar = await a.context.cookies();
    assert(jar.find((c) => c.name === "workspace_session")?.httpOnly);
    assert(!jar.some((c) => c.name === "admin_session"));
    await a.page.getByLabel("New workspace name").fill("Studio");
    await a.page.getByRole("button", { name: "Create workspace" }).click();
    const link = a.page.getByRole("link", { name: "Studio" });
    await link.waitFor();
    const workspace = (await link.getAttribute("href")).split("/").pop();
    const members = "/api/workspaces/" + workspace + "/members",
      records = "/api/workspaces/" + workspace + "/records";
    assert.equal(
      (await post(a.context, members, { action: "invite" }, { origin: "https://outside.invalid" })).status(),
      403,
    );
    assert.equal(
      (await post(a.context, members, { action: "invite" }, { "x-csrf-token": "wrong" })).status(),
      403,
    );
    await a.page.getByRole("button", { name: "Manage members" }).click();
    await a.page.getByLabel("Email address").fill(guestEmail);
    await a.page.getByRole("button", { name: "Create invitation" }).click();
    const invitation = a.page.getByLabel("Share this single-use link with the invitee");
    await invitation.waitFor();
    const inviteUrl = await invitation.inputValue();
    const token = new URL(inviteUrl).hash.slice("#invite=".length);
    assert.equal((await post(a.context, "/api/account/accept", { token })).status(), 404);
    await signIn(b.page, guestEmail);
    const secondWorkspace = await post(b.context, "/api/workspaces", { name: "Independent studio" });
    assert.equal(secondWorkspace.status(), 201);
    const other = (await secondWorkspace.json()).workspaceId;
    assert.equal((await a.context.request.get(base + "/api/workspaces/" + other + "/records")).status(), 404);
    assert.equal((await b.context.request.get(base + records)).status(), 404);
    await b.page.goto(inviteUrl);
    await b.page.getByRole("button", { name: "Accept invitation" }).click();
    await b.page.getByRole("heading", { name: "Studio" }).waitFor();
    assert.equal((await post(b.context, "/api/account/accept", { token })).status(), 404);
    assert.equal((await b.context.request.get(base + members)).status(), 403);
    assert.equal(
      (await post(b.context, records, { action: "create", kind: "note", title: "Denied" })).status(),
      403,
    );
    console.log("PASS email-bound invitation, replay rejection, CSRF and viewer role.");
    await link.click();
    await a.page.getByLabel("Title", { exact: true }).fill("Private project note");
    await a.page.getByRole("button", { name: "Create record" }).click();
    await a.page.getByRole("heading", { name: "Private project note" }).waitFor();
    const sourceURL = a.page.url();
    const createdTarget = await post(a.context, records, {
      action: "create",
      createKey: require("node:crypto").randomUUID(),
      kind: "note",
      title: "Private link target",
      body: "Only the owner sees this.",
      audience: "private",
    });
    assert.equal(createdTarget.status(), 200, await createdTarget.text());
    const target = (await createdTarget.json()).key;
    await a.page.reload();
    await a.page.getByRole("button", { name: "Edit", exact: true }).click();
    const writing = a.page.getByLabel("Notes", { exact: true });
    await writing.fill("@@Private link");
    await a.page.getByRole("button", { name: "Private link target", exact: true }).click();
    await writing.fill("##Prompt");
    await a.page
      .getByRole("group", { name: "Choose writing skill" })
      .getByRole("button", { name: "Prompt", exact: true })
      .click();
    await writing.press("End");
    await writing.pressSequentially("Review draft");
    assert.match(await writing.inputValue(), /Review draft$/);
    await a.page.getByRole("button", { name: "Save changes", exact: true }).click();
    await a.page.getByRole("link", { name: "Private link target", exact: true }).waitFor();
    await a.page.getByRole("link", { name: "Prompt", exact: true }).click();
    const uses = a.page.getByRole("region", { name: "Saved uses" });
    await uses.getByRole("link", { name: "Private project note", exact: true }).waitFor();
    assert.equal(await uses.locator("li p").first().innerText(), "Review draft");
    await a.page.goto(sourceURL);
    const item = new URL(a.page.url()).searchParams.get("item");
    assert(item);
    assert.equal(
      (await b.context.request.get(base + records + "?action=get&key=" + encodeURIComponent(item))).status(),
      404,
    );
    const sharing = a.page
      .locator("section")
      .filter({ has: a.page.getByRole("heading", { name: "Share with a member" }) });
    await sharing.getByLabel("Member email").fill(guestEmail);
    await sharing.getByRole("button", { name: "Grant access" }).click();
    await a.page.getByText("Access granted.", { exact: false }).waitFor();
    await b.page.goto(a.page.url());
    await b.page.getByRole("heading", { name: "Private project note" }).waitFor();
    assert.equal((await b.context.request.get(base + records + "?action=export")).status(), 200);
    const viewerRead = await b.context.request.get(base + records + "?action=get&key=" + item);
    const recordBody = await viewerRead.json();
    assert(!recordBody.body.includes(target) && !recordBody.body.includes("Private link target"));
    assert.equal(recordBody.links.length, 0);
    console.log(
      "PASS account writing shortcuts, atomic links, saved skill passages, and hidden target suppression.",
    );
    if (process.env.ACCOUNT_TEST_PREFERENCES !== "0") {
      await b.page.getByRole("link", { name: "Settings" }).click();
      await b.page.getByRole("heading", { name: "Workspace preferences" }).waitFor();
      await b.page.getByRole("link", { name: "Language and region" }).click();
      const clock = b.page
        .locator("label")
        .filter({ hasText: /^Clock/ })
        .locator("select");
      const previous = await clock.inputValue();
      const next = previous === "12" ? "24" : "12";
      const prefs = base + "/api/account/workspaces/" + workspace + "/preferences";
      const saved = b.page.waitForResponse((r) => r.url() === prefs && r.request().method() === "PATCH");
      await clock.selectOption(next);
      assert.equal((await saved).status(), 200);
      await b.page.reload();
      await clock.waitFor();
      assert.equal(await clock.inputValue(), next);
      const ownPreferences = await (await a.context.request.get(prefs)).json();
      assert.notEqual(ownPreferences.daily?.clock, next);
      const notice = a.page
        .locator("section")
        .filter({ has: a.page.getByRole("heading", { name: "Notify a member" }) });
      await notice.getByLabel("Member email").fill(guestEmail);
      await notice.getByRole("combobox").selectOption("assignment");
      await notice.getByRole("button", { name: "Notify member" }).click();
      await notice.getByRole("status").filter({ hasText: "Assignment added" }).waitFor();
      const settings = base + "/account/preferences/";
      const scoped = "?workspace=" + workspace;
      await b.page.goto(settings + "notifications" + scoped);
      const inbox = b.page
        .locator("section")
        .filter({ has: b.page.getByRole("heading", { name: "Workspace inbox" }) });
      await inbox.getByText("assignment · note", { exact: false }).waitFor();
      await inbox.getByRole("link", { name: "Private project note" }).first().click();
      await b.page.getByRole("heading", { name: "Private project note" }).waitFor();
      await b.page.goto(settings + "appearance" + scoped);
      await b.page.getByLabel("Reading text size").selectOption("larger");
      await b.page.getByRole("switch", { name: "Increase contrast" }).check();
      await b.page.goto(base + "/account/workspaces/" + workspace + "?tab=records");
      await b.page.getByRole("searchbox", { name: "Search records" }).fill("Private project");
      assert.equal(await b.page.locator("html").getAttribute("data-reading-size"), "larger");
      assert.equal(await b.page.locator("html").getAttribute("data-reading-contrast"), "high");
      await b.page.getByRole("link", { name: "Private project note" }).waitFor();
      await b.page.getByRole("searchbox", { name: "Search records" }).fill("no-match");
      await b.page.getByText("No matching records.").waitFor();
      console.log(
        "PASS account preference sync, member notification, record search, reading size and contrast.",
      );
    }
    await fixture.db.query(
      "update account_workspace_members set expires_at=now()-interval '1 minute' where workspace_id=$1 and user_id=$2",
      [workspace, guestId],
    );
    assert.equal((await b.context.request.get(base + records)).status(), 404);
    assert.equal((await post(a.context, members, { action: "remove", targetId: guestId })).status(), 200);
    assert.equal((await post(a.context, members, { action: "remove", targetId: ownerId })).status(), 400);
    await a.page.goto(base + "/account");
    await a.page.getByRole("button", { name: "Sign out", exact: true }).click();
    await a.page.getByRole("heading", { name: "Sign in" }).waitFor();
    const before = await b.context.cookies();
    const prior = before.find((c) => c.name === "workspace_session").value;
    await b.page.goto(base + "/account");
    await b.page.getByRole("button", { name: "Sign out device" }).click();
    await b.page.getByRole("heading", { name: "Sign in" }).waitFor();
    assert.equal(
      (await fetch(base + "/api/account/session", { headers: { cookie: "workspace_session=" + prior } }))
        .status,
      401,
    );
    await signIn(a.page, ownerEmail);
    await b.page.getByRole("button", { name: "Forgot password?" }).click();
    await b.page.getByLabel("Email address").fill(ownerEmail);
    await b.page.getByRole("button", { name: "Send recovery link" }).click();
    await b.page.getByText("Check your email", { exact: false }).waitFor();
    const recovery = fixture.mail.get(ownerEmail);
    assert.equal(recovery.redirect, base + "/account/confirm");
    await b.page.goto(recovery.redirect + "?code=" + recovery.code);
    await b.page.getByLabel("New password").fill("New fixture password 4321");
    await b.page.getByRole("button", { name: "Reset your password" }).click();
    await b.page.getByRole("heading", { name: "Your account" }).waitFor();
    assert.equal((await a.context.request.get(base + "/api/account/session")).status(), 401);
    const signup = await makeContext({ width: 390, height: 844 });
    const signupEmail = "new@fixture.invalid";
    await signup.page.goto(base + "/account");
    await signup.page.getByRole("button", { name: "Create an account" }).click();
    await signup.page.getByLabel("Email address").fill(signupEmail);
    await signup.page.getByLabel("Password (12 characters or more)").fill(password);
    await signup.page.getByRole("button", { name: "Create an account" }).click();
    await signup.page.getByText("Check your email", { exact: false }).waitFor();
    const confirmation = fixture.mail.get(signupEmail);
    await signup.page.goto(confirmation.redirect + "?code=" + confirmation.code);
    await signup.page.getByRole("button", { name: "Confirm your account" }).click();
    await signup.page.getByRole("heading", { name: "Your account" }).waitFor();
    const protectedEmail = "mfa@fixture.invalid";
    await fixture.addUser(protectedEmail, password, true, [{ status: "verified" }]);
    assert.equal(
      (await post(signup.context, "/api/account/login", { email: protectedEmail, password })).status(),
      403,
    );
    await post(signup.context, "/api/account/recover", { email: protectedEmail });
    const protectedLink = fixture.mail.get(protectedEmail);
    assert.equal(
      (
        await post(signup.context, "/api/account/confirm", {
          code: protectedLink.code,
          password: "Unapplied reset 12345",
        })
      ).status(),
      403,
    );
    const protectedPassword = await fixture.db.query(
      "select encrypted_password from auth.users where email=$1",
      [protectedEmail],
    );
    assert.equal(protectedPassword.rows[0].encrypted_password, password);
    await fixture.db.exec("set role authenticated");
    await assert.rejects(fixture.db.query("select * from public.account_sessions"), /permission denied/);
    await assert.rejects(
      fixture.db.query("select public.create_account_workspace($1,'Denied')", [ownerId]),
      /permission denied/,
    );
    console.log(
      "PASS browser identity, workspace creation, source-scoped records, invitations, guest expiry, role authorization, recovery, device revocation and legacy route isolation.",
    );
  } catch (error) {
    for (const context of browser?.contexts() || [])
      for (const page of context.pages())
        console.error(
          new URL(page.url()).pathname,
          (
            await page
              .locator("body")
              .innerText({ timeout: 2000 })
              .catch(() => "")
          ).slice(-1600),
        );
    console.error(output);
    throw error;
  } finally {
    await browser?.close();
    worker.kill();
    await fixture.close();
    const currentTypes=fs.readFileSync(typeFile,"utf8");
    if(currentTypes!==previousTypes && currentTypes.replaceAll(".next/dev/types/",".next/types/")===previousTypes)
      fs.writeFileSync(typeFile,previousTypes);
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
