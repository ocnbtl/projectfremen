import { createPrivateKey, randomBytes, sign } from "node:crypto";
import { BankingError } from "./banking-provider";
import type { CoinbaseActivity, CoinbaseHolding, CoinbaseSnapshot } from "./coinbase-types";

export interface CoinbaseCredentials { keyName: string; privateKey: string }
const invalidData = () => new BankingError("coinbase_data", "Coinbase returned incomplete or unsupported data. The previous snapshot is preserved.", 502);
const idPattern = /^[a-zA-Z0-9_-]{1,100}$/;
const currencyPattern = /^[A-Z0-9]{1,30}$/;

export function coinbaseCredentials(name: unknown, secret: unknown): CoinbaseCredentials {
  if (typeof name !== "string" || !/^organizations\/[a-zA-Z0-9-]{1,100}\/apiKeys\/[a-zA-Z0-9-]{1,100}$/.test(name.trim()) ||
    typeof secret !== "string" || secret.length > 4000) throw new BankingError("coinbase_key", "Enter the full Coinbase API key name and its ECDSA private key.");
  const privateKey = secret.replaceAll("\\n", "\n").trim();
  try {
    const key = createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") throw new Error();
  } catch { throw new BankingError("coinbase_key", "Use an ECDSA (ES256) Coinbase App key. Check that the complete private key was pasted."); }
  return { keyName: name.trim(), privateKey };
}

