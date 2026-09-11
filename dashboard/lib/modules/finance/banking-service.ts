import { createHash, randomUUID } from "node:crypto";
import { mutateJsonFile, readJsonFile } from "../../file-store";
import type { BankAccount, BankConnectionView, BankingView } from "./banking-types";
import { BankingError, bankingConfig, requireBankingConfig, encryptBanking, decryptBanking, plaid, normalizeAccounts, normalizeTransaction, type EncryptedBanking, type ProviderTransaction } from "./banking-provider";
import { applyFinanceBankBatch, connectFinanceBankAccounts, disconnectFinanceBankAccounts } from "./store";

interface Connection extends BankConnectionView {
  accessToken: string;
  itemId: string;
  cursor?: string;
  lease?: { id: string; until: number };
  lastAttempt?: number;
  disconnectPending?: boolean;
}
interface LinkSession {
  id: string;
  expires: number;
  linkToken?: string;
  connectionId?: string;
  exchangeStarted?: boolean;
  tokenHash?: string;
  completed?: string;
}
interface BankStore { version: 1; connectionsUsed: number; connections: Connection[]; sessions: LinkSession[]; lastLinkAt?: number }
const emptyStore = (): BankStore => ({ version: 1, connectionsUsed: 0, connections: [], sessions: [] });
const fileName = () => `finance-banking-${requireBankingConfig().environment}.json`;
async function readStore(): Promise<BankStore> {
  const encrypted = await readJsonFile<EncryptedBanking | null>(fileName(), null);
  return encrypted ? decryptBanking<BankStore>(encrypted) : emptyStore();
}
async function mutateStore<T>(fn: (state: BankStore) => T): Promise<T> {
  return mutateJsonFile<EncryptedBanking | null, T>(fileName(), null, value => {
    const state = value ? decryptBanking<BankStore>(value) : emptyStore();
    const result = fn(state);
    return { value: encryptBanking(state), result };
  });
}
function connectionFor(state: BankStore, id: string): Connection {
  const connection = state.connections.find(item => item.id === id);
  if (!connection || connection.status === "disconnected") throw new BankingError("missing_connection", "This connection is no longer active.", 404);
  return connection;
}
function textInput(value: unknown, name: string, max = 300): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new BankingError("invalid_request", `${name} is required.`);
  return value.trim();
}

export async function bankingView(): Promise<BankingView> {
  const config = bankingConfig();
  if (!config.configured) return { configured: false, environment: config.environment, connectionsUsed: 0, connections: [] };
  const state = await readStore();
  const reserved = state.sessions.filter(session => session.expires > Date.now() && !session.connectionId && !session.exchangeStarted && !session.completed).length;
  return { configured: true, environment: config.environment, origin: config.origin, connectionsUsed: state.connectionsUsed + reserved,
    connections: state.connections.map(item => ({ id: item.id, name: item.name, status: item.status, accounts: item.accounts, mappings: item.mappings,
      lastSyncedAt: item.lastSyncedAt, initialComplete: item.initialComplete, error: item.error })) };
}

