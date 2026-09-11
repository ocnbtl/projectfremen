import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { mutateJsonFile, readJsonFile } from "../../file-store";
import { BankingError, type EncryptedBanking } from "./banking-provider";
import { coinbaseCredentials, retrieveCoinbase, type CoinbaseCredentials } from "./coinbase-provider";
import type { CoinbaseSnapshot, CoinbaseView } from "./coinbase-types";
import { syncFinanceCoinbasePortfolio, disconnectFinanceCoinbasePortfolio } from "./store";

interface CoinbaseStore {
  version: 1;
  credentials?: CoinbaseCredentials;
  accountId?: string;
  snapshot?: CoinbaseSnapshot;
  error?: string;
  lastAttempt?: number;
  lease?: { id: string; until: number };
}
const filename = "finance-coinbase-personal.json";
export function coinbaseConfig() {
  const encoded = process.env.FINANCE_BANKING_KEY?.trim() || "", key = Buffer.from(encoded, "base64");
  const origin = process.env.FINANCE_BANKING_ORIGIN?.trim() || "";
  const fixture = process.env.FINANCE_COINBASE_TEST_MODE === "true" && process.env.VERCEL !== "1" && Boolean(process.env.FREMEN_DATA_DIR);
  let validOrigin = false;
  try { const url = new URL(origin); validOrigin = url.origin === origin && !url.username && !url.password && (url.protocol === "https:" || (fixture && url.hostname === "localhost" && url.protocol === "http:")); } catch { /* Fail closed. */ }
  return { configured: key.length === 32 && key.toString("base64") === encoded && validOrigin &&
    (Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) || fixture), key, origin };
}
function encryption() {
  const config = coinbaseConfig();
  if (!config.configured) throw new BankingError("coinbase_setup", "Coinbase needs the Finance server encryption key and durable storage configured.", 503);
  return { key: Buffer.from(hkdfSync("sha256", config.key, "unigentamos", "finance-coinbase-v1", 32)), aad: Buffer.from(`finance-coinbase:v1:${config.origin}`) };
}
export function encryptCoinbase(value: CoinbaseStore): EncryptedBanking {
  const { key, aad } = encryption(), nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, nonce); cipher.setAAD(aad);
  return { v: 1, nonce: nonce.toString("base64"), ciphertext: Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]).toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}
export function decryptCoinbase(value: EncryptedBanking): CoinbaseStore {
  const { key, aad } = encryption();
  try {
    if (value.v !== 1) throw new Error();
    const cipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.nonce, "base64")); cipher.setAAD(aad); cipher.setAuthTag(Buffer.from(value.tag, "base64"));
    const result = JSON.parse(Buffer.concat([cipher.update(Buffer.from(value.ciphertext, "base64")), cipher.final()]).toString("utf8"));
    if (result.version !== 1) throw new Error(); return result as CoinbaseStore;
  } catch { throw new BankingError("coinbase_locked", "The encrypted Coinbase store could not be opened. Restore the original encryption configuration; do not reset the store.", 503); }
}
async function readStore() { encryption(); const value = await readJsonFile<EncryptedBanking | null>(filename, null); return value ? decryptCoinbase(value) : { version: 1 } as CoinbaseStore; }
async function mutateStore<T>(fn: (state: CoinbaseStore) => T) {
  encryption();
  return mutateJsonFile<EncryptedBanking | null, T>(filename, null, value => {
    const state = value ? decryptCoinbase(value) : { version: 1 } as CoinbaseStore;
    const result = fn(state); return { value: encryptCoinbase(state), result };
  });
}
export async function coinbaseView(): Promise<CoinbaseView> {
  if (!coinbaseConfig().configured) return { configured: false, connected: false };
  const state = await readStore();
  return { configured: true, connected: Boolean(state.credentials), accountId: state.accountId, snapshot: state.snapshot, error: state.error };
}

export async function operateCoinbase(body: Record<string, unknown>) {
  const operation = body.operation;
  if (!["connect", "sync", "disconnect"].includes(String(operation))) throw new BankingError("invalid_request", "Unknown Coinbase operation.");
  const credentials = operation === "connect" ? coinbaseCredentials(body.keyName, body.privateKey) : undefined;
  if (operation === "connect" && (body.personalUse !== true || typeof body.accountId !== "string" || !/^[a-zA-Z0-9_-]{1,240}$/.test(body.accountId))) {
    throw new BankingError("invalid_request", "Choose a Finance account and confirm this is your own Coinbase account.");
  }
  const leaseId = randomUUID();
  const state = await mutateStore(current => {
    if (current.lease && current.lease.until > Date.now()) throw new BankingError("coinbase_busy", "A Coinbase update is already running. Wait for it to finish.", 409);
    if (operation !== "disconnect" && current.lastAttempt && Date.now() - current.lastAttempt < 60_000) throw new BankingError("coinbase_cooldown", "Wait one minute between Coinbase attempts.", 429);
    if (operation === "connect" && current.credentials) throw new BankingError("coinbase_connected", "Disconnect the current key before replacing it. Your saved snapshot will remain available.", 409);
    if (operation === "sync" && !current.credentials) throw new BankingError("coinbase_disconnected", "Connect Coinbase before syncing.", 409);
    current.lease = { id: leaseId, until: Date.now() + 330_000 }; current.lastAttempt = Date.now(); return structuredClone(current);
  });
  try {
    if (operation === "disconnect") {
      await disconnectFinanceCoinbasePortfolio();
      await mutateStore(current => { if (current.lease?.id !== leaseId) throw new BankingError("coinbase_busy", "The connection changed. Reload Finance.", 409);
        delete current.credentials; delete current.lease; delete current.error; delete current.lastAttempt; });
    } else {
      const snapshot = await retrieveCoinbase(credentials || state.credentials!);
      // Network work ends before the lease expires; no provider calls occur inside a CAS retry.
      if (!state.lease || Date.now() >= state.lease.until - 30_000) throw new BankingError("coinbase_busy", "The update took too long. Try again.", 409);
      const accountId = await syncFinanceCoinbasePortfolio(operation === "connect" ? String(body.accountId) : state.accountId!, snapshot);
      await mutateStore(current => { if (current.lease?.id !== leaseId) throw new BankingError("coinbase_busy", "The connection changed. Reload Finance.", 409);
        current.credentials = credentials || state.credentials; current.accountId = accountId; current.snapshot = snapshot; delete current.error; delete current.lease; });
    }
  } catch (error) {
    await mutateStore(current => { if (current.lease?.id === leaseId) { delete current.lease; current.error = error instanceof BankingError ? error.message : "Coinbase could not be updated. Try again later."; } });
    throw error;
  }
  return coinbaseView();
}
