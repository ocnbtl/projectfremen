import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ADMIN_CSRF_COOKIE_NAME, buildCsrfToken } from "../../../../lib/csrf";
import { checkLoginAllowance, recordLoginResult } from "../../../../lib/login-rate-limit";
import {
  accountAuth,
  accountCookie,
  accountInput,
  accountRpc,
  isAccountId,
  privateJson,
  randomSecret,
  requireAccount,
  requireAccountOrigin,
  secretHash,
  SESSION_COOKIE,
  SESSION_SECONDS,
  workspaceDatabase,
  WorkspaceAccessError,
  workspaceAccessError,
} from "../../../../lib/workspace-access";

type Context = { params: Promise<{ action: string }> };
const flowCookie = "workspace_email_flow";
const cookieOptions = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};
const json = (value: unknown) =>
  NextResponse.json(value, {
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
function emailInput(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    throw new WorkspaceAccessError(400, "Enter a valid email address.");
  return email;
}
function passwordInput(value: unknown, creating: boolean) {
  if (typeof value !== "string" || !value || value.length > 1024 || (creating && value.length < 12))
    throw new WorkspaceAccessError(
      400,
      creating ? "Use at least 12 characters for your password." : "Enter your password.",
    );
  return value;
}
function deviceLabel(request: Request) {
  const ua = request.headers.get("user-agent") || "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const system = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return system ? browser + " on " + system : browser;
}
async function exchangeSession(
  request: Request,
  data: { user?: { id?: string }; access_token?: string },
  password?: string,
) {
  if (!isAccountId(data?.user?.id) || !data.access_token)
    throw new WorkspaceAccessError(401, "Sign in to continue.");
  const headers = { Authorization: "Bearer " + data.access_token };
  try {
    const checked = await accountAuth("user", { method: "GET", headers });
    if (!checked.ok) throw new WorkspaceAccessError(401, "Sign in to continue.");
    const identity = await checked.json();
    if (identity.id !== data.user.id || identity.is_anonymous || !identity.email_confirmed_at)
      throw new WorkspaceAccessError(403, "Confirm your email address to sign in.");
    if (
      Array.isArray(identity.factors) &&
      identity.factors.some((factor: { status?: string }) => factor.status === "verified")
    )
      throw new WorkspaceAccessError(403, "This sign-in requires an additional authentication factor.");
    if (password) {
      const changed = await accountAuth("user", {
        method: "PUT",
        headers,
        body: JSON.stringify({ password }),
      });
      if (!changed.ok)
        throw new WorkspaceAccessError(400, "The password change failed. Request another email.");
      const cleared = await workspaceDatabase("account_sessions?user_id=eq." + identity.id, {
        method: "DELETE",
      });
      if (!cleared.ok) throw new WorkspaceAccessError(503, "Enter your new password to sign in.");
    }
  } finally {
    // Provider tokens never enter the browser. The app has its own revocable sessions.
    const ended = await accountAuth("logout?scope=local", { method: "POST", headers });
    if (!ended.ok && ended.status !== 401)
      throw new WorkspaceAccessError(503, "Sign-in is temporarily unavailable.");
  }
  const token = randomSecret();
  await accountRpc("start_account_session", {
    p_user: data.user.id,
    p_hash: secretHash(token),
    p_device: deviceLabel(request),
  });
  const result = json({ ok: true });
  result.cookies.set(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_SECONDS });
  result.cookies.set(ADMIN_CSRF_COOKIE_NAME, buildCsrfToken(), {
    ...cookieOptions,
    httpOnly: false,
    maxAge: SESSION_SECONDS,
  });
  result.cookies.set(flowCookie, "", { ...cookieOptions, maxAge: 0 });
  return result;
}
async function signInOrEmail(request: Request, action: string, body: Record<string, unknown>) {
  const email = emailInput(body.email);
  const key = "account:" + action + ":" + secretHash(email);
  if (!checkLoginAllowance(key).allowed) throw new WorkspaceAccessError(429, "Try again later.");
  if (action === "login") {
    const response = await accountAuth("token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password: passwordInput(body.password, false) }),
    });
    if (!response.ok) {
      if (response.status < 500) recordLoginResult(key, false);
      throw new WorkspaceAccessError(
        response.status === 429 ? 429 : response.status >= 500 ? 503 : 401,
        "Unable to sign in with those details.",
      );
    }
    recordLoginResult(key, true);
    return exchangeSession(request, await response.json());
  }
  const verifier = randomSecret();
  const options = {
    email,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "s256",
  };
  const payload =
    action === "signup" ? { ...options, password: passwordInput(body.password, true) } : options;
  const destination = new URL("/account/confirm", requireAccountOrigin(request));
  const response = await accountAuth(
    (action === "signup" ? "signup" : "recover") + "?redirect_to=" + encodeURIComponent(destination.href),
    { method: "POST", body: JSON.stringify(payload) },
  );
  recordLoginResult(key, false);
  if (response.status >= 500)
    throw new WorkspaceAccessError(503, "Account email is temporarily unavailable.");
  if (response.status === 429) throw new WorkspaceAccessError(429, "Try again later.");
  if (response.ok && action === "signup") {
    const data = await response.json();
    if (data.access_token) return exchangeSession(request, data);
  }
  // Preserve the same response for unknown and existing addresses.
  const result = json({ ok: true, checkEmail: true });
  result.cookies.set(flowCookie, action + "." + verifier, { ...cookieOptions, maxAge: 3600 });
  return result;
}
async function confirmEmail(request: Request, body: Record<string, unknown>) {
  const [flow, verifier] = accountCookie(request, flowCookie).split(".");
  if (
    !["signup", "recover"].includes(flow) ||
    !verifier ||
    !/^[A-Za-z0-9_-]{43}$/.test(verifier) ||
    typeof body.code !== "string" ||
    !/^[A-Za-z0-9_-]{8,256}$/.test(body.code)
  )
    throw new WorkspaceAccessError(
      400,
      "Open the email on the browser where you requested it, or request another link.",
    );
  const password = flow === "recover" ? passwordInput(body.password, true) : undefined;
  const response = await accountAuth("token?grant_type=pkce", {
    method: "POST",
    body: JSON.stringify({ auth_code: body.code, code_verifier: verifier }),
  });
  if (!response.ok) throw new WorkspaceAccessError(400, "This link is unavailable. Request another email.");
  return exchangeSession(request, await response.json(), password);
}
export async function POST(request: Request, { params }: Context) {
  try {
    requireAccountOrigin(request);
    const { action } = await params;
    if (["login", "signup", "recover", "confirm"].includes(action)) {
      const input = await accountInput(request);
      return action === "confirm"
        ? await confirmEmail(request, input)
        : await signInOrEmail(request, action, input);
    }
    const account = await requireAccount(request);
    if (action === "logout" || action === "revoke") {
      const id = action === "logout" ? account.sessionId : (await accountInput(request)).sessionId;
      if (!isAccountId(id)) throw new WorkspaceAccessError(400, "Choose a session.");
      const deleted = await workspaceDatabase(
        "account_sessions?id=eq." + id + "&user_id=eq." + account.userId,
        { method: "DELETE" },
      );
      if (!deleted.ok) throw new WorkspaceAccessError(503, "Could not revoke this session.");
      const response = json({ ok: true });
      if (id === account.sessionId) {
        response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
        response.cookies.set(ADMIN_CSRF_COOKIE_NAME, "", { ...cookieOptions, httpOnly: false, maxAge: 0 });
      }
      return response;
    }
    if (action === "accept") {
      const { token } = await accountInput(request);
      if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
        throw new WorkspaceAccessError(400, "Invalid invitation.");
      return privateJson({
        ok: true,
        workspaceId: await accountRpc("accept_account_invite", {
          p_user: account.userId,
          p_hash: secretHash(token),
        }),
      });
    }
    return privateJson({ ok: false }, 404);
  } catch (error) {
    return workspaceAccessError(error);
  }
}
export async function GET(request: Request, { params }: Context) {
  try {
    if ((await params).action !== "session") return privateJson({ ok: false }, 404);
    const account = await requireAccount(request);
    const query = new URLSearchParams({
      select: "id,device_label,created_at,expires_at",
      user_id: "eq." + account.userId,
      expires_at: "gt." + new Date().toISOString(),
      order: "created_at.desc",
    });
    const response = await workspaceDatabase("account_sessions?" + query);
    if (!response.ok) throw new WorkspaceAccessError(503, "Could not load sessions.");
    return privateJson({ ok: true, account, sessions: await response.json() });
  } catch (error) {
    return workspaceAccessError(error);
  }
}