export async function createBankLink(connectionId?: string) {
  const config = requireBankingConfig();
  const id = randomUUID(), now = Date.now();
  const existing = await mutateStore(state => {
    // Keep ambiguous exchanges for recovery rather than silently consuming another lifetime Item.
    state.sessions = state.sessions.filter(session => session.expires > now || (session.exchangeStarted && !session.completed));
    if (state.lastLinkAt && now - state.lastLinkAt < 10_000) throw new BankingError("cooldown", "Wait a few seconds before opening another connection.", 429);
    const current = connectionId ? connectionFor(state, connectionId) : undefined;
    if (current?.disconnectPending) throw new BankingError("disconnect_pending", "Finish disconnecting this institution first.", 409);
    if (!current && state.sessions.some(session => session.exchangeStarted && !session.completed)) {
      throw new BankingError("exchange_pending", "A previous connection is still being saved or needs recovery. Check the Plaid dashboard before starting another connection.", 409);
    }
    const reserved = state.sessions.filter(session => !session.connectionId && !session.exchangeStarted && !session.completed).length;
    if (!current && state.connectionsUsed + reserved >= 10) throw new BankingError("trial_limit", "All ten Trial connection slots are used or reserved. Disconnecting does not restore the lifetime allowance.", 409);
    state.lastLinkAt = now;
    state.sessions.push({ id, expires: now + 30 * 60_000, connectionId });
    return current ? { accessToken: current.accessToken } : null;
  });
  try {
    const response = await plaid<{ link_token: string; expiration: string }>("/link/token/create", {
      client_name: "Unigentamos", user: { client_user_id: "unigentamos-personal-owner" }, country_codes: ["US"], language: "en",
      redirect_uri: `${config.origin}/admin/finance/accounts`, webhook: `${config.origin}/api/finance/banking/webhook`,
      ...(existing ? { access_token: existing.accessToken } : { products: ["transactions"], transactions: { days_requested: 90 },
        account_filters: { depository: { account_subtypes: ["checking", "savings", "money market", "cash management", "cd", "paypal"] }, credit: { account_subtypes: ["credit card"] } } })
    });
    await mutateStore(state => {
      const session = state.sessions.find(item => item.id === id);
      if (!session) throw new BankingError("session_expired", "Open a new connection session.", 409);
      session.linkToken = response.link_token;
      session.expires = Math.min(session.expires, Date.parse(response.expiration));
    });
    return { sessionId: id, linkToken: response.link_token, expiresAt: new Date(now + 30 * 60_000).toISOString(), update: Boolean(existing) };
  } catch (error) {
    await mutateStore(state => { state.sessions = state.sessions.filter(item => item.id !== id); });
    throw error;
  }
}

export async function exchangeBankLink(rawId: unknown, rawToken: unknown) {
  const id = textInput(rawId, "Session"), token = textInput(rawToken, "Public token", 1000);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const session = await mutateStore(state => {
    const session = state.sessions.find(item => item.id === id);
    if (!session || session.expires < Date.now()) throw new BankingError("session_expired", "This Link session expired. Open a new session.", 409);
    if (session.completed) {
      if (session.tokenHash !== tokenHash) throw new BankingError("session_used", "This session has already completed.", 409);
      return { ...session };
    }
    if (session.exchangeStarted) throw new BankingError("exchange_pending", "This connection is being saved or needs recovery. Reload to check its status before trying another connection.", 409);
    session.exchangeStarted = true; session.tokenHash = tokenHash;
    if (!session.connectionId) {
      if (state.connectionsUsed >= 10) throw new BankingError("trial_limit", "The lifetime Trial connection allowance has been reached.", 409);
      state.connectionsUsed += 1;
    }
    return { ...session };
  });
  if (session.completed) return session.completed;
  if (session.connectionId) {
    await mutateStore(state => {
      const connection = connectionFor(state, session.connectionId!);
      connection.error = undefined;
      connection.status = Object.keys(connection.mappings).length ? "connected" : "mapping";
      state.sessions.find(item => item.id === id)!.completed = connection.id;
    });
    return session.connectionId;
  }
  // Never retry an ambiguous exchange automatically: public tokens are one-use, and Trial Items are lifetime-limited.
  const response = await plaid<{ access_token: string; item_id: string }>("/item/public_token/exchange", { public_token: token });
  if (typeof response.access_token !== "string" || typeof response.item_id !== "string") throw new BankingError("invalid_data", "Plaid returned an incomplete connection. Check the Plaid dashboard before retrying.", 502);
  const connectionId = randomUUID();
  await mutateStore(state => {
    state.connections.push({ id: connectionId, name: "Bank connection", itemId: response.item_id, accessToken: response.access_token,
      status: "mapping", accounts: [], mappings: {} });
    state.sessions.find(item => item.id === id)!.completed = connectionId;
  });
  // Credentials are durable before any subsequent request. A metadata failure is recoverable from the panel.
  try { await refreshBankAccounts(connectionId); } catch { /* Show a recoverable connection, never lose the stored token. */ }
  return connectionId;
}

