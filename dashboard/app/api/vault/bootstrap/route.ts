import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import {
  canonicalVaultFields,
  objectKindForPersonalCollection,
  VAULT_CANONICAL_RELATIONSHIPS_FIELD,
  type VaultCanonicalRelationship,
  type CanonicalModule
} from "../../../../lib/local-first/canonical-record";
import type { VaultObjectKind } from "../../../../lib/local-first/types";
import { readFinanceState } from "../../../../lib/modules/finance/store";
import { readPersonalOpsState } from "../../../../lib/modules/personal-ops/store";
import { readProjectsState } from "../../../../lib/modules/projects/store";
import { readReviewsState } from "../../../../lib/modules/reviews/store";
import { readNoteLinksState } from "../../../../lib/modules/notes/links-store";
import type { NoteLink } from "../../../../lib/modules/notes/links-types";
import { readPersonalRecords } from "../../../../lib/personal-records-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BootstrapObject = {
  canonicalId: string;
  objectKind: VaultObjectKind;
  fields: ReturnType<typeof canonicalVaultFields>;
};

const COLLECTIONS = {
  "personal-ops": ["goals", "decisions", "obligations", "followUps", "routines", "captures", "templates"],
  projects: ["projects", "milestones", "blockers", "links"],
  reviews: ["runs"],
  finance: ["accounts", "transactions", "transfers", "savingsMovements", "bills", "budgets", "closePeriods", "rules", "importBatches"]
} as const satisfies Record<Exclude<CanonicalModule, "personal-records">, readonly string[]>;

function collectState(
  module: Exclude<CanonicalModule, "personal-records">,
  objectKind: VaultObjectKind,
  state: Record<string, unknown>,
  collections: readonly string[]
): BootstrapObject[] {
  const objects: BootstrapObject[] = [];
  for (const collection of collections) {
    const value = state[collection];
    if (!Array.isArray(value)) continue;
    for (const row of value) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const record = row as Record<string, unknown>;
      const recordId = typeof record.id === "string" ? record.id : "";
      if (!recordId) continue;
      objects.push({
        canonicalId: `${module}:${collection}:${recordId}`,
        objectKind,
        fields: canonicalVaultFields({ module, collection, record })
      });
    }
  }
  return objects;
}

function noteTargetCanonicalId(link: NoteLink): string | null {
  if (link.targetRef.module === "resources" && link.targetRef.objectType === "resource") {
    return `personal-records:resource:${link.targetRef.objectId}`;
  }
  if (link.targetRef.module === "media" && link.targetRef.objectType === "media_asset") {
    return `personal-records:file:${link.targetRef.objectId}`;
  }
  return null;
}

function attachNoteRelationships(objects: BootstrapObject[], links: readonly NoteLink[]): BootstrapObject[] {
  const relationships = new Map<string, VaultCanonicalRelationship[]>();
  const append = (canonicalId: string, relationship: VaultCanonicalRelationship) => {
    relationships.set(canonicalId, [...(relationships.get(canonicalId) || []), relationship]);
  };
  for (const link of links) {
    if (link.state === "removed") continue;
    const noteCanonicalId = `personal-records:note:${link.noteRef.objectId}`;
    const targetCanonicalId = noteTargetCanonicalId(link);
    if (!targetCanonicalId) continue;
    append(noteCanonicalId, {
      linkId: link.id,
      targetCanonicalId,
      targetLabel: link.lastKnownTargetLabel || link.targetRef.label,
      relationship: link.relationship,
      direction: "outgoing",
      state: link.state
    });
    append(targetCanonicalId, {
      linkId: link.id,
      targetCanonicalId: noteCanonicalId,
      targetLabel: link.noteRef.label,
      relationship: link.relationship,
      direction: "incoming",
      state: link.state
    });
  }
  return objects.map((item) => {
    const savedRelationships = relationships.get(item.canonicalId);
    return savedRelationships
      ? { ...item, fields: { ...item.fields, [VAULT_CANONICAL_RELATIONSHIPS_FIELD]: savedRelationships as unknown as ReturnType<typeof canonicalVaultFields>[string] } }
      : item;
  });
}

export async function GET() {
  if (!await hasAdminSession()) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [personalRecords, personalOps, projects, reviews, finance, noteLinks] = await Promise.all([
      readPersonalRecords(),
      readPersonalOpsState(),
      readProjectsState(),
      readReviewsState(),
      readFinanceState(),
      readNoteLinksState()
    ]);
    const personalObjects: BootstrapObject[] = personalRecords.map((record) => ({
      canonicalId: `personal-records:${record.className}:${record.id}`,
      objectKind: objectKindForPersonalCollection(record.className),
      fields: canonicalVaultFields({
        module: "personal-records",
        collection: record.className,
        record: record as unknown as Record<string, unknown>
      })
    }));
    const objects = attachNoteRelationships([
      ...personalObjects,
      ...collectState("personal-ops", "personal_ops", personalOps as unknown as Record<string, unknown>, COLLECTIONS["personal-ops"]),
      ...collectState("projects", "project", projects as unknown as Record<string, unknown>, COLLECTIONS.projects),
      ...collectState("reviews", "review", reviews as unknown as Record<string, unknown>, COLLECTIONS.reviews),
      ...collectState("finance", "finance", finance as unknown as Record<string, unknown>, COLLECTIONS.finance)
    ], noteLinks.links);
    return NextResponse.json({ ok: true, objects, generatedAt: new Date().toISOString() }, {
      headers: { "Cache-Control": "no-store, private", Date: new Date().toUTCString() }
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Encrypted vault workspace is unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store, private" }
    });
  }
}
