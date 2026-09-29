"use client";
import { buildJsonHeadersWithCsrf } from "../../client-csrf";
import type { NativeObjectRef } from "../../native-objects/types";
import {
  browserVault,
  deterministicVaultObjectId,
} from "../../local-first/browser-engine";
import {
  canonicalVaultFields,
  pendingCanonicalCommands,
  pendingCommandField,
  readCanonicalMetadata,
  type VaultPendingCanonicalCommand,
} from "../../local-first/canonical-record";
import type { VaultFieldValue } from "../../local-first/types";
import { mirrorCanonicalRecord } from "../../local-first/domain-mirror";
import {
  normalizeTrip,
  TRIP_WRITABLE_KEYS,
} from "../personal-life/trip-schema";
import type { PersonalTrip } from "../personal-life/types";
import { planningOwner, planningWritableKeys } from "./ownership";
import { normalizePlanningRecord } from "./record-validation";
import {
  PLANNING_COLLECTIONS,
  type PlanningCollection,
  type PlanningCollections,
  type PlanningState,
} from "./types";

export type PlanningSnapshot = {
  state: PlanningState;
  refs: NativeObjectRef[];
  trips: PersonalTrip[];
  dated: {
    id: string;
    title: string;
    start: string;
    end: string;
    ownerRef?: NativeObjectRef;
  }[];
  sourceErrors: string[];
  capabilities: { morgen: boolean; routing: boolean; census?: boolean };
  persistence?: "server" | "device";
};
const CACHE = "planning:encrypted-workspace-cache";
const asValue = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as VaultFieldValue;
async function cacheSnapshot(snapshot: PlanningSnapshot) {
  if (!browserVault.isUnlocked()) return;
  await browserVault.saveObject({
    objectId: await deterministicVaultObjectId(CACHE),
    objectKind: "settings",
    fields: {
      title: "Planning offline cache",
      planningSnapshot: asValue(snapshot),
    },
  });
}
async function readCached(): Promise<PlanningSnapshot | null> {
  if (!browserVault.isUnlocked()) return null;
  const cached = await browserVault.readObject(
    await deterministicVaultObjectId(CACHE),
  );
  return (
    (cached?.fields.planningSnapshot as unknown as PlanningSnapshot) || null
  );
}
async function retainPending(
  snapshot: PlanningSnapshot,
): Promise<PlanningSnapshot> {
  if (!browserVault.isUnlocked()) return snapshot;
  for (const object of await browserVault.listObjects([
    "other",
    "personal_ops",
  ])) {
    const metadata = readCanonicalMetadata(object.fields);
    if (
      metadata?.module === "personal-life" &&
      metadata.collection === "trips" &&
      object.fields.__planningTrip &&
      pendingCanonicalCommands(object).length
    ) {
      replaceTrip(
        snapshot,
        object.fields.__planningTrip as unknown as PersonalTrip,
      );
      snapshot.persistence = "device";
      continue;
    }
    if (
      !metadata ||
      !["map", "calendar"].includes(metadata.module) ||
      !pendingCanonicalCommands(object).length
    )
      continue;
    const collection = metadata.collection as PlanningCollection,
      local = object.fields.__planningRecord;
    if (
      !PLANNING_COLLECTIONS.includes(collection) ||
      !local ||
      typeof local !== "object"
    )
      continue;
    const rows = snapshot.state[collection] as unknown as { id: string }[];
    const index = rows.findIndex((item) => item.id === metadata.recordId);
    if (index >= 0) rows[index] = local as { id: string };
    else rows.push(local as { id: string });
    snapshot.persistence = "device";
  }
  return snapshot;
}
export async function planningRequest<T>(
  input?: Record<string, unknown>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      "/api/planning",
      input
        ? {
            method: "POST",
            headers: buildJsonHeadersWithCsrf(),
            body: JSON.stringify(input),
          }
        : { cache: "no-store" },
    );
  } catch (error) {
    if (!input) {
      const cached = await readCached();
      if (cached) return { ...cached, persistence: "device" } as T;
    }
    throw error;
  }
  const body = await response.json();
  if (!response.ok || !body.ok)
    throw Object.assign(
      new Error(body.error || "Planning data could not be loaded"),
      { status: response.status },
    );
  if (input) {
    window.dispatchEvent(new Event("unigentamos-planning-changed"));
    return body.item as T;
  }
  const snapshot = await retainPending({ ...body, persistence: "server" });
  try {
    await cacheSnapshot(snapshot);
  } catch {
    window.dispatchEvent(new Event("unigentamos-vault-cache-error"));
  }
  return snapshot as T;
}
export async function savePlanning<K extends PlanningCollection>(
  collection: K,
  input: Partial<PlanningCollections[K]>,
  expectedUpdatedAt?: string,
  options: Record<string, unknown> = {},
  normalize: typeof normalizePlanningRecord = normalizePlanningRecord,
): Promise<PlanningCollections[K]> {
  try {
    const item = await planningRequest<PlanningCollections[K]>({
      operation: "save",
      collection,
      input,
      expectedUpdatedAt,
      ...options,
    });
    await mirrorCanonicalRecord(
      planningOwner(collection),
      collection,
      "other",
      item as unknown as Record<string, unknown>,
    );
    return item;
  } catch (error) {
    // Only transport failures qualify. Authorization and concurrency errors retain the draft.
    if (
      !(error instanceof TypeError) ||
      !browserVault.isUnlocked() ||
      Object.keys(options).length
    )
      throw error;
    const cached = await readCached();
    if (!cached)
      throw new Error(
        "Open this workspace online with Vault unlocked before editing offline.",
      );
    const id = input.id || crypto.randomUUID(),
      previous = cached.state[collection].find((item) => item.id === id);
    if (previous && expectedUpdatedAt !== previous.updatedAt)
      throw new Error(
        "This draft has an older version. Refresh it before saving offline.",
      );
    const stamp = new Date().toISOString();
    const item = normalize(collection, {
      ...previous,
      ...input,
      id,
      createdAt: previous?.createdAt || stamp,
      updatedAt: stamp,
    });
    const module = planningOwner(collection),
      canonicalId = `${module}:${collection}:${id}`,
      objectId = await deterministicVaultObjectId(canonicalId);
    const object = await browserVault.readObject(objectId),
      earlier = object
        ? pendingCanonicalCommands(object).at(-1)?.command
        : undefined;
    const keys = planningWritableKeys(collection),
      base = previous as unknown as Record<string, VaultFieldValue> | undefined;
    const patch = Object.fromEntries(
      Object.entries(input).filter(
        ([key, value]) => keys.includes(key) && value !== undefined,
      ),
    ) as Record<string, VaultFieldValue>;
    const command: VaultPendingCanonicalCommand = {
      format: "unigentamos-canonical-command-v1",
      commandId: earlier?.commandId || crypto.randomUUID(),
      operation: earlier?.operation || (previous ? "update" : "create"),
      canonicalId,
      baseUpdatedAt: earlier?.baseUpdatedAt ?? previous?.updatedAt ?? null,
      baseFields:
        earlier?.baseFields ||
        Object.fromEntries(keys.map((key) => [key, base?.[key] ?? null])),
      patch: { ...earlier?.patch, ...patch },
      queuedAt: stamp,
    };
    await browserVault.saveObject({
      objectId,
      objectKind: "other",
      fields: {
        ...canonicalVaultFields({
          module,
          collection,
          record: item as unknown as Record<string, unknown>,
        }),
        __planningRecord: asValue(item),
        [pendingCommandField(command.commandId)]: asValue(command),
      },
    });
    const rows = cached.state[collection] as unknown as { id: string }[],
      index = rows.findIndex((row) => row.id === id);
    if (index >= 0) rows[index] = item;
    else rows.push(item);
    cached.persistence = "device";
    await cacheSnapshot(cached);
    return item;
  }
}

