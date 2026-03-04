import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const STATIC_DATA_DIR = path.join(process.cwd(), "data");
const FALLBACK_DATA_DIR = path.join("/tmp", "project-fremen-data");
const REQUIRE_PERSISTENT_DATA =
  process.env.FREMEN_REQUIRE_PERSISTENT_DATA?.trim().toLowerCase() === "true";
let resolvedDataDirPromise: Promise<string> | null = null;
const writeQueues = new Map<string, Promise<void>>();
let ephemeralWarningShown = false;

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

export async function readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
  const pendingWrite = getPendingWrite(fileName);
  if (pendingWrite) {
    await pendingWrite.catch(() => undefined);
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
  const dataDir = await getDataDirectory();
  return path.resolve(dataDir).startsWith(path.resolve(FALLBACK_DATA_DIR));
}
