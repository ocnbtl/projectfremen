import { createNativeObjectRef } from "../../native-objects/routes";
import type { ModuleId, NativeObjectRef } from "../../native-objects/types";
import { readPersonalRecords, readMediaFileRecords } from "../../personal-records-store";
import { readFinanceState } from "../finance/store";
import { readProjectsState } from "../projects/store";
import { readReviewsState } from "../reviews/store";
import { readPlanningState } from "../planning/store";
import { readPersonalLifeState } from "../personal-life/store";
import { readPersonalOpsState } from "../personal-ops/store";
import { taskCatalog } from "../planning/task-model";
import { isLegacyNoteRecord } from "../notes/legacy-adapter";

type Row = { id: string; archivedAt?: string; updatedAt: string };
type CatalogReads = {
  records?: ReturnType<typeof readPersonalRecords>;
  projects?: ReturnType<typeof readProjectsState>;
  planning?: ReturnType<typeof readPlanningState>;
};
export async function canvasObjectCatalog(module: ModuleId, reads?: CatalogReads): Promise<NativeObjectRef[]> {
  const rows: NativeObjectRef[] = [];
  function add(row: Row, objectType: string, label: string, containerObjectId?: string) {
    if (row.archivedAt) return;
    rows.push(createNativeObjectRef({ module, objectType, objectId:row.id, label, containerObjectId, versionId:row.updatedAt }));
  }
  if (module === "finance") {
    const state = await readFinanceState();
    const dollars = new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
    for (const t of state.transactions) add(t, "transaction", [t.merchant, t.occurredOn, dollars.format(t.amount)].join(" · "));
    for (const a of state.accounts) add(a, "account", a.name);
    for (const b of state.bills) add(b, "bill", b.name);
    for (const b of state.budgets) add(b, "budget", b.category + " · " + b.period);
    for (const r of state.rules) add(r, "finance_rule", r.name);
  } else if (module === "projects") {
    const state = await (reads?.projects ?? readProjectsState());
    const active = state.projects.filter(p => !p.archivedAt && p.lifecycle !== "archived");
    const ids = new Set(active.map(p => p.id));
    for (const p of active) add(p, "project", p.name);
    for (const m of [...state.milestones,...state.blockers]) if (ids.has(m.projectId)) add(m, m.objectType, m.title, m.projectId);
  } else if (module === "reviews") {
    for (const r of (await readReviewsState()).runs) if (r.lifecycle!=="archived") add(r, "review_run", r.title);
  } else if (module === "calendar" || module === "map") {
    const state = await (reads?.planning ?? readPlanningState());
    if (module === "map") for (const p of state.places) add(p, "place", p.name);
    else for (const e of state.events) if (!e.overrides?.cancelled && !e.source?.cancelled) add(e, "event", e.overrides?.title || e.title);
  } else if (module === "personal_ops") {
    const [ops,life,planning,projects] = await Promise.all([readPersonalOpsState(),readPersonalLifeState(),reads?.planning ?? readPlanningState(),reads?.projects ?? readProjectsState()]);
    for (const task of taskCatalog(planning.taskPlans || [],ops,projects,planning.events,"UTC")) {
      rows.push({module,objectType:task.kind,objectId:task.id,label:task.title,versionId:task.updatedAt || task.sourceUpdatedAt,
        route:"/admin/personal?task="+encodeURIComponent(task.id)});
    }
    for (const list of life.lists) add(list, "list", list.title);
    for (const trip of life.trips) add(trip, "trip", trip.name);
    for (const item of life.buildItems) add(item, "build_item", item.name);
    for (const car of life.vehicles) add(car, "vehicle", car.name);
  } else {
    for (const row of await (reads?.records ?? (module==="media" ? readMediaFileRecords() : readPersonalRecords()))) {
      if (module === "media" && row.className === "file" && !row.mediaProfile?.archivedAt) add(row, "media_asset", row.title);
      if (module === "notes" && (row.className === "note" || isLegacyNoteRecord(row)) && row.status !== "inactive") add(row, "note", row.title);
      if (module === "people" && (row.className === "person" || row.className === "org")) add(row,row.className === "org" ? "organization" : "person",row.title);
      if (module === "people" && row.className === "interaction" && !row.archivedAt) rows.push({module,objectType:"interaction",objectId:row.id,label:row.title,versionId:row.updatedAt,route:"/admin/people?sidebar=interactions&interaction="+encodeURIComponent(row.id)});
      if (module === "resources" && row.className === "resource" && !row.resourceProfile?.deletedAt) add(row, "resource", row.title);
    }
  }
  return rows.sort((a,b) => (b.versionId || "").localeCompare(a.versionId || "") || a.label.localeCompare(b.label));
}

export async function reusableCanvasFiles() {
  const records = await readMediaFileRecords();
  return records.flatMap(row => {
    const file = row.mediaProfile?.accountFile;
    if (row.className !== "file" || !file) return [];
    return [{ hash:file.sha256, archived:!!row.archivedAt || !!row.mediaProfile?.archivedAt,
      ref:createNativeObjectRef({module:"media",objectType:"media_asset",objectId:row.id,label:row.title,versionId:row.updatedAt}) }];
  });
}
