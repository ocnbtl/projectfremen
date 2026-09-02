import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const STATIC_DATA_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "data");
const FALLBACK_DATA_DIR = path.join("/tmp", "project-fremen-data");
const REQUIRE_PERSISTENT_DATA =
  process.env.FREMEN_REQUIRE_PERSISTENT_DATA?.trim().toLowerCase() === "true";
const REQUIRE_SUPABASE =
  process.env.FREMEN_REQUIRE_SUPABASE?.trim().toLowerCase() === "true";
const SUPABASE_URL = process.env.SUPABASE_URL?.trim() || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
let resolvedDataDirPromise: Promise<string> | null = null;
const writeQueues = new Map<string, Promise<void>>();
let ephemeralWarningShown = false;

type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
};

type SupabaseStoredRow<T> = {
  value: T;
  updatedAt: string;
};

export type JsonMutation<T, Result> = {
  value: T;
  result: Result;
  changed?: boolean;
};

let supabaseConfigWarningShown = false;

async function canWriteDirectory(dir: string): Promise<boolean> {
  try {
    await mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
    await access(/* turbopackIgnore: true */ dir, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveDataDirectory(): Promise<string> {
  const configured = process.env.FREMEN_DATA_DIR?.trim();
  if (configured) {
    await mkdir(/* turbopackIgnore: true */ configured, { recursive: true });
    return configured;
  }

  if (await canWriteDirectory(STATIC_DATA_DIR)) {
    return STATIC_DATA_DIR;
  }

  if (REQUIRE_PERSISTENT_DATA) {
    throw new Error(
      "No writable persistent data directory found. Set FREMEN_DATA_DIR or disable FREMEN_REQUIRE_PERSISTENT_DATA."
    );
  }

  if (!ephemeralWarningShown && process.env.NODE_ENV === "production") {
    ephemeralWarningShown = true;
    console.warn(
      "[project-fremen] Using ephemeral fallback data directory (/tmp). Set FREMEN_DATA_DIR for durable writes."
    );
  }

  await mkdir(/* turbopackIgnore: true */ FALLBACK_DATA_DIR, { recursive: true });
  return FALLBACK_DATA_DIR;
}

function getSupabaseConfig(): SupabaseConfig | null {
  const hasUrl = Boolean(SUPABASE_URL);
  const hasKey = Boolean(SUPABASE_SERVICE_ROLE_KEY);
  const configured = hasUrl && hasKey;

  if (!configured) {
    if (REQUIRE_SUPABASE) {
      throw new Error(
        "Supabase is required but not fully configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
      );
    }
    if ((hasUrl || hasKey) && !supabaseConfigWarningShown) {
      supabaseConfigWarningShown = true;
      console.warn(
        "[project-fremen] Partial Supabase config detected. Both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required; falling back to filesystem store."
      );
    }
    return null;
  }

  return {
    url: SUPABASE_URL.replace(/\/+$/, ""),
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY
  };
}

async function getDataDirectory(): Promise<string> {
  if (!resolvedDataDirPromise) {
    resolvedDataDirPromise = resolveDataDirectory();
  }
  return resolvedDataDirPromise;
}

function getPendingWrite(fileName: string): Promise<void> | null {
  return writeQueues.get(fileName) || null;
}

async function withWriteLock<Result>(fileName: string, task: () => Promise<Result>): Promise<Result> {
  const previous = writeQueues.get(fileName) || Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  const completion = next.then(() => undefined, () => undefined);
  writeQueues.set(fileName, completion);

  try {
    return await next;
  } finally {
    if (writeQueues.get(fileName) === completion) {
      writeQueues.delete(fileName);
    }
  }
}

async function tryReadJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(/* turbopackIgnore: true */ filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function supabaseHeaders(config: SupabaseConfig): Record<string, string> {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

async function readJsonRecordFromSupabase<T>(fileName: string, config: SupabaseConfig): Promise<SupabaseStoredRow<T> | null> {
  const query = new URLSearchParams({
    select: "value,updated_at",
    key: `eq.${fileName}`,
    limit: "1"
  });
  const response = await fetch(`${config.url}/rest/v1/app_state?${query.toString()}`, {
    method: "GET",
    headers: supabaseHeaders(config),
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Supabase read failed (${response.status}) for key ${fileName}`);
  }

  const rows = (await response.json().catch(() => [])) as Array<{ value?: unknown; updated_at?: unknown }>;
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  if (typeof rows[0]?.updated_at !== "string" || rows[0]?.value === undefined) {
    throw new Error(`Supabase returned an invalid app_state row for key ${fileName}`);
  }
  return { value: rows[0].value as T, updatedAt: rows[0].updated_at };
}

async function readJsonFromSupabase<T>(fileName: string, config: SupabaseConfig): Promise<T | null> {
  return (await readJsonRecordFromSupabase<T>(fileName, config))?.value ?? null;
}

async function writeJsonToSupabase<T>(fileName: string, value: T, config: SupabaseConfig): Promise<void> {
  const payload = [{ key: fileName, value }];
  const response = await fetch(
    `${config.url}/rest/v1/app_state?on_conflict=key`,
    {
      method: "POST",
      headers: {
        ...supabaseHeaders(config),
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    }
  );
  if (!response.ok) {
    throw new Error(`Supabase write failed (${response.status}) for key ${fileName}`);
  }
}

async function deleteJsonFromSupabase(fileName: string, config: SupabaseConfig): Promise<void> {
  const query = new URLSearchParams({ key: `eq.${fileName}` });
  const response = await fetch(`${config.url}/rest/v1/app_state?${query.toString()}`, {
    method: "DELETE",
    headers: {
      ...supabaseHeaders(config),
      Prefer: "return=minimal"
    },
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Supabase delete failed (${response.status}) for key ${fileName}`);
  }
}

function nextStoreVersion(previous?: string): string {
  const now = new Date().toISOString();
  if (!previous || now > previous) return now;
  const previousMs = Date.parse(previous);
  return Number.isFinite(previousMs) ? new Date(previousMs + 1).toISOString() : now;
}

async function compareAndSetJsonInSupabase<T>(
  fileName: string,
  value: T,
  expectedUpdatedAt: string | null,
  config: SupabaseConfig
): Promise<boolean> {
  const updatedAt = nextStoreVersion(expectedUpdatedAt || undefined);
  if (expectedUpdatedAt === null) {
    const response = await fetch(`${config.url}/rest/v1/app_state?on_conflict=key`, {
      method: "POST",
      headers: {
        ...supabaseHeaders(config),
        Prefer: "resolution=ignore-duplicates,return=representation"
      },
      body: JSON.stringify([{ key: fileName, value, updated_at: updatedAt }]),
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error(`Supabase compare-and-set insert failed (${response.status}) for key ${fileName}`);
    }
    const rows = (await response.json().catch(() => [])) as unknown;
    return Array.isArray(rows) && rows.length === 1;
  }

  const query = new URLSearchParams({
    key: `eq.${fileName}`,
    updated_at: `eq.${expectedUpdatedAt}`
  });
  const response = await fetch(`${config.url}/rest/v1/app_state?${query.toString()}`, {
    method: "PATCH",
    headers: {
      ...supabaseHeaders(config),
      Prefer: "return=representation"
    },
    body: JSON.stringify({ value, updated_at: updatedAt }),
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Supabase compare-and-set update failed (${response.status}) for key ${fileName}`);
  }
  const rows = (await response.json().catch(() => [])) as unknown;
  return Array.isArray(rows) && rows.length === 1;
}

async function readJsonFileUnlocked<T>(fileName: string, fallback: T): Promise<T> {
  const supabase = getSupabaseConfig();
  if (supabase) {
    const value = await readJsonFromSupabase<T>(fileName, supabase);
    if (value !== null) return value;
    return (await tryReadJsonFile<T>(path.join(/* turbopackIgnore: true */ process.cwd(), "data", fileName))) ?? fallback;
  }

  const dataDir = await getDataDirectory();
  const preferredValue = await tryReadJsonFile<T>(path.join(/* turbopackIgnore: true */ dataDir, fileName));
  if (preferredValue !== null) return preferredValue;
  if (dataDir !== STATIC_DATA_DIR) {
    return (await tryReadJsonFile<T>(path.join(/* turbopackIgnore: true */ process.cwd(), "data", fileName))) ?? fallback;
  }
  return fallback;
}

export async function readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
  const pendingWrite = getPendingWrite(fileName);
  if (pendingWrite) {
    await pendingWrite.catch(() => undefined);
  }

  const supabase = getSupabaseConfig();
  if (supabase) {
    const value = await readJsonFromSupabase<T>(fileName, supabase);
    if (value !== null) {
      return value;
    }

    const staticPath = path.join(/* turbopackIgnore: true */ process.cwd(), "data", fileName);
    const staticValue = await tryReadJsonFile<T>(staticPath);
    if (staticValue !== null) {
      await writeJsonToSupabase(fileName, staticValue, supabase);
      return staticValue;
    }

    return fallback;
  }

  const dataDir = await getDataDirectory();
  const preferredPath = path.join(/* turbopackIgnore: true */ dataDir, fileName);
  const preferredValue = await tryReadJsonFile<T>(preferredPath);
  if (preferredValue !== null) {
    return preferredValue;
  }

  if (dataDir !== STATIC_DATA_DIR) {
    const staticPath = path.join(/* turbopackIgnore: true */ process.cwd(), "data", fileName);
    const staticValue = await tryReadJsonFile<T>(staticPath);
    if (staticValue !== null) {
      try {
        await writeJsonFile(fileName, staticValue);
      } catch {
        // Non-fatal: request should continue even if cache seeding fails.
      }
      return staticValue;
    }
  }

  return fallback;
}

export async function writeJsonFile<T>(fileName: string, value: T): Promise<void> {
  await withWriteLock(fileName, async () => {
    const supabase = getSupabaseConfig();
    if (supabase) {
      await writeJsonToSupabase(fileName, value, supabase);
      return;
    }

    const dataDir = await getDataDirectory();
    await mkdir(/* turbopackIgnore: true */ dataDir, { recursive: true });
    const filePath = path.join(/* turbopackIgnore: true */ dataDir, fileName);
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await writeFile(/* turbopackIgnore: true */ tmpPath, JSON.stringify(value, null, 2) + "\n", "utf8");
    await rename(/* turbopackIgnore: true */ tmpPath, filePath);
  });
}

/** Delete a runtime JSON record. The operation is intentionally idempotent. */
export async function deleteJsonFile(fileName: string): Promise<void> {
  await withWriteLock(fileName, async () => {
    const supabase = getSupabaseConfig();
    if (supabase) {
      await deleteJsonFromSupabase(fileName, supabase);
      return;
    }

    const dataDir = await getDataDirectory();
    try {
      await unlink(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ dataDir, fileName));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  });
}

/**
 * Atomically derives and persists a JSON value. Supabase writes use the existing
 * app_state.updated_at column as a compare-and-set token, so concurrent Vercel
 * instances retry instead of silently replacing each other's document.
 */
export async function mutateJsonFile<T, Result>(
  fileName: string,
  fallback: T,
  mutate: (current: T) => JsonMutation<T, Result> | Promise<JsonMutation<T, Result>>,
  options: { maxAttempts?: number } = {}
): Promise<Result> {
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 8, 20));
  return withWriteLock(fileName, async () => {
    const supabase = getSupabaseConfig();
    if (!supabase) {
      const current = await readJsonFileUnlocked(fileName, fallback);
      const outcome = await mutate(current);
      if (outcome.changed !== false) {
        const dataDir = await getDataDirectory();
        await mkdir(/* turbopackIgnore: true */ dataDir, { recursive: true });
        const filePath = path.join(/* turbopackIgnore: true */ dataDir, fileName);
        const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        await writeFile(/* turbopackIgnore: true */ tmpPath, JSON.stringify(outcome.value, null, 2) + "\n", "utf8");
        await rename(/* turbopackIgnore: true */ tmpPath, filePath);
      }
      return outcome.result;
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const record = await readJsonRecordFromSupabase<T>(fileName, supabase);
      const current = record?.value
        ?? (await tryReadJsonFile<T>(path.join(/* turbopackIgnore: true */ process.cwd(), "data", fileName)))
        ?? fallback;
      const outcome = await mutate(current);
      if (outcome.changed === false) return outcome.result;
      if (await compareAndSetJsonInSupabase(fileName, outcome.value, record?.updatedAt ?? null, supabase)) {
        return outcome.result;
      }
    }
    throw new Error(`Concurrent writes did not settle for key ${fileName}`);
  });
}

export async function getWritableDataDir(): Promise<string> {
  return getDataDirectory();
}

export async function isEphemeralDataDirActive(): Promise<boolean> {
  if (getSupabaseConfig()) {
    return false;
  }
  const dataDir = await getDataDirectory();
  return path.resolve(/* turbopackIgnore: true */ dataDir).startsWith(path.resolve(/* turbopackIgnore: true */ FALLBACK_DATA_DIR));
}