export async function cancelBankLink(id: string) {
  if (!bankingConfig().configured) return;
  await mutateStore(state => { state.sessions = state.sessions.filter(session => session.id !== id || session.exchangeStarted); });
}

async function withConnection<T>(id: string, fn: (connection: Connection) => Promise<T>, cooldown = false): Promise<T> {
  const leaseId = randomUUID();
  const connection = await mutateStore(state => {
    const item = connectionFor(state, id), now = Date.now();
    if (item.lease && item.lease.until > now) throw new BankingError("connection_busy", "This connection is already updating. Try again shortly.", 409);
    if (cooldown && item.lastAttempt && now - item.lastAttempt < 60_000) throw new BankingError("cooldown", "This connection was checked recently. Try again in a minute.", 429);
    item.lease = { id: leaseId, until: now + 600_000 }; item.lastAttempt = now;
    return structuredClone(item);
  });
  try { return await fn(connection); }
  catch (error) {
    await mutateStore(state => {
      const item = state.connections.find(item => item.id === id);
      if (item && item.status !== "disconnected") {
        item.error = error instanceof BankingError ? error.message : "The connection could not be saved. Try again later.";
        if (error instanceof BankingError && ["ITEM_LOGIN_REQUIRED", "ACCESS_NOT_GRANTED"].includes(error.code)) item.status = "reconnect";
      }
    });
    throw error;
  } finally {
    await mutateStore(state => {
      const item = state.connections.find(item => item.id === id);
      if (item?.lease?.id === leaseId) delete item.lease;
    });
  }
}

async function providerAccounts(connection: Connection) {
  const data = await plaid<{ accounts: Parameters<typeof normalizeAccounts>[0]; item: { institution_id: string | null } }>("/accounts/get", { access_token: connection.accessToken });
  return { accounts: normalizeAccounts(data.accounts), institutionId: data.item.institution_id };
}

export async function refreshBankAccounts(id: string) {
  return withConnection(id, async connection => {
    const { accounts, institutionId } = await providerAccounts(connection);
    let name = connection.name;
    if (institutionId && name === "Bank connection") {
      const data = await plaid<{ institution: { name: string } }>("/institutions/get_by_id", { institution_id: institutionId, country_codes: ["US"] });
      name = String(data.institution.name).slice(0, 160);
    }
    await mutateStore(state => { const item = connectionFor(state, id); item.accounts = accounts; item.name = name; item.error = undefined; });
  }, true);
}

export async function mapBankAccounts(id: string, choices: Record<string, string>) {
  return withConnection(id, async connection => {
    if (Object.keys(connection.mappings).length) throw new BankingError("already_mapped", "These accounts have already been matched.", 409);
    const mappings = await connectFinanceBankAccounts(id, connection.name, connection.accounts, choices);
    await mutateStore(state => { const item = connectionFor(state, id); item.mappings = mappings; item.status = "connected"; item.error = undefined; item.lastAttempt = undefined; });
  });
}

