import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const STATIC_DATA_DIR = path.join(process.cwd(), "data");
const FALLBACK_DATA_DIR = path.join("/tmp", "project-fremen-data");
let resolvedDataDirPromise: Promise<string> | null = null;

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

  await mkdir(FALLBACK_DATA_DIR, { recursive: true });
  return FALLBACK_DATA_DIR;
}

async function getDataDirectory(): Promise<string> {
  if (!resolvedDataDirPromise) {
    resolvedDataDirPromise = resolveDataDirectory();
  }
  return resolvedDataDirPromise;
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
        await writeFile(preferredPath, JSON.stringify(staticValue, null, 2) + "\n", "utf8");
      } catch {
        // Non-fatal: request should continue even if cache seeding fails.
      }
      return staticValue;
    }
  }

  return fallback;
}

export async function writeJsonFile<T>(fileName: string, value: T): Promise<void> {
  const dataDir = await getDataDirectory();
  await mkdir(dataDir, { recursive: true });
  const filePath = path.join(dataDir, fileName);
  await writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export async function getWritableDataDir(): Promise<string> {
  return getDataDirectory();
}
