import { mutateJsonFile, readJsonFile } from "../file-store";
import {
  createObjectLink,
  isUsableObjectLink,
  markObjectLinkRemoved,
  sameLinkIdentity,
  type ObjectLink
} from "./links";
import { isModuleId, type NativeObjectRef } from "./types";

const FILE_NAME = "native-object-links.json";
const SCHEMA_VERSION = 1 as const;

type NativeObjectLinksState = {
  schemaVersion: typeof SCHEMA_VERSION;
  links: ObjectLink[];
};

const EMPTY_STATE: NativeObjectLinksState = {
  schemaVersion: SCHEMA_VERSION,
  links: []
};

function text(value: unknown, field: string, maximum = 500): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result) throw new Error(`${field} is required`);
  if (result.length > maximum) throw new Error(`${field} is too long`);
  return result;
}

function reference(value: unknown, field: string): NativeObjectRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object reference`);
  }
  const input = value as Record<string, unknown>;
  const module = text(input.module, `${field}.module`, 60);
  if (!isModuleId(module)) throw new Error(`${field}.module is not supported`);
  const route = text(input.route, `${field}.route`, 600);
  if (!route.startsWith("/admin/")) throw new Error(`${field}.route must stay inside the admin application`);
  return {
    module,
    objectType: text(input.objectType, `${field}.objectType`, 100),
    objectId: text(input.objectId, `${field}.objectId`, 220),
    ...(typeof input.containerObjectId === "string" && input.containerObjectId.trim()
      ? { containerObjectId: text(input.containerObjectId, `${field}.containerObjectId`, 220) }
      : {}),
    label: text(input.label, `${field}.label`, 300),
    route,
    ...(typeof input.versionId === "string" && input.versionId.trim()
      ? { versionId: text(input.versionId, `${field}.versionId`, 220) }
      : {})
  };
}

function normalizedState(value: unknown): NativeObjectLinksState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_STATE;
  const candidate = value as Partial<NativeObjectLinksState>;
  return {
    schemaVersion: SCHEMA_VERSION,
    links: Array.isArray(candidate.links)
      ? candidate.links.filter((link): link is ObjectLink => Boolean(
          link &&
          typeof link === "object" &&
          typeof link.id === "string" &&
          typeof link.relationship === "string" &&
          typeof link.status === "string" &&
          link.source &&
          link.target
        ))
      : []
  };
}

export async function readNativeObjectLinks(): Promise<ObjectLink[]> {
  return normalizedState(await readJsonFile<NativeObjectLinksState>(FILE_NAME, EMPTY_STATE)).links;
}

export async function createNativeObjectRelationship(input: {
  source: NativeObjectRef;
  target: NativeObjectRef;
  relationship?: string;
  actorId?: string;
}): Promise<{ item: ObjectLink; created: boolean }> {
  const source = reference(input.source, "source");
  const target = reference(input.target, "target");
  if (
    source.module === target.module &&
    source.objectType === target.objectType &&
    source.objectId === target.objectId
  ) {
    throw new Error("An object cannot be linked to itself");
  }
  const relationship = input.relationship?.trim() || "related";
  const actorId = input.actorId?.trim() || "admin";

  return mutateJsonFile<NativeObjectLinksState, { item: ObjectLink; created: boolean }>(
    FILE_NAME,
    EMPTY_STATE,
    (raw) => {
      const state = normalizedState(raw);
      const existing = state.links.find((link) => isUsableObjectLink(link) && sameLinkIdentity(link, {
        source,
        target,
        relationship
      }));
      if (existing) return { value: state, result: { item: existing, created: false }, changed: false };
      const now = new Date().toISOString();
      const item = createObjectLink({
        id: crypto.randomUUID(),
        source,
        target,
        relationship,
        provenance: "manual",
        createdAt: now,
        createdBy: actorId,
        updatedAt: now,
        updatedBy: actorId
      });
      return {
        value: { ...state, links: [...state.links, item] },
        result: { item, created: true }
      };
    }
  );
}

export async function removeNativeObjectRelationship(input: {
  id: string;
  reason?: string;
  actorId?: string;
}): Promise<ObjectLink> {
  const id = text(input.id, "id", 220);
  const actorId = input.actorId?.trim() || "admin";
  return mutateJsonFile<NativeObjectLinksState, ObjectLink>(FILE_NAME, EMPTY_STATE, (raw) => {
    const state = normalizedState(raw);
    const current = state.links.find((link) => link.id === id);
    if (!current) throw new Error("That object link no longer exists");
    if (!isUsableObjectLink(current)) return { value: state, result: current, changed: false };
    const removed = markObjectLinkRemoved(current, {
      removedAt: new Date().toISOString(),
      removedBy: actorId
    });
    return {
      value: {
        ...state,
        links: state.links.map((link) => link.id === id ? removed : link)
      },
      result: removed
    };
  });
}
