const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const { randomUUID, generateKeyPairSync } = require("node:crypto");
const { createAccountFixture } = require("./workspace-account-fixture.cjs");
require.extensions[".ts"] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  );
const {
  dailyDefaults: defaults,
  readyForDigest,
  validateDaily,
  silenced,
  formattedDay,
  pinOrder,
} = require("../lib/settings/preferences.ts");
const { approvedPushEndpoint, sendNotice } = require("../lib/settings/notification-transport.ts");
const { taskEvents } = require("../lib/modules/planning/task-model.ts");

async function main() {
  assert.throws(() => validateDaily({ ...defaults, landing: "https://example.org" }));
  assert.throws(() => validateDaily({ ...defaults, homeZone: "not/a/zone" }));
  assert.throws(() => validateDaily({ ...defaults, inboxKinds: ["__proto__"] }));
  assert.equal(formattedDay("2026-11-21", "dmy"), "21/11/2026");
  assert.deepEqual(pinOrder([{ href: "a" }, { href: "b" }], ["b"]), [{ href: "b" }, { href: "a" }]);
  const t = Date.parse,
    quiet = { ...defaults, quiet: true, homeZone: "America/New_York" };
  assert.equal(silenced(quiet, t("2026-11-21T03:00Z")), true);
  assert.equal(silenced(quiet, t("2026-11-21T12:00Z")), false);
  const daily = { ...defaults, digest: "daily", digestAt: "09:00", homeZone: "UTC" };
  assert.equal(readyForDigest(t("2026-11-20T10:00Z"), t("2026-11-21T08:59Z"), daily), false);
  assert.equal(readyForDigest(t("2026-11-20T10:00Z"), t("2026-11-21T09:00Z"), daily), true);
  const task = {
    id: "a",
    kind: "routine",
    title: "Review",
    description: "",
    start: "2026-11-21T09:00",
    end: "2026-11-21T10:00",
    timeZone: "UTC",
    followDeviceZone: true,
    calendarIds: [],
    exceptions: {},
    reminderMinutes: 30,
  };
  const [event] = taskEvents([task], [], "UTC", new Date(), "Asia/Tokyo");
  assert.equal(event.timeZone, "Asia/Tokyo");
  assert.equal(event.reminderMinutes, 30);
  assert.equal(taskEvents([{ ...task, start: "" }], [], "UTC").length, 0);

  assert.equal(approvedPushEndpoint("https://127.0.0.1/private"), null);
  assert.equal(approvedPushEndpoint("https://fcm.googleapis.com.example.org/p"), null);
  assert.equal(approvedPushEndpoint("https://fcm.googleapis.com:123/p"), null);
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ format: "jwk" });
  Object.assign(process.env, {
    WORKSPACE_NOTIFICATION_FROM: "test@example.invalid",
    RESEND_API_KEY: "fixture",
    WORKSPACE_PUSH_CONTACT: "mailto:contact@example.invalid",
    WORKSPACE_PUSH_PRIVATE_KEY: keys.d,
    WORKSPACE_PUSH_PUBLIC_KEY: Buffer.concat([
      Buffer.from([4]),
      Buffer.from(keys.x, "base64url"),
      Buffer.from(keys.y, "base64url"),
    ]).toString("base64url"),
  });
  const realFetch = global.fetch,
    calls = [];
  try {
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return new Response(null, { status: 201 });
    };
    assert.equal(await sendNotice("email", "member@example.invalid", "job1"), "sent");
    assert.equal(calls[0].options.headers["Idempotency-Key"], "workspace-notice-job1");
    assert.equal(await sendNotice("push", "https://fcm.googleapis.com/fcm/send/fixture", "job2"), "sent");
    assert.match(calls[1].options.headers.Authorization, /^vapid t=/);
    assert.equal(calls[1].options.redirect, "error");
  } finally {
    global.fetch = realFetch;
  }

  const fixture = await createAccountFixture();
  try {
    const { db } = fixture;
    const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
    const owner = await fixture.addUser("owner@fixture.invalid", "pw"),
      member = await fixture.addUser("member@fixture.invalid", "pw"),
      other = await fixture.addUser("other@fixture.invalid", "pw");
    const w = await scalar("select public.create_account_workspace($1,$2)", [owner, "Local test"]);
    await db.query(
      "insert into public.account_workspace_members(workspace_id,user_id,role) values($1,$2,'viewer')",
      [w, member],
    );
    const k = randomUUID(),
      eventId = randomUUID();
    await db.query(
      "insert into public.account_workspace_records(workspace_id,object_key,creator_id,kind,title,body,audience) values($1,$2,$3,'task','Fixture task','','private')",
      [w, k, owner],
    );
    const save = (actor, revision, changes) =>
      scalar("select public.account_preferences_action($1,$2,$3,$4)", [
        w,
        actor,
        revision,
        JSON.stringify(changes),
      ]);
    await assert.rejects(save(other, 0, { daily: defaults }), /PT403|Workspace unavailable/);
    const configured = { ...defaults, emailKinds: ["assignment"], clock: "24" };
    assert.equal((await save(member, 0, { daily: configured })).revision, 1);
    await assert.rejects(save(member, 0, { daily: defaults }), /another device/);
    assert.equal((await save(owner, null, {})).daily, null);
    const notify = () =>
      scalar("select public.account_create_notice($1,$2,$3,$4,'assignment',null,$5)", [
        w,
        owner,
        k,
        "member@fixture.invalid",
        eventId,
      ]);
    await assert.rejects(notify(), /already open/);
    const grant = randomUUID();
    await db.query(
      "insert into public.account_workspace_record_grants(id,workspace_id,object_key,recipient_id,expires_at) values($1,$2,$3,$4,now()+interval '1 day')",
      [grant, w, k, member],
    );
    await notify();
    await notify();
    assert.equal(Number(await scalar("select count(*) from public.account_notice_jobs")), 1);
    const inbox = () => scalar("select public.account_notice_inbox($1,$2)", [w, member]);
    assert.equal((await inbox())[0].category, "assignment");
    const job = await scalar("select public.claim_account_notice()");
    assert.equal(job.destination, "member@fixture.invalid");
    assert.equal(await scalar("select public.claim_account_notice()"), null);
    await scalar("select public.finish_account_notice($1,$2,'retry')", [job.id, job.lease]);
    await db.query("update public.account_workspace_record_grants set revoked_at=now() where id=$1", [grant]);
    assert.equal((await inbox()).length, 0);
    await db.query("update public.account_notice_jobs set next_attempt=now() where id=$1", [job.id]);
    assert.equal((await scalar("select public.claim_account_notice()")).skip, true);
    assert.equal(
      await scalar("select state from public.account_notice_jobs where id=$1", [job.id]),
      "cancelled",
    );
  } finally {
    await fixture.close();
  }
  console.log(
    "Personal preferences, daily digest boundaries, floating routines, mock transports, account isolation, optimistic saves, and revoked delivery passed.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
