"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import styles from "./AccountHome.module.css";

type Session = { id: string; device_label: string; created_at: string; expires_at: string };
type Account = { userId: string; sessionId: string; email: string };
type Workspace = {
  workspace_id: string;
  role: string;
  expires_at: string | null;
  account_workspaces: { name: string };
};
type Member = { user_id: string; email: string; role: string; expires_at: string | null };
type Invite = { id: string; email: string; role: string; expires_at: string };
type Directory = { members: Member[]; invites: Invite[] };
type Mode = "login" | "signup" | "recover";

async function request(path: string, payload?: Record<string, unknown>) {
  const response = await fetch(
    path,
    payload
      ? {
          method: "POST",
          headers: buildJsonHeadersWithCsrf(),
          body: JSON.stringify(payload),
          cache: "no-store",
        }
      : { cache: "no-store" },
  );
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error || "The request failed."), { status: response.status });
  return data;
}
function date(value: string) {
  return new Date(value).toLocaleString();
}
function localDateInput(value: string | null) {
  if (!value) return "";
  const timestamp = new Date(value);
  return new Date(timestamp.getTime() - timestamp.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.brand}>
        <img src="/unigentamos-favicon.svg" alt="" />
        Unigentamos
      </div>
      <h1>{title}</h1>
      {children}
    </main>
  );
}
function useAction() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await fn();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, notice, setNotice, run };
}
export function AccountConfirmation({ code, recovery }: { code: string; recovery: boolean }) {
  const { busy, notice, run } = useAction();
  const title = recovery ? "Reset your password" : "Confirm your account";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    void run(async () => {
      await request("/api/account/confirm", { code, password });
      location.replace("/account");
    });
  }
  return (
    <Page title={title}>
      <div className={styles.panel}>
        <form className={styles.form} onSubmit={submit}>
          {recovery && (
            <label>
              New password
              <input name="password" type="password" autoComplete="new-password" minLength={12} required />
            </label>
          )}
          <button type="submit" disabled={busy}>
            {title}
          </button>
        </form>
        <a href="/account">Return to sign-in</a>
        {notice && <p role="alert">{notice}</p>}
      </div>
    </Page>
  );
}
function Members({ workspaceId }: { workspaceId: string }) {
  const endpoint = "/api/workspaces/" + workspaceId + "/members";
  const { busy, notice, setNotice, run } = useAction();
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  async function reload() {
    setDirectory(await request(endpoint));
  }
  useEffect(() => {
    let current = true;
    request(endpoint)
      .then((data) => {
        if (current) setDirectory(data);
      })
      .catch((e) => {
        if (current) setNotice(e.message);
      });
    return () => {
      current = false;
    };
  }, [endpoint, setNotice]);
  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const end = String(data.get("end") || "");
    void run(async () => {
      const result = await request(endpoint, {
        action: "invite",
        email: data.get("email"),
        role: data.get("role"),
        expiresAt: end ? new Date(end).toISOString() : null,
      });
      setShareUrl(result.inviteUrl);
      form.reset();
      await reload();
    });
  }
  async function change(body: Record<string, unknown>) {
    await request(endpoint, body);
    await reload();
    setNotice("Membership updated.");
  }
  return (
    <section className={styles.panel}>
      <h2>Members and guests</h2>
      <form onSubmit={invite} className={styles.form}>
        <label>
          Email address
          <input type="email" name="email" autoComplete="off" required />
        </label>
        <label>
          Role
          <select name="role">
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
        </label>
        <label>
          Access ends (optional)
          <input type="datetime-local" name="end" />
        </label>
        <button type="submit" disabled={busy}>
          Create invitation
        </button>
      </form>
      {shareUrl && (
        <label>
          Share this single-use link with the invitee
          <input value={shareUrl} readOnly onFocus={(event) => event.target.select()} />
        </label>
      )}
      {directory && (
        <>
          <h3>Members</h3>
          <div>
            {directory.members.map((m) => (
              <div key={m.user_id} className={styles.member}>
                <strong>{m.email}</strong>
                <span>
                  {m.role}
                  {m.expires_at ? " · Access ends " + date(m.expires_at) : ""}
                </span>
                {m.role !== "owner" && (
                  <details>
                    <summary>Edit access</summary>
                    <form
                      className={styles.form}
                      onSubmit={(event) => {
                        event.preventDefault();
                        const fields = new FormData(event.currentTarget);
                        const until = String(fields.get("until") || "");
                        void run(() =>
                          change({
                            action: "update",
                            targetId: m.user_id,
                            role: fields.get("role"),
                            expiresAt: until ? new Date(until).toISOString() : null,
                          }),
                        );
                      }}
                    >
                      <label>
                        Member role
                        <select name="role" defaultValue={m.role}>
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                        </select>
                      </label>
                      <label>
                        Access ends (optional)
                        <input
                          type="datetime-local"
                          name="until"
                          defaultValue={localDateInput(m.expires_at)}
                        />
                      </label>
                      <div className={styles.actions}>
                        <button type="submit" disabled={busy}>
                          Save access
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void run(() => change({ action: "remove", targetId: m.user_id }))}
                        >
                          Remove access
                        </button>
                      </div>
                    </form>
                  </details>
                )}
              </div>
            ))}
          </div>
          {directory.invites.length > 0 && (
            <>
              <h3>Pending invitations</h3>
              {directory.invites.map((i) => (
                <div key={i.id} className={styles.row}>
                  <div>
                    {i.email} · {i.role}
                    <br />
                    <small>Invitation expires {date(i.expires_at)}</small>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await change({ action: "cancel", targetId: i.id });
                        setShareUrl("");
                      })
                    }
                  >
                    Cancel invitation
                  </button>
                </div>
              ))}
            </>
          )}
        </>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
