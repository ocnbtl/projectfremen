import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { readFinanceState } from "../../../../lib/modules/finance/store";
import { readPersonalOpsState } from "../../../../lib/modules/personal-ops/store";
import { readProjectsState } from "../../../../lib/modules/projects/store";
import { readReviewsState } from "../../../../lib/modules/reviews/store";
import type { VaultFieldValue, VaultObjectKind } from "../../../../lib/local-first/types";
import { readPersonalRecords } from "../../../../lib/personal-records-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BootstrapObject = {
  canonicalId: string;
  objectKind: VaultObjectKind;
  fields: Record<string, VaultFieldValue>;
};

function jsonRecord(value: unknown): Record<string, VaultFieldValue> {
  const source = JSON.parse(JSON.stringify(value)) as Record<string, VaultFieldValue>;
  const flattened: Record<string, VaultFieldValue> = {};
  const visit = (prefix: string, current: VaultFieldValue) => {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      for (const [key, nested] of Object.entries(current)) visit(prefix ? `${prefix}.${key}` : key, nested);
      return;
    }
    if (prefix) flattened[prefix] = current;
  };
  for (const [key, current] of Object.entries(source)) visit(key, current);
  return flattened;
}

function collectState(prefix: string, objectKind: VaultObjectKind, state: Record<string, unknown>, excluded: ReadonlySet<string> = new Set()): BootstrapObject[] {
  const objects: BootstrapObject[] = [];
  for (const [collection, value] of Object.entries(state)) {
    if (excluded.has(collection)) continue;
    if (Array.isArray(value)) {
      for (const [index, row] of value.entries()) {
        if (!row || typeof row !== "object" || Array.isArray(row)) continue;
        const record = row as Record<string, unknown>;
        const sourceId = typeof record.id === "string" && record.id ? record.id : String(index);
        objects.push({
          canonicalId: `${prefix}:${collection}:${sourceId}`,
          objectKind,
          fields: { sourceModule: prefix, sourceCollection: collection, ...jsonRecord(record) }
        });
      }
      continue;
    }
    if (value && typeof value === "object") {
      objects.push({
        canonicalId: `${prefix}:${collection}`,
        objectKind,
        fields: { sourceModule: prefix, sourceCollection: collection, ...jsonRecord(value) }
      });
    }
  }
  return objects;
}

export async function GET() {
  if (!await hasAdminSession()) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [personalRecords, personalOps, projects, reviews, finance] = await Promise.all([
      readPersonalRecords(),
      readPersonalOpsState(),
      readProjectsState(),
      readReviewsState(),
      readFinanceState()
    ]);
    const personalObjects: BootstrapObject[] = personalRecords.map((record) => ({
      canonicalId: `personal-records:${record.className}:${record.id}`,
      objectKind: record.className === "person" || record.className === "org" ? "contact"
        : record.className === "resource" ? "resource"
          : record.className === "file" ? "media"
            : record.className === "note" ? "note" : "other",
      fields: { sourceModule: "personal-records", ...jsonRecord(record) }
    }));
    const objects = [
      ...personalObjects,
      ...collectState("personal-ops", "personal_ops", personalOps as unknown as Record<string, unknown>),
      ...collectState("projects", "project", projects as unknown as Record<string, unknown>),
      ...collectState("reviews", "review", reviews as unknown as Record<string, unknown>),
      ...collectState("finance", "finance", finance as unknown as Record<string, unknown>, new Set(["importPreviews"]))
    ];
    return NextResponse.json({ ok: true, objects, generatedAt: new Date().toISOString() }, {
      headers: { "Cache-Control": "no-store, private", Date: new Date().toUTCString() }
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Encrypted vault bootstrap is unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store, private" }
    });
  }
}
