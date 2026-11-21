// Bind exclusively to loopback. The HTTP adapter accepts only the RPC names
// and query shapes used by these tests; SQL permissions run as service_role.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const { PGlite } = require("@electric-sql/pglite");
const assert = require("node:assert/strict");

async function createAccountFixture() {
  const db = new PGlite();
  const identities = new Map(),
    tokens = new Map(),
    mail = new Map();
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,encrypted_password text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz)",
  );
  const migrations = path.resolve(__dirname, "../supabase/migrations");
  for (const suffix of [
    "account_workspace_identity.sql",
    "workspace_record_permissions.sql",
    "workspace_media.sql",
    "account_preferences.sql",
    "account_notifications.sql",
  ]) {
    const name = fs.readdirSync(migrations).find((file) => file.endsWith(suffix));
    await db.exec(fs.readFileSync(path.join(migrations, name), "utf8"));
  }
  async function addUser(email, password, confirmed = true, factors = []) {
    const id = randomUUID();
    identities.set(email, { id, email, password, factors });
    await db.query(
      "insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,$3,$4)",
      [id, email, password, confirmed ? new Date().toISOString() : null],
    );
    return id;
  }
  function credentials(user) {
    const access = randomUUID();
    tokens.set(access, user);
    return { user: { id: user.id, email: user.email }, access_token: access, refresh_token: randomUUID() };
  }
  async function auth(url, req, input) {
    assert.equal(req.headers.apikey, "fixture-public");
    const op = url.pathname.split("/").pop();
    if (op === "token" && url.searchParams.get("grant_type") === "password") {
      const user = identities.get(input.email);
      return user?.password === input.password ? [200, credentials(user)] : [400, {}];
    }
    if (op === "recover" || op === "signup") {
      if (op === "signup" && !identities.has(input.email)) await addUser(input.email, input.password, false);
      if (identities.has(input.email))
        mail.set(input.email, {
          redirect: url.searchParams.get("redirect_to"),
          code: randomUUID(),
          challenge: input.code_challenge,
        });
      return [200, {}];
    }
    if (op === "token" && url.searchParams.get("grant_type") === "pkce") {
      const entry = [...mail].find(([, value]) => value.code === input.auth_code);
      if (
        !entry ||
        createHash("sha256").update(input.code_verifier).digest("base64url") !== entry[1].challenge
      )
        return [400, {}];
      mail.delete(entry[0]);
      await db.query("update auth.users set email_confirmed_at=now() where email=$1", [entry[0]]);
      return [200, credentials(identities.get(entry[0]))];
    }
    const token = String(req.headers.authorization || "").replace(/^Bearer /, ""),
      user = tokens.get(token);
    if (!user) return [401, {}];
    if (op === "user" && req.method === "GET")
      return [
        200,
        {
          id: user.id,
          email: user.email,
          email_confirmed_at: new Date().toISOString(),
          factors: user.factors,
        },
      ];
    if (op === "user" && req.method === "PUT") {
      user.password = input.password;
      await db.query("update auth.users set encrypted_password=$1 where id=$2", [user.password, user.id]);
      return [200, {}];
    }
    if (op === "logout" && url.searchParams.get("scope") === "local") {
      tokens.delete(token);
      return [204];
    }
    return [404, {}];
  }
  const rpcNames = new Set([
    "resolve_account_session",
    "start_account_session",
    "create_account_workspace",
    "manage_account_member",
    "account_member_directory",
    "accept_account_invite",
    "account_record_action",
    "account_preferences_action",
    "account_writing_sources",
    "account_notice_inbox",
    "account_create_notice",
    "account_notice_device",
    "claim_account_notice",
    "finish_account_notice",
  ]);
  async function database(url, req, input) {
    assert.equal(req.headers.apikey, "fixture-service");
    return db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      const name = url.pathname.split("/").pop();
      if (url.pathname.includes("/rpc/")) {
        assert(rpcNames.has(name), name);
        const keys = Object.keys(input);
        assert(keys.every((k) => /^[a-z][a-z_]*$/.test(k)));
        const args = keys.map((k, i) => k + " => $" + (i + 1)).join(",");
        const table = ["resolve_account_session", "account_member_directory"].includes(name);
        const query = table
          ? "select * from public." + name + "(" + args + ")"
          : "select public." + name + "(" + args + ") as result";
        const { rows } = await tx.query(
          query,
          keys.map((k) =>
            typeof input[k] === "object" && input[k] !== null ? JSON.stringify(input[k]) : input[k],
          ),
        );
        if (name === "manage_account_member") return [204];
        return [200, table ? rows : rows[0].result];
      }
      const q = url.searchParams,
        filter = (k) => (q.get(k) || "").slice(3);
      const workspace = filter("workspace_id"),
        user = filter("user_id");
      if (name === "account_workspace_members") {
        if (workspace)
          return [
            200,
            (
              await tx.query(
                "select role,expires_at from public.account_workspace_members where user_id=$1 and workspace_id=$2",
                [user, workspace],
              )
            ).rows,
          ];
        assert(q.get("or")?.includes("expires_at.gt."));
        return [
          200,
          (
            await tx.query(
              "select m.workspace_id,m.role,m.expires_at,jsonb_build_object('name',w.name) account_workspaces from public.account_workspace_members m join public.account_workspaces w on w.id=m.workspace_id where m.user_id=$1 and (m.expires_at is null or m.expires_at>now())",
              [user],
            )
          ).rows,
        ];
      }
      if (name === "account_workspaces")
        return [
          200,
          (await tx.query("select name from public.account_workspaces where id=$1", [filter("id")])).rows,
        ];
      if (name === "account_workspace_invites")
        return [
          200,
          (
            await tx.query(
              "select id,email,role,expires_at,member_expires_at from public.account_workspace_invites where workspace_id=$1 and expires_at>now()",
              [workspace],
            )
          ).rows,
        ];
      if (name === "account_sessions" && req.method === "DELETE") {
        if (q.has("id"))
          await tx.query("delete from public.account_sessions where user_id=$1 and id=$2", [
            user,
            filter("id"),
          ]);
        else await tx.query("delete from public.account_sessions where user_id=$1", [user]);
        return [204];
      }
      if (name === "account_sessions")
        return [
          200,
          (
            await tx.query(
              "select id,device_label,created_at,expires_at from public.account_sessions where user_id=$1 and expires_at>now() order by created_at desc",
              [user],
            )
          ).rows,
        ];
      throw Error("Unexpected fixture route " + name);
    });
  }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      const parts = [];
      for await (const part of req) parts.push(part);
      const input = parts.length ? JSON.parse(Buffer.concat(parts).toString()) : {};
      const [status, result] = await (url.pathname.startsWith("/auth/v1/")
        ? auth(url, req, input)
        : database(url, req, input));
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(result === undefined ? undefined : JSON.stringify(result));
    } catch (e) {
      if (!e.code) console.error(e);
      res.writeHead(/^PT\d{3}$/.test(e.code) ? Number(e.code.slice(2)) : 400, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify({ code: e.code || "fixture", message: e.message }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    db,
    mail,
    addUser,
    url: "http://127.0.0.1:" + server.address().port,
    close: async () => {
      await new Promise((r) => server.close(r));
      await db.close();
    },
  };
}
module.exports = { createAccountFixture };