export default function AccountHome() {
  const { busy, notice, setNotice, run } = useAction();
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [account, setAccount] = useState<Account | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [active, setActive] = useState("");
  const [invite, setInvite] = useState("");
  async function refresh() {
    try {
      const session = await request("/api/account/session");
      const list = await request("/api/workspaces");
      setSessions(session.sessions);
      setWorkspaces(list.workspaces);
      setAccount(session.account);
    } catch (error) {
      setAccount(null);
      setSessions([]);
      setWorkspaces([]);
      setActive("");
      if ((error as { status?: number }).status !== 401) throw error;
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => {
    function readInvitation() {
      const token = new URLSearchParams(location.hash.slice(1)).get("invite") || "";
      setInvite(/^[a-zA-Z0-9_-]{43}$/.test(token) ? token : "");
    }
    readInvitation();
    window.addEventListener("hashchange", readInvitation);
    void refresh().catch((error) => setNotice(error.message));
    return () => window.removeEventListener("hashchange", readInvitation);
  }, [setNotice]);
  function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run(async () => {
      const result = await request("/api/account/" + mode, {
        email: data.get("email"),
        password: data.get("password"),
      });
      form.reset();
      if (result.checkEmail) setNotice("Check your email for a link. Open it in this browser.");
      else await refresh();
    });
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = new FormData(form).get("name");
    void run(async () => {
      await request("/api/workspaces", { name });
      form.reset();
      await refresh();
    });
  }
  const authTitle =
    mode === "recover" ? "Recover your account" : mode === "signup" ? "Create an account" : "Sign in";
  if (!loaded)
    return (
      <Page title="Account">
        <p role="status">Loading account…</p>
      </Page>
    );
  return (
    <Page title={account ? "Your account" : authTitle}>
      {notice && (
        <div role="status" className={styles.notice}>
          {notice}
        </div>
      )}
      {!account ? (
        <section className={styles.panel}>
          {invite && <p>Sign in with the invited email address to join this workspace.</p>}
          <form className={styles.form} onSubmit={submitLogin}>
            <label>
              Email address
              <input name="email" type="email" autoComplete="email" required />
            </label>
            {mode !== "recover" && (
              <label>
                {mode === "signup" ? "Password (12 characters or more)" : "Password"}
                <input
                  name="password"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  minLength={mode === "signup" ? 12 : 1}
                  required
                />
              </label>
            )}
            <button disabled={busy} type="submit">
              {mode === "recover" ? "Send recovery link" : authTitle}
            </button>
          </form>
          <div className={styles.actions}>
            {mode !== "login" && (
              <button
                onClick={() => {
                  setMode("login");
                  setNotice("");
                }}
              >
                Sign in
              </button>
            )}
            {mode !== "signup" && (
              <button
                onClick={() => {
                  setMode("signup");
                  setNotice("");
                }}
              >
                Create an account
              </button>
            )}
            {mode !== "recover" && (
              <button
                onClick={() => {
                  setMode("recover");
                  setNotice("");
                }}
              >
                Forgot password?
              </button>
            )}
          </div>
        </section>
      ) : (
        <>
          <div className={styles.row}>
            <p>{account.email}</p>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await request("/api/account/logout", {});
                  await refresh();
                })
              }
            >
              Sign out
            </button>
          </div>
          {invite && (
            <section className={styles.panel}>
              <h2>Workspace invitation</h2>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const data = await request("/api/account/accept", { token: invite });
                    location.replace("/account/workspaces/" + data.workspaceId);
                  })
                }
              >
                Accept invitation
              </button>
            </section>
          )}
          <section className={styles.panel}>
            <h2>Workspaces</h2>
            {workspaces.length === 0 && <p>Create a workspace to get started, or open an invitation.</p>}
            {workspaces.map((w) => (
              <div key={w.workspace_id} className={styles.row}>
                <div>
                  <a href={"/account/workspaces/" + w.workspace_id}>{w.account_workspaces.name}</a>
                  <br />
                  <small>
                    {w.role}
                    {w.expires_at ? " · Until " + date(w.expires_at) : ""}
                  </small>
                </div>
                {w.role === "owner" && (
                  <button
                    aria-expanded={active === w.workspace_id}
                    onClick={() => setActive(active === w.workspace_id ? "" : w.workspace_id)}
                  >
                    Manage members
                  </button>
                )}
              </div>
            ))}
            <form onSubmit={create} className={styles.form}>
              <label>
                New workspace name
                <input name="name" required maxLength={100} />
              </label>
              <button disabled={busy} type="submit">
                Create workspace
              </button>
            </form>
          </section>
          {active && <Members key={active} workspaceId={active} />}
          <section className={styles.panel}>
            <h2>Signed-in devices</h2>
            {sessions.map((s) => (
              <div key={s.id} className={styles.row}>
                <div>
                  <strong>{s.device_label}</strong>
                  {s.id === account.sessionId ? " · This session" : ""}
                  <br />
                  <small>
                    Signed in {date(s.created_at)} · Expires {date(s.expires_at)}
                  </small>
                </div>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await request("/api/account/revoke", { sessionId: s.id });
                      await refresh();
                    })
                  }
                >
                  Sign out device
                </button>
              </div>
            ))}
          </section>
        </>
      )}
    </Page>
  );
}
