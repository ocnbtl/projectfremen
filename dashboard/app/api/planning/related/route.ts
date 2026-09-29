import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { readPlanningState } from "../../../../lib/modules/planning/store";
import { readPersonalRecords } from "../../../../lib/personal-records-store";
import { readPersonalLifeState } from "../../../../lib/modules/personal-life/store";
import { createNativeObjectRef } from "../../../../lib/native-objects/routes";
import {
  isModuleId,
  type NativeObjectRef,
} from "../../../../lib/native-objects/types";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  if (!(await hasAdminSession()))
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers },
    );
  const q = new URL(request.url).searchParams,
    module = q.get("module"),
    id = q.get("id"),
    type = q.get("type");
  if (!module || !isModuleId(module) || !id || id.length > 240 || !type)
    return NextResponse.json(
      { error: "Choose a record" },
      { status: 400, headers },
    );
  try {
    const [planning, records, life] = await Promise.all([
      readPlanningState(),
      readPersonalRecords(),
      readPersonalLifeState(),
    ]);
    const items: { ref: NativeObjectRef; detail: string }[] = [];
    const matches = (refs: NativeObjectRef[]) =>
      refs.some(
        (r) =>
          r.module === module && r.objectId === id && r.objectType === type,
      );
    for (const p of planning.places)
      if (!p.archivedAt && matches(p.linkedRefs))
        items.push({
          ref: createNativeObjectRef({
            module: "map",
            objectType: "place",
            objectId: p.id,
            label: p.name,
          }),
          detail: p.address || "Saved place",
        });
    for (const e of planning.events)
      if (
        !e.archivedAt &&
        (matches(e.overrides?.linkedRefs || e.linkedRefs) ||
          (module === "map" && (e.overrides?.placeId || e.placeId) === id))
      )
        items.push({
          ref: createNativeObjectRef({
            module: "calendar",
            objectType: "event",
            objectId: e.id,
            label: e.overrides?.title || e.title,
          }),
          detail: `${(e.overrides?.start || e.start).replace("T", " · ")} · ${e.timeZone}`,
        });
    for (const r of records)
      if (
        r.className === "file" &&
        r.mediaProfile &&
        !r.mediaProfile.archivedAt &&
        matches(r.mediaProfile.linkedRefs)
      )
        items.push({
          ref: createNativeObjectRef({
            module: "media",
            objectType: "media_asset",
            objectId: r.id,
            label: r.title,
          }),
          detail: r.mediaProfile.manifest.mimeType,
        });
    for (const t of life.trips)
      if (module === "map" && t.stops?.some((s) => s.placeId === id))
        items.push({
          ref: createNativeObjectRef({
            module: "personal_ops",
            objectType: "trip",
            objectId: t.id,
            label: t.name,
          }),
          detail: `${t.stops.length} stops${t.startDate ? ` · ${t.startDate.slice(0, 10)}` : ""}`,
        });
    return NextResponse.json(
      { items: items.slice(0, 100), total: items.length },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "Related records could not load" },
      { status: 503, headers },
    );
  }
}
