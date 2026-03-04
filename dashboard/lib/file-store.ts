import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const STATIC_DATA_DIR = path.join(process.cwd(), "data");
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

let supabaseConfigWarningShown = false;

async function canWriteDirectory(dir: string): Promise<boolean> {
  try {
    await mkdir(dir, { recursive: true });
    await access(dir, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveDataDirectory(): Promise<string> {
  const configured = process.env.FREMEN_DATA_DIR?.trim();
  if (configured) {
    await mkdir(configured, { recursive: true });
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

  await mkdir(FALLBACK_DATA_DIR, { recursive: true });
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

async function withWriteLock(fileName: string, task: () => Promise<void>): Promise<void> {
  const previous = writeQueues.get(fileName) || Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  writeQueues.set(fileName, next);

  try {
    await next;
  } finally {
    if (writeQueues.get(fileName) === next) {
      writeQueues.delete(fileName);
    }
  }
}

async function tryReadJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf8");
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

async function readJsonFromSupabase<T>(fileName: string, config: SupabaseConfig): Promise<T | null> {
  const query = new URLSearchParams({
    select: "value",
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

  const rows = (await response.json().catch(() => [])) as Array<{ value?: unknown }>;
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return (rows[0]?.value as T | undefined) ?? null;
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

    const staticPath = path.join(STATIC_DATA_DIR, fileName);
    const staticValue = await tryReadJsonFile<T>(staticPath);
    if (staticValue !== null) {
      await writeJsonToSupabase(fileName, staticValue, supabase);
      return staticValue;
    }

    return fallback;
  }

  const dataDir = await getDataDirectory();
  const preferredPath = path.join(dataDir, fileName);
  const preferredValue = await tryReadJsonFile<T>(preferredPath);
  if (preferredValue !== null) {
    return preferredValue;
  }

  if (dataDir !== STATIC_DATA_DIR) {
    const staticPath = path.join(STATIC_DATA_DIR, fileName);
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
    await mkdir(dataDir, { recursive: true });
    const filePath = path.join(dataDir, fileName);
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await writeFile(tmpPath, JSON.stringify(value, null, 2) + "\n", "utf8");
    await rename(tmpPath, filePath);
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
  return path.resolve(dataDir).startsWith(path.resolve(FALLBACK_DATA_DIR));
}