function replaceTrip(snapshot: PlanningSnapshot, trip: PersonalTrip) {
  snapshot.trips = snapshot.trips.filter((t) => t.id !== trip.id).concat(trip);
  const dated = snapshot.dated.find((d) => d.id === `trip-${trip.id}`);
  snapshot.dated = snapshot.dated.filter((d) => d.id !== `trip-${trip.id}`);
  if (trip.startDate) {
    const end = new Date(
      `${(trip.endDate || trip.startDate).slice(0, 10)}T12:00:00Z`,
    );
    end.setUTCDate(end.getUTCDate() + 1);
    snapshot.dated.push({
      id: `trip-${trip.id}`,
      title: trip.name,
      start: trip.startDate.slice(0, 10),
      end: end.toISOString().slice(0, 10),
      ownerRef: dated?.ownerRef,
    });
  }
}
export async function savePlanningTrip(
  input: Partial<PersonalTrip>,
): Promise<PersonalTrip> {
  try {
    const response = await fetch("/api/personal/life", {
      method: input.id ? "PATCH" : "POST",
      headers: buildJsonHeadersWithCsrf(),
      body: JSON.stringify(
        input.id
          ? {
              collection: "trips",
              id: input.id,
              expectedUpdatedAt: input.updatedAt,
              patch: input,
            }
          : { collection: "trips", input },
      ),
    });
    const result = await response.json();
    if (!response.ok)
      throw Object.assign(
        new Error(result.error || "Trip could not be saved"),
        { status: response.status },
      );
    await mirrorCanonicalRecord(
      "personal-life",
      "trips",
      "personal_ops",
      result.item,
    );
    window.dispatchEvent(new Event("unigentamos-planning-changed"));
    return result.item;
  } catch (error) {
    if (!(error instanceof TypeError) || !browserVault.isUnlocked())
      throw error;
    const cached = await readCached();
    if (!cached)
      throw new Error(
        "Open Map online with Vault unlocked before editing trips offline.",
      );
    const previous = cached.trips.find((t) => t.id === input.id);
    if (previous && previous.updatedAt !== input.updatedAt)
      throw new Error(
        "This trip has changed. Reopen it before saving; your draft is still available.",
      );
    const stamp = new Date().toISOString(),
      trip = normalizeTrip(
        {
          ...previous,
          ...input,
          id: input.id || crypto.randomUUID(),
          createdAt: previous?.createdAt || stamp,
          updatedAt: stamp,
        },
        stamp,
      );
    const canonicalId = `personal-life:trips:${trip.id}`,
      objectId = await deterministicVaultObjectId(canonicalId),
      object = await browserVault.readObject(objectId),
      earlier = object
        ? pendingCanonicalCommands(object).at(-1)?.command
        : undefined;
    const patch = Object.fromEntries(
      Object.entries(trip).filter(([key]) => TRIP_WRITABLE_KEYS.includes(key)),
    ) as Record<string, VaultFieldValue>;
    const command: VaultPendingCanonicalCommand = {
      format: "unigentamos-canonical-command-v1",
      operation: earlier?.operation || (previous ? "update" : "create"),
      commandId: earlier?.commandId || crypto.randomUUID(),
      canonicalId,
      baseUpdatedAt: earlier?.baseUpdatedAt ?? previous?.updatedAt ?? null,
      baseFields:
        earlier?.baseFields ||
        Object.fromEntries(
          TRIP_WRITABLE_KEYS.map((key) => [
            key,
            (previous as unknown as Record<string, VaultFieldValue>)?.[key] ??
              null,
          ]),
        ),
      patch: { ...earlier?.patch, ...patch },
      queuedAt: stamp,
    };
    await browserVault.saveObject({
      objectId,
      objectKind: "personal_ops",
      fields: {
        ...canonicalVaultFields({
          module: "personal-life",
          collection: "trips",
          record: trip as unknown as Record<string, unknown>,
        }),
        __planningTrip: asValue(trip),
        [pendingCommandField(command.commandId)]: asValue(command),
      },
    });
    replaceTrip(cached, trip);
    cached.persistence = "device";
    await cacheSnapshot(cached);
    return trip;
  }
}
