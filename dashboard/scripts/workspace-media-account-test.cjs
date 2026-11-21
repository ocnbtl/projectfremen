/* In-memory Postgres and fake object transport. No requests leave this process. */
const assert = require("node:assert/strict");
const { randomUUID, createHash } = require("node:crypto");
const fs = require("node:fs"),
  path = require("node:path"),
  Module = require("node:module");
const { PGlite } = require("@electric-sql/pglite"),
  ts = require("typescript"),
  sharp = require("sharp");
require.extensions[".ts"] = (mod, name) =>
  mod._compile(
    ts.transpileModule(fs.readFileSync(name, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    name,
  );
const load = Module._load;
Module._load = function (name, ...args) {
  return name === "server-only" ? {} : load.call(this, name, ...args);
};
const owner = randomUUID(),
  viewer = randomUUID(),
  outsider = randomUUID(),
  a = randomUUID(),
  b = randomUUID(),
  media = randomUUID();
const service = "fixture-only-key",
  token = new Map([
    [owner, "a".repeat(43)],
    [viewer, "b".repeat(43)],
    [outsider, "c".repeat(43)],
  ]);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
Object.assign(process.env, {
  UNIGENTAMOS_AUTH_MODE: "workspace",
  UNIGENTAMOS_ACCOUNT_ORIGIN: "http://localhost",
  WORKSPACE_MEDIA_BACKEND: "r2-standard",
  SUPABASE_URL: "http://127.0.0.1:9000",
  SUPABASE_SERVICE_ROLE_KEY: service,
  R2_ACCOUNT_ID: "a".repeat(32),
  R2_MEDIA_BUCKET: "fixture-media",
  R2_ACCESS_KEY_ID: "fixture-key",
  R2_SECRET_ACCESS_KEY: "fixture-secret",
  WORKSPACE_INCLUDED_STORAGE_BYTES: "9000000",
  FREMEN_ACCOUNT_MEDIA_BACKEND: "supabase",
});
const route = require("../app/api/workspaces/[workspaceId]/media/route.ts");
const { accountChunk } = require("../lib/modules/media/account-store.ts");
const csrf = "e".repeat(64);
async function request(user, workspace, method, payload, query = "", provideCsrf = true) {
  const url = "http://localhost/api/workspaces/" + workspace + "/media" + query;
  const headers = {
    "content-type": "application/json",
    origin: "http://localhost",
    cookie: "workspace_session=" + (token.get(user) || "") + "; admin_csrf=" + csrf,
  };
  if (provideCsrf) headers["x-csrf-token"] = csrf;
  return route[method](
    new Request(url, { method, headers, ...(payload ? { body: JSON.stringify(payload) } : {}) }),
    { params: Promise.resolve({ workspaceId: workspace }) },
  );
}
async function main() {
  const db = new PGlite(),
    objects = new Map(),
    legacy = new Map(),
    calls = [];
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,encrypted_password text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz)",
    );
    const migrations = path.resolve(__dirname, "../supabase/migrations");
    for (const suffix of [
      "account_workspace_identity.sql",
      "workspace_record_permissions.sql",
      "workspace_media.sql",
      "workspace_storage_ledger.sql",
    ])
      await db.exec(
        fs.readFileSync(
          path.join(
            migrations,
            fs.readdirSync(migrations).find((n) => n.endsWith(suffix)),
          ),
          "utf8",
        ),
      );
    for (const user of [owner, viewer, outsider])
      await db.query("insert into auth.users(id) values($1)", [user]);
    for (const [id, user] of [
      [a, owner],
      [b, outsider],
    ]) {
      await db.query("insert into account_workspaces(id,owner_id,name) values($1,$2,'Test')", [id, user]);
      await db.query(
        "insert into account_workspace_members(workspace_id,user_id,role) values($1,$2,'owner')",
        [id, user],
      );
    }
    await db.query(
      "insert into account_workspace_members(workspace_id,user_id,role) values($1,$2,'viewer')",
      [a, viewer],
    );
    await db.exec("set role service_role");
    global.fetch = async (input, opts = {}) => {
      const req = input instanceof Request ? input : new Request(input, opts),
        u = new URL(req.url),
        q = u.searchParams;
      if (u.hostname.endsWith(".r2.cloudflarestorage.com")) {
        calls.push([req.method, u.pathname]);
        if (req.method === "HEAD" || req.method === "GET") {
          assert.ok(req.headers.has("authorization"));
          const bytes = objects.get(u.pathname);
          return bytes
            ? new Response(req.method === "GET" ? bytes : null, {
                headers: { "content-length": String(bytes.length) },
              })
            : new Response(null, { status: 404 });
        }
        if (req.method === "DELETE") {
          objects.delete(u.pathname);
          return new Response(null, { status: 204 });
        }
        throw new Error("Unexpected R2 operation");
      }
      assert.equal(u.host, "127.0.0.1:9000");
      assert.equal(req.headers.get("apikey"), service);
      if (u.pathname.startsWith("/storage/v1/object/account-media/")) {
        const bytes = legacy.get(u.pathname);
        return new Response(bytes || null, { status: bytes ? 200 : 404 });
      }
      try {
        const body = req.method === "POST" ? await req.json() : {};
        let rows;
        if (u.pathname.endsWith("/resolve_account_session")) {
          const user = [...token].find(([, t]) => digest(t) === body.p_hash)?.[0];
          return Response.json(
            user ? [{ user_id: user, session_id: randomUUID(), email: "fixture@example.invalid" }] : [],
          );
        }
        if (u.pathname.endsWith("/account_workspace_members")) {
          rows = (
            await db.query(
              "select role,expires_at from account_workspace_members where workspace_id=$1 and user_id=$2",
              [q.get("workspace_id").slice(3), q.get("user_id").slice(3)],
            )
          ).rows;
        } else if (u.pathname.endsWith("/account_media_preferences")) {
          if (req.method === "POST") {
            await db.query(
              "insert into account_media_preferences values($1,$2,$3) on conflict(workspace_id,user_id) do update set metadata_free_uploads=excluded.metadata_free_uploads",
              [body.workspace_id, body.user_id, body.metadata_free_uploads],
            );
            return new Response(null, { status: 201 });
          }
          rows = (
            await db.query(
              "select metadata_free_uploads from account_media_preferences where workspace_id=$1 and user_id=$2",
              [q.get("workspace_id").slice(3), q.get("user_id").slice(3)],
            )
          ).rows;
        } else if (u.pathname.endsWith("/workspace_media_action")) {
          const { p_workspace, p_actor, p_media, p_action, p_data } = body;
          rows = (
            await db.query("select * from workspace_media_action($1,$2,$3,$4,$5)", [
              p_workspace,
              p_actor,
              p_media,
              p_action,
              JSON.stringify(p_data),
            ])
          ).rows[0];
        } else if (u.pathname.endsWith("/workspace_media_usage")) {
          rows = (
            await db.query("select * from workspace_media_usage($1,$2)", [body.p_workspace, body.p_actor])
          ).rows;
        } else if (u.pathname.endsWith("/account_workspace_media")) {
          if (q.has("media_id"))
            rows = (
              await db.query("select * from account_workspace_media where workspace_id=$1 and media_id=$2", [
                q.get("workspace_id").slice(3),
                q.get("media_id").slice(3),
              ])
            ).rows;
          else if (q.get("or").startsWith("(record_id.")) {
            const id = q.get("or").match(/record_id\.eq\.([\w:-]+)/)[1];
            rows = (
              await db.query(
                "select * from account_workspace_media where workspace_id=$1 and (record_id=$2 or object_id=$2 or media_id::text=$2) limit 2",
                [q.get("workspace_id").slice(3), id],
              )
            ).rows;
          } else {
            const user = q.get("or").match(/owner_id\.eq\.([a-f0-9-]+)/)[1];
            rows = (
              await db.query(
                "select * from account_workspace_media where workspace_id=$1 and state<>'discarded' and (owner_id=$2 or (audience='workspace' and state='ready')) order by created_at desc,media_id limit 51 offset $3",
                [q.get("workspace_id").slice(3), user, q.get("offset")],
              )
            ).rows;
          }
        } else throw Error("Unknown database route");
        return Response.json(rows);
      } catch (error) {
        return Response.json({ message: error.message }, { status: 400 });
      }
    };
    const png = await sharp({ create: { width: 6, height: 6, channels: 3, background: "#357" } })
      .withExif({ IFD0: { Artist: "Sensitive test attribution" } })
      .png()
      .toBuffer();
    const payload = {
      action: "start",
      id: media,
      name: "original.png",
      mime: "image/png",
      bytes: png.length,
      sha256: digest(png),
    };
    const post = (u, w, body) => request(u, w, "POST", body);
    const get = (u, w, query) => request(u, w, "GET", null, query);
    const ok = async (resp) => {
      assert.equal(resp.status, 200, await resp.clone().text());
      return resp.json();
    };
    assert.equal((await request(owner, a, "POST", payload, "", false)).status, 403);
    assert.equal((await post(viewer, a, payload)).status, 403);
    assert.equal((await post(outsider, a, payload)).status, 404);
    const first = await ok(await post(owner, a, payload));
    assert.equal(first.chunkSize, 8388608);
    const privateList = await ok(await get(viewer, a));
    assert.equal(privateList.files.length, 0);
    assert.equal(privateList.cleanUploads, false);
    await ok(await post(owner, a, { action: "privacy", metadataFree: true }));
    assert.equal((await ok(await get(owner, a))).cleanUploads, true);
    assert.equal((await ok(await get(viewer, a))).cleanUploads, false);
    assert.equal((await ok(await get(owner, a))).usage.reserved_bytes, png.length);
    assert.equal((await post(owner, a, { ...payload, id: randomUUID(), bytes: 9000000 })).status, 409);
    assert.equal((await post(owner, a, { ...payload, name: "different.png" })).status, 409);
    const grant = await ok(await post(owner, a, { action: "part", id: media, index: 0 }));
    const signed = new URL(grant.url);
    assert.equal(signed.hostname, process.env.R2_ACCOUNT_ID + ".r2.cloudflarestorage.com");
    assert.ok(signed.pathname.includes("/workspaces/" + a + "/media/" + media + "/chunk-0"));
    assert.match(signed.searchParams.get("X-Amz-SignedHeaders"), /content-length/);
    assert.match(signed.searchParams.get("X-Amz-SignedHeaders"), /if-none-match/);
    assert.equal(grant.headers["x-amz-storage-class"], "STANDARD");
    objects.set(signed.pathname, Buffer.alloc(png.length));
    assert.equal((await post(owner, a, { action: "finish", id: media })).status, 409);
    objects.set(signed.pathname, png);
    assert.equal((await ok(await post(owner, a, { action: "part", id: media, index: 0 }))).uploaded, true);
    await ok(await post(owner, a, { action: "finish", id: media }));
    await ok(await post(owner, a, { action: "finish", id: media }));
    const listed = await ok(await get(owner, a));
    assert.equal(listed.files[0].id, media);
    assert.equal(listed.usage.used_bytes, png.length);
    assert.equal(listed.usage.reserved_bytes, 0);
    const blobCount = calls.length;
    for (const query of ["?id=" + media, "?view=thumbnail&id=" + media]) {
      assert.equal((await get(viewer, a, query)).status, 404);
      assert.equal((await get(outsider, b, query)).status, 404);
    }
    assert.equal(calls.length, blobCount);
    assert.equal((await ok(await get(viewer, a))).files.length, 0);
    await ok(await post(owner, a, { action: "share", id: media, audience: "workspace" }));
    const visible = await ok(await get(viewer, a));
    assert.equal(visible.files[0].recordId, "personal-" + media);
    assert.deepEqual(Buffer.from(await (await get(viewer, a, "?id=" + media)).arrayBuffer()), png);
    const safeExport = await get(viewer, a, "?view=photo-copy&id=" + media);
    assert.equal(safeExport.status, 200);
    const exportedInfo = await sharp(Buffer.from(await safeExport.arrayBuffer())).metadata();
    assert.equal(exportedInfo.exif, undefined);
    assert.equal(exportedInfo.width, 6);
    const preview = await get(viewer, a, "?view=thumbnail&id=" + media);
    assert.equal(preview.headers.get("content-type"), "image/webp");
    assert.equal((await sharp(Buffer.from(await preview.arrayBuffer())).metadata()).format, "webp");
    await ok(await post(owner, a, { action: "share", id: media, audience: "private" }));
    assert.equal((await get(viewer, a, "?view=thumbnail&id=" + media)).status, 404);
    const abandoned = randomUUID(),
      big = 8388609;
    await ok(await post(owner, a, { ...payload, id: abandoned, bytes: big }));
    const tail = await ok(await post(owner, a, { action: "part", id: abandoned, index: 1 }));
    assert.match(new URL(tail.url).pathname, /chunk-1$/);
    assert.equal((await post(owner, a, { action: "part", id: abandoned, index: 2 })).status, 400);
    assert.equal((await post(owner, a, { action: "discard", id: abandoned })).status, 202);
    assert.equal((await ok(await get(owner, a))).usage.reserved_bytes, big);
    await db.query(
      "update account_workspace_media set write_deadline=now()-interval '1 second' where media_id=$1",
      [abandoned],
    );
    await ok(await post(owner, a, { action: "discard", id: abandoned }));
    assert.equal((await ok(await get(owner, a))).usage.reserved_bytes, 0);
    const original = randomUUID(),
      source = randomUUID(),
      object = randomUUID(),
      record = "existing-stable-record";
    await db.query(
      "insert into account_workspace_media(workspace_id,media_id,record_id,object_id,owner_id,source_file_id,backend,state,file_name,mime_type,byte_length,chunk_size,sha256) values($1,$2,$3,$8,$4,$5,'supabase','ready','legacy.png','image/png',$6,1048576,$7)",
      [a, original, record, owner, source, png.length, digest(png), object],
    );
    legacy.set("/storage/v1/object/account-media/" + source + "/0", png);
    assert.deepEqual(Buffer.from(await (await get(owner, a, "?id=" + original)).arrayBuffer()), png);
    assert.equal((await ok(await get(owner, a))).files.find((x) => x.id === original).recordId, record);
    for (const alias of [original, object, record]) {
      assert.deepEqual(Buffer.from(await (await get(owner, a, "?id=" + alias)).arrayBuffer()), png);
      assert.equal((await get(viewer, a, "?id=" + alias)).status, 404);
    }
    await db.query("update account_workspace_storage set pooled_addon_bytes=400 where workspace_id=$1", [a]);
    const usage = (await ok(await get(owner, a))).usage;
    const balance = (
      await db.query(
        "select sum(used_delta)::bigint as used,sum(reserved_delta)::bigint as reserved,sum(addon_delta)::bigint as addon from account_storage_events where workspace_id=$1",
        [a],
      )
    ).rows[0];
    assert.equal(usage.pooled_addon_bytes, 400);
    assert.equal(balance.used, usage.used_bytes);
    assert.equal(balance.reserved, 0);
    assert.equal(balance.addon, 400);
    await db.exec("reset role;set role authenticated");
    await assert.rejects(() => db.query("select * from account_workspace_media"), /permission denied/);
    await assert.rejects(
      () => db.query("select * from workspace_media_action($1,$2,$3,'part','{}')", [a, owner, media]),
      /permission denied/,
    );
    delete process.env.FREMEN_ACCOUNT_MEDIA_BACKEND;
    delete process.env.VERCEL;
    process.env.FREMEN_DATA_DIR = "deliberately-unused";
    await assert.rejects(() => accountChunk(source, 0), /Set FREMEN_ACCOUNT_MEDIA_BACKEND/);
    console.log(
      "PASS: real catalog SQL, role/CSRF gates, private directory and bytes, revocation, direct resumable chunks, hash, quota, cancellation, legacy IDs and explicit storage.",
    );
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