interface SyncResponse { added: ProviderTransaction[]; modified: ProviderTransaction[]; removed: { transaction_id: string }[]; next_cursor: string; has_more: boolean; transactions_update_status?: string }
export async function syncBankConnection(id: string) {
  return withConnection(id, async connection => {
    if (connection.disconnectPending) throw new BankingError("disconnect_pending", "Finish disconnecting this institution first.", 409);
    if (!Object.keys(connection.mappings).length) throw new BankingError("mapping_required", "Match your accounts before syncing transactions.", 409);
    const { accounts } = await providerAccounts(connection);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let cursor = connection.cursor, complete = false, updateStatus = "";
      const transactions: ProviderTransaction[] = [], removed: string[] = [];
      try {
        for (let page = 0; page < 10; page += 1) {
          const response = await plaid<SyncResponse>("/transactions/sync", { access_token: connection.accessToken, ...(cursor ? { cursor } : {}), count: 500 });
          if (!Array.isArray(response.added) || !Array.isArray(response.modified) || !Array.isArray(response.removed) || typeof response.next_cursor !== "string" || typeof response.has_more !== "boolean") {
            throw new BankingError("invalid_data", "Plaid returned incomplete transaction data. Nothing was imported.", 502);
          }
          transactions.push(...response.added, ...response.modified);
          removed.push(...response.removed.map(item => textInput(item.transaction_id, "Removed transaction")));
          cursor = response.next_cursor; updateStatus = response.transactions_update_status || "";
          if (!response.has_more) { complete = true; break; }
        }
        if (!complete) throw new BankingError("sync_too_large", "This update exceeds the safe import size. The cursor was preserved for a larger controlled import.", 422);
        const normalized = transactions.filter(item => Object.hasOwn(connection.mappings, item.account_id)).map(normalizeTransaction);
        // Finance writes precede cursor advancement. A crash replays deterministically without duplicate rows.
        await applyFinanceBankBatch(id, connection.mappings, accounts, normalized, removed);
        await mutateStore(state => {
          const item = connectionFor(state, id);
          item.cursor = cursor; item.accounts = accounts; item.lastSyncedAt = new Date().toISOString(); item.error = undefined; item.status = "connected";
          item.initialComplete = item.initialComplete || updateStatus === "HISTORICAL_UPDATE_COMPLETE";
        });
        return;
      } catch (error) {
        if (error instanceof BankingError && error.code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" && attempt === 0) continue;
        throw error;
      }
    }
  }, true);
}

export async function disconnectBankConnection(id: string) {
  const previous = (await readStore()).connections.find(item => item.id === id);
  if (previous?.status === "disconnected") { await disconnectFinanceBankAccounts(id); return; }
  return withConnection(id, async connection => {
    await mutateStore(state => { connectionFor(state, id).disconnectPending = true; });
    try { await plaid("/item/remove", { access_token: connection.accessToken }); }
    catch (error) {
      if (!(error instanceof BankingError && ["ITEM_NOT_FOUND", "INVALID_ACCESS_TOKEN"].includes(error.code))) throw error;
    }
    // Remove credentials immediately once revocation succeeds. Saved Finance history remains.
    await mutateStore(state => {
      const item = connectionFor(state, id); item.status = "disconnected"; item.accessToken = ""; item.cursor = undefined;
      item.accounts = []; item.error = undefined; item.disconnectPending = false;
      state.sessions = state.sessions.filter(session => session.connectionId !== id && session.completed !== id);
    });
    await disconnectFinanceBankAccounts(id);
  });
}

export async function handleBankWebhook(body: Record<string, unknown>) {
  if (typeof body.item_id !== "string") return;
  const state = await readStore();
  const connection = state.connections.find(item => item.itemId === body.item_id && item.status !== "disconnected");
  if (!connection || connection.disconnectPending) return;
  if (body.webhook_type === "TRANSACTIONS" && body.webhook_code === "SYNC_UPDATES_AVAILABLE" && Object.keys(connection.mappings).length) {
    // Busy/cooldown means retry: do not acknowledge a notification before its data is durable.
    await syncBankConnection(connection.id);
  } else if (body.webhook_type === "ITEM" && ["ERROR", "PENDING_EXPIRATION", "PENDING_DISCONNECT", "USER_PERMISSION_REVOKED"].includes(String(body.webhook_code))) {
    await mutateStore(state => {
      const item = connectionFor(state, connection.id);
      item.status = "reconnect"; item.error = "This institution needs your attention. Reconnect to review permissions.";
    });
  }
}
