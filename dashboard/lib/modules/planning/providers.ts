import https from "node:https";
import { lookup } from "node:dns/promises";
import type { CalendarConnection } from "./types";
import { morgenEvent, sourceId } from "./import";

export function publicIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((x) => !Number.isInteger(x) || x < 0 || x > 255)
  )
    return false;
  const [a, b] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0)
  );
}
/** DNS-pinned HTTPS fetch. No internal addresses, ambient credentials, or unchecked redirects. */
export async function fetchCalendarFeed(
  url: string,
  redirects = 0,
): Promise<string> {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== "443") ||
    redirects > 3
  )
    throw new Error("Use a public HTTPS calendar feed");
  const addresses = await lookup(parsed.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some((x) => !publicIpv4(x.address)))
    throw new Error("Private-network calendar feeds are not supported");
  const result = await new Promise<{ body: string; redirect?: string }>(
    (resolve, reject) => {
      const req = https.get(
        parsed,
        {
          family: 4,
          headers: { Accept: "text/calendar", "User-Agent": "Unigentamos/1.0" },
          lookup: (_hostname, _options, callback) =>
            callback(null, addresses[0].address, 4),
        },
        (res) => {
          if (
            res.statusCode &&
            [301, 302, 303, 307, 308].includes(res.statusCode)
          ) {
            res.resume();
            resolve({ body: "", redirect: res.headers.location });
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`Calendar feed returned HTTP ${res.statusCode}`));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk) => {
            size += chunk.length;
            if (size > 2_000_000) {
              res.destroy(new Error("Calendar feed is larger than 2 MB"));
              return;
            }
            chunks.push(chunk);
          });
          res.on("end", () =>
            resolve({ body: Buffer.concat(chunks).toString("utf8") }),
          );
          res.on("error", reject);
        },
      );
      req.setTimeout(12000, () =>
        req.destroy(new Error("Calendar feed timed out")),
      );
      req.on("error", reject);
    },
  );
  return result.redirect
    ? fetchCalendarFeed(new URL(result.redirect, parsed).href, redirects + 1)
    : result.body;
}
async function morgenGet(path: string, allowMissing = false) {
  const key = process.env.MORGEN_API_KEY?.trim();
  if (!key)
    throw new Error(
      "Morgen is not connected. Configure MORGEN_API_KEY on the server; calendar file and feed imports remain available.",
    );
  const response = await fetch(`https://api.morgen.so/v3/${path}`, {
    headers: { Authorization: `ApiKey ${key}` },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? "Morgen API access is not included in this account entitlement."
        : response.status === 429
          ? "Morgen's refresh limit was reached. Try again after the provider's cooldown."
          : "Morgen could not refresh calendars. Existing events are unchanged.",
    );
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Morgen returned an empty response");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8_000_000)
        throw new Error(
          "Morgen response exceeds 8 MB. Existing events are unchanged.",
        );
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export async function fetchMorgen(
  connection: CalendarConnection,
  start: string,
  end: string,
  previous: import("./types").CalendarEvent[] = [],
) {
  const response = await morgenGet("calendars/list");
  const rows = response.data?.calendars || response.calendars;
  if (!Array.isArray(rows))
    throw new Error("Morgen returned an unexpected calendar response");
  if (rows.length > 20)
    throw new Error(
      "This connection exceeds the supported 20 calendars per refresh",
    );
  const now = new Date().toISOString();
  const calendars = rows.map((row: Record<string, unknown>) => ({
    id: sourceId(connection.id, String(row.accountId), String(row.id)),
    name: String(row.name || "Calendar"),
    color: /^#[a-f\d]{6}$/i.test(String(row.color))
      ? String(row.color)
      : "#565B86",
    visible: true,
    connectionId: connection.id,
    externalId: String(row.id),
    accountId: String(row.accountId),
    createdAt: now,
    updatedAt: now,
  }));
  const events: import("./types").CalendarEvent[] = [];
  for (const accountId of new Set(calendars.map((x) => x.accountId))) {
    const ids = calendars
      .filter((x) => x.accountId === accountId)
      .map((x) => x.externalId);
    const query = new URLSearchParams({
      accountId,
      calendarIds: ids.join(","),
      start,
      end,
    });
    const result = await morgenGet(`events/list?${query}`),
      items = result.data?.events || result.events;
    if (!Array.isArray(items))
      throw new Error(
        "Morgen returned an incomplete event response. Existing events were preserved.",
      );
    if (items.length > 5000)
      throw new Error("This calendar response exceeds 5,000 events");
    for (const item of items) {
      if (!item.calendarId || !ids.includes(item.calendarId))
        throw new Error("Morgen returned an event without a matching calendar");
      events.push(
        morgenEvent(item, connection.id, accountId, String(item.calendarId)),
      );
    }
  }
  if (events.length > 5000)
    throw new Error("This connection exceeds 5,000 events per refresh");
  const missing = previous.filter(
    (e) =>
      e.source?.connectionId === connection.id &&
      !e.source.cancelled &&
      !events.some((n) => n.id === e.id) &&
      e.start >= start.slice(0, 19) &&
      e.start < end.slice(0, 19) &&
      calendars.some(
        (c) =>
          c.accountId === e.source?.accountId &&
          c.externalId === e.source?.calendarId,
      ),
  );
  if (missing.length > 100)
    throw new Error(
      "More than 100 source events need individual verification. Existing events are preserved.",
    );
  for (const old of missing) {
    const source = old.source!;
    const response = await morgenGet(
      `events?${new URLSearchParams({ id: source.uid })}`,
      true,
    );
    if (response === null) {
      events.push({
        ...old,
        source: { ...source, cancelled: true, changed: true },
      });
      continue;
    }
    const raw = response.data?.event;
    if (
      !raw ||
      raw.id !== source.uid ||
      raw.accountId !== source.accountId ||
      raw.calendarId !== source.calendarId
    )
      throw new Error(
        "Morgen returned a mismatched event identity. Existing events were preserved.",
      );
    events.push(
      morgenEvent(raw, connection.id, source.accountId!, source.calendarId),
    );
  }
  return { calendars, events };
}
