import { createPrivateKey, sign } from "node:crypto";
export function approvedPushEndpoint(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const valid =
      url.hostname === "fcm.googleapis.com" ||
      url.hostname === "updates.push.services.mozilla.com" ||
      url.hostname.endsWith(".push.services.mozilla.com") ||
      url.hostname === "web.push.apple.com" ||
      url.hostname.endsWith(".notify.windows.com");
    return valid &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      url.pathname.length > 1
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function noticeTransports() {
  const pub = process.env.WORKSPACE_PUSH_PUBLIC_KEY || "",
    priv = process.env.WORKSPACE_PUSH_PRIVATE_KEY || "",
    contact = process.env.WORKSPACE_PUSH_CONTACT || "";
  return {
    email: Boolean(process.env.RESEND_API_KEY && process.env.WORKSPACE_NOTIFICATION_FROM),
    pushKey:
      /^[A-Za-z0-9_-]{87}$/.test(pub) &&
      /^[A-Za-z0-9_-]{43}$/.test(priv) &&
      /^mailto:[^\s@]+@[^\s@]+$/.test(contact)
        ? pub
        : "",
  };
}
export async function sendNotice(channel: string, destination: string, id: string) {
  if (channel === "email") {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: "Bearer " + process.env.RESEND_API_KEY,
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-notice-" + id,
      },
      body: JSON.stringify({
        from: process.env.WORKSPACE_NOTIFICATION_FROM,
        to: [destination],
        subject: "Unigentamos workspace update",
        text: "A workspace update is ready. Sign in to Unigentamos and open Notifications to view it.",
      }),
    });
    return response.ok ? "sent" : response.status >= 500 || response.status === 429 ? "retry" : "failed";
  }
  const endpoint = approvedPushEndpoint(destination),
    { pushKey } = noticeTransports();
  if (!endpoint || !pushKey) return "failed";
  const pub = Buffer.from(pushKey, "base64url");
  const key = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: process.env.WORKSPACE_PUSH_PRIVATE_KEY,
      x: pub.subarray(1, 33).toString("base64url"),
      y: pub.subarray(33, 65).toString("base64url"),
    },
    format: "jwk",
  });
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned =
    encode({ typ: "JWT", alg: "ES256" }) +
    "." +
    encode({
      aud: new URL(endpoint).origin,
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: process.env.WORKSPACE_PUSH_CONTACT,
    });
  const token =
    unsigned +
    "." +
    sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
    headers: { Authorization: "vapid t=" + token + ", k=" + pushKey, TTL: "300", Urgency: "normal" },
  });
  return response.ok
    ? "sent"
    : response.status === 404 || response.status === 410
      ? "gone"
      : response.status === 429 || response.status >= 500
        ? "retry"
        : "failed";
}
