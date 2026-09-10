import { createCipheriv, createDecipheriv, createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import type { BankAccount, BankTransaction } from "./banking-types";

export class BankingError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export function bankingConfig() {
  const environment = process.env.PLAID_ENV === "sandbox" ? "sandbox" : "production";
  const clientId = process.env.PLAID_CLIENT_ID?.trim();
  const secret = process.env.PLAID_SECRET?.trim();
  const keyText = process.env.FINANCE_BANKING_KEY?.trim() || "";
  const key = Buffer.from(keyText, "base64");
  const origin = process.env.FINANCE_BANKING_ORIGIN?.trim() || "";
  let validOrigin = false;
  try {
    const url = new URL(origin);
    validOrigin = url.origin === origin && !url.username && !url.password &&
      (url.protocol === "https:" || (environment === "sandbox" && url.protocol === "http:" && url.hostname === "localhost"));
  } catch { /* Disabled until configuration is complete. */ }
  const durable = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  // Sandbox fixtures must use an explicit directory, never a tracked data file or /tmp fallback.
  const localSandbox = environment === "sandbox" && Boolean(process.env.FREMEN_DATA_DIR);
  const configured = Boolean(["sandbox", "production"].includes(process.env.PLAID_ENV || "") && clientId && secret && key.length === 32 && key.toString("base64") === keyText &&
    validOrigin && (durable || localSandbox) && process.env.PLAID_PLAN === "trial");
  return { configured, environment, clientId, secret, key, origin } as const;
}

export function requireBankingConfig() {
  const config = bankingConfig();
  if (!config.configured) throw new BankingError("not_configured", "Bank connections need secure server configuration before you can connect.", 503);
  return config;
}

export interface EncryptedBanking { v: 1; nonce: string; tag: string; ciphertext: string }
export function encryptBanking(value: unknown): EncryptedBanking {
  const { key, environment } = requireBankingConfig();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(`unigentamos:finance-banking:v1:${environment}`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { v: 1, nonce: nonce.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}
export function decryptBanking<T>(value: EncryptedBanking): T {
  const { key, environment } = requireBankingConfig();
  try {
    if (value.v !== 1) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.nonce, "base64"));
    decipher.setAAD(Buffer.from(`unigentamos:finance-banking:v1:${environment}`));
    decipher.setAuthTag(Buffer.from(value.tag, "base64"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64")), decipher.final()]).toString("utf8")) as T;
  } catch { throw new BankingError("storage_locked", "The encrypted bank store could not be opened. Check the server encryption key; do not replace or reset the store.", 503); }
}

export async function plaid<T>(endpoint: string, input: Record<string, unknown>): Promise<T> {
  const config = requireBankingConfig();
  let response: Response;
  try {
    response = await fetch(`https://${config.environment}.plaid.com${endpoint}`, {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000),
      headers: { "Content-Type": "application/json", "Plaid-Version": "2020-09-14" },
      body: JSON.stringify({ ...input, client_id: config.clientId, secret: config.secret })
    });
  } catch { throw new BankingError("provider_unavailable", "The bank connection service did not respond. Your saved records are unchanged.", 502); }
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.error_code) {
    const code = typeof body?.error_code === "string" ? body.error_code : "provider_error";
    const messages: Record<string, string> = {
      ITEM_LOGIN_REQUIRED: "Reconnect this institution to resume updates.",
      INVALID_CREDENTIALS: "The server Plaid credentials need attention.",
      INVALID_PRODUCT: "Transactions is not enabled for this connection.",
      ACCESS_NOT_GRANTED: "Transactions access was not granted. Reconnect and review the account permissions.",
      RATE_LIMIT_EXCEEDED: "Plaid asked us to wait. Try again later.",
      ITEM_NOT_FOUND: "The institution connection no longer exists.",
      INVALID_ACCESS_TOKEN: "The saved institution connection is no longer valid.",
      TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION: "The bank updated its data during retrieval. Try syncing again."
    };
    throw new BankingError(Object.hasOwn(messages, code) ? code : "provider_error", messages[code] || "Plaid could not complete this request. Try again later or check the Plaid dashboard.", 502);
  }
  return body as T;
}

type ProviderAccount = { account_id: string; name: string; mask?: string; type: string; subtype?: string; balances: { current: number | null; iso_currency_code?: string } };
export function normalizeAccounts(accounts: ProviderAccount[]): BankAccount[] {
  if (!Array.isArray(accounts) || accounts.length > 100) throw new BankingError("invalid_data", "The bank returned invalid account data.", 502);
  return accounts.map(account => {
    if (typeof account.account_id !== "string" || !account.balances) throw new BankingError("invalid_data", "The bank returned invalid account data.", 502);
    const balance = account.balances.current;
    const currency = account.balances.iso_currency_code || "Unknown";
    const kind = account.type === "credit" ? "Credit" : account.subtype === "savings" || account.subtype === "money market" ? "Savings" : "Checking";
    return { id: account.account_id, name: String(account.name || "Bank account").slice(0, 160), mask: String(account.mask || "").slice(-4), kind,
      balance: typeof balance === "number" && Number.isFinite(balance) && Number.isSafeInteger(Math.round(balance * 100)) ? Math.round(balance * 100) / 100 : null,
      currency, supported: currency === "USD" && (account.type === "depository" || account.type === "credit") };
  });
}
export interface ProviderTransaction {
  transaction_id: string; pending_transaction_id?: string | null; account_id: string; date: string; merchant_name?: string | null; name: string;
  amount: number; pending: boolean; iso_currency_code?: string | null; personal_finance_category?: { primary?: string; detailed?: string } | null;
}
export function normalizeTransaction(tx: ProviderTransaction): BankTransaction {
  if (!tx || typeof tx.transaction_id !== "string" || typeof tx.account_id !== "string" || typeof tx.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(tx.date) || !Number.isFinite(Date.parse(`${tx.date}T00:00:00Z`)) || new Date(`${tx.date}T00:00:00Z`).toISOString().slice(0, 10) !== tx.date ||
    typeof tx.amount !== "number" || !Number.isFinite(tx.amount) || !Number.isSafeInteger(Math.round(tx.amount * 100)) ||
    Math.abs(tx.amount) < 0.005 || tx.iso_currency_code !== "USD") {
    throw new BankingError("unsupported_transaction", "A bank transaction has an unsupported currency, date or amount. Sync paused without advancing the cursor; existing records are preserved.", 422);
  }
  const primary = tx.personal_finance_category?.primary || "";
  const detail = tx.personal_finance_category?.detailed || "";
  const transfer = primary === "TRANSFER_IN" || primary === "TRANSFER_OUT" || detail === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT";
  const category = detail || primary;
  return { id: tx.transaction_id, pendingId: tx.pending_transaction_id || undefined, accountId: tx.account_id, date: tx.date,
    merchant: String(tx.merchant_name || tx.name || "Bank transaction").slice(0, 240),
    category: category ? category.toLowerCase().replaceAll("_", " ").replace(/^./, text => text.toUpperCase()).slice(0, 160) : "Uncategorized",
    amount: Math.abs(Math.round(tx.amount * 100) / 100), direction: transfer ? "transfer" : tx.amount < 0 ? "income" : "expense", pending: tx.pending === true };
}

const webhookKeys = new Map<string, { key: ReturnType<typeof createPublicKey>; expires: number }>();
export async function verifyPlaidWebhook(raw: string, token: string | null): Promise<void> {
  try {
    if (!token || token.length > 5000) throw new Error();
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error();
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== "ES256" || typeof header.kid !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(header.kid) ||
      typeof payload.iat !== "number" || payload.iat < now - 300 || payload.iat > now + 30 ||
      typeof payload.request_body_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(payload.request_body_sha256)) throw new Error();
    const hash = createHash("sha256").update(raw).digest();
    if (!timingSafeEqual(hash, Buffer.from(payload.request_body_sha256, "hex"))) throw new Error();
    let cached = webhookKeys.get(header.kid);
    if (!cached || cached.expires <= now) {
      const { key } = await plaid<{ key: { alg: string; kty: string; crv: string; x: string; y: string; expired_at?: number | null } }>("/webhook_verification_key/get", { key_id: header.kid });
      if (key.alg !== "ES256" || key.kty !== "EC" || key.crv !== "P-256" || key.expired_at) throw new Error();
      cached = { key: createPublicKey({ key, format: "jwk" }), expires: now + 300 };
      if (webhookKeys.size >= 10) webhookKeys.clear();
      webhookKeys.set(header.kid, cached);
    }
    if (!verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), { key: cached.key, dsaEncoding: "ieee-p1363" }, Buffer.from(parts[2], "base64url"))) throw new Error();
  } catch { throw new BankingError("invalid_webhook", "Invalid webhook signature.", 401); }
}