/** The transport cannot send funds: only these GET endpoints are allowed. */
export function coinbasePath(path: string): URL {
  const url = new URL(path, "https://api.coinbase.com");
  if (!path.startsWith("/") || path.startsWith("//") || url.origin !== "https://api.coinbase.com" || url.hash || url.username || url.password ||
    !/^\/(?:api\/v3\/brokerage\/key_permissions|v2\/accounts(?:\/[a-zA-Z0-9_-]{1,100}\/transactions)?|v2\/prices\/[A-Z0-9]{1,30}-USD\/spot)$/.test(url.pathname) ||
    [...url.searchParams.keys()].some(key => !["limit", "order", "starting_after", "ending_before"].includes(key)) || path.length > 1500) throw invalidData();
  return url;
}
export function coinbaseJwt(credentials: CoinbaseCredentials, path: string) {
  const url = coinbasePath(path), now = Math.floor(Date.now() / 1000);
  const head = Buffer.from(JSON.stringify({ alg: "ES256", typ: "JWT", kid: credentials.keyName, nonce: randomBytes(16).toString("hex") })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ sub: credentials.keyName, iss: "cdp", nbf: now, exp: now + 120, uri: `GET api.coinbase.com${url.pathname}` })).toString("base64url");
  return `${head}.${body}.${sign("sha256", Buffer.from(`${head}.${body}`), { key: credentials.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}
export function assertCoinbaseViewOnly(value: Record<string, unknown>) {
  if (value.can_view !== true || value.can_trade !== false || value.can_transfer !== false || value.can_receive !== false) {
    throw new BankingError("coinbase_permissions", "This key is not View only. In Coinbase, enable View and turn off Trade, Transfer and Receive, then try again.", 422);
  }
}

async function get(credentials: CoinbaseCredentials, path: string, signal: AbortSignal): Promise<Record<string, unknown>> {
  const url = coinbasePath(path);
  const publicPrice = url.pathname.startsWith("/v2/prices/");
  let response: Response;
  try {
    response = await fetch(url, { method: "GET", redirect: "error", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
      headers: { Accept: "application/json", "CB-VERSION": "2024-01-01", ...(!publicPrice ? { Authorization: `Bearer ${coinbaseJwt(credentials, path)}` } : {}) } });
  } catch { throw new BankingError("coinbase_unavailable", "Coinbase did not respond in time. Try again; your saved snapshot is preserved.", 502); }
  if (!response.ok) {
    await response.body?.cancel();
    throw new BankingError(response.status === 401 || response.status === 403 ? "coinbase_access" : "coinbase_unavailable",
      response.status === 401 || response.status === 403 ? "Coinbase denied access. Check the key, View permission, portfolio access and any IP restrictions." :
        response.status === 429 ? "Coinbase asked us to wait. Try syncing again later." : "Coinbase could not complete the request. Your saved snapshot is preserved.", 502);
  }
  // Bound each response before parsing; never log or return raw provider errors.
  const reader = response.body?.getReader(); if (!reader) throw invalidData();
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length;
    if (size > 2_000_000) { await reader.cancel(); throw invalidData(); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString("utf8")); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value; }
  catch { throw invalidData(); }
}
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidData(); return value as Record<string, unknown>; }
function decimal(value: unknown): string {
  if (typeof value !== "string" || !/^-?\d{1,16}(?:\.\d{1,24})?$/.test(value) || !Number.isFinite(Number(value))) throw invalidData();
  return value;
}
function dollars(value: number) { if (!Number.isSafeInteger(Math.round(value * 100))) throw invalidData(); return Math.round(value * 100) / 100; }
function list(value: Record<string, unknown>, max: number) { if (!Array.isArray(value.data) || value.data.length > max) throw invalidData(); return value.data.map(object); }
function identifier(value: unknown) { if (typeof value !== "string" || !idPattern.test(value)) throw invalidData(); return value; }
function currency(value: unknown) { if (typeof value !== "string" || !currencyPattern.test(value)) throw invalidData(); return value; }
async function batches<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const result: R[] = [];
  for (let start = 0; start < items.length; start += 5) result.push(...await Promise.all(items.slice(start, start + 5).map(fn)));
  return result;
}

export async function retrieveCoinbase(credentials: CoinbaseCredentials): Promise<CoinbaseSnapshot> {
  const signal = AbortSignal.timeout(180_000);
  assertCoinbaseViewOnly(await get(credentials, "/api/v3/brokerage/key_permissions", signal));
  const accounts: Record<string, unknown>[] = [], seenPages = new Set<string>();
  let next = "/v2/accounts?limit=100";
  while (next) {
    if (seenPages.has(next) || seenPages.size >= 10 || coinbasePath(next).pathname !== "/v2/accounts") throw invalidData();
    seenPages.add(next);
    const page = await get(credentials, next, signal); accounts.push(...list(page, 100));
    const pagination = object(page.pagination);
    if (pagination.next_uri !== null && typeof pagination.next_uri !== "string") throw invalidData();
    next = pagination.next_uri as string || "";
    if (accounts.length > 500) throw new BankingError("coinbase_limit", "This personal connector supports up to 500 Coinbase wallets.", 422);
  }
  if (!accounts.length) throw new BankingError("coinbase_accounts", "No Coinbase wallets are accessible to this key. Check its portfolio access.", 422);
  const ids = new Set<string>();
  const holdings: CoinbaseHolding[] = accounts.map(account => {
    const id = identifier(account.id), balance = object(account.balance), quantity = decimal(balance.amount);
    if (ids.has(id) || Number(quantity) < 0) throw invalidData(); ids.add(id);
    return { id, name: typeof account.name === "string" ? account.name.slice(0, 120) : "Coinbase wallet", currency: currency(balance.currency), quantity, valueUsd: null };
  }).filter(item => Number(item.quantity) !== 0 || item.currency === "USD");
  if (holdings.length > 100) throw new BankingError("coinbase_limit", "This personal connector supports up to 100 funded wallets.", 422);
  const prices = new Map<string, number | null>([["USD", 1]]);
  await batches([...new Set(holdings.map(item => item.currency))].filter(code => code !== "USD"), async code => {
    try { const price = object((await get(credentials, `/v2/prices/${code}-USD/spot`, signal)).data);
      const amount = Number(decimal(price.amount)); if (price.currency !== "USD" || amount <= 0) throw invalidData(); prices.set(code, amount);
    } catch { prices.set(code, null); }
  });
  for (const holding of holdings) { const price = prices.get(holding.currency); holding.valueUsd = price == null ? null : dollars(Number(holding.quantity) * price); }
  // A bounded activity view, deliberately separate from the spending ledger. Zero-balance historical wallets are not queried.
  const activity = (await batches(holdings, async holding => {
    const result = await get(credentials, `/v2/accounts/${holding.id}/transactions?limit=100&order=desc`, signal);
    const seen = new Set<string>();
    return list(result, 100).map((tx): CoinbaseActivity => {
      const id = identifier(tx.id), amount = object(tx.amount);
      if (seen.has(id) || typeof tx.created_at !== "string" || !Number.isFinite(Date.parse(tx.created_at)) || typeof tx.type !== "string" || typeof tx.status !== "string") throw invalidData(); seen.add(id);
      const native = tx.native_amount ? object(tx.native_amount) : null;
      return { id, accountId: holding.id, occurredAt: new Date(tx.created_at).toISOString(), type: tx.type.slice(0, 80), status: tx.status.slice(0, 40),
        quantity: decimal(amount.amount), currency: currency(amount.currency), valueUsd: native?.currency === "USD" ? dollars(Number(decimal(native.amount))) : null };
    });
  })).flat().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 500);
  return { retrievedAt: new Date().toISOString(), holdings, activity,
    totalUsd: holdings.some(item => item.valueUsd === null) ? null : dollars(holdings.reduce((sum, item) => sum + item.valueUsd!, 0)) };
}
