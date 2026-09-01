import AdminChrome from "../../../components/AdminChrome";
import DogTrackerWorkspace from "../../../components/personal-ops/DogTrackerWorkspace";
import PersonalStyleGuideWorkspace from "../../../components/personal-ops/PersonalStyleGuideWorkspace";
import type { PersonalOpsSidebarCounts } from "../../../components/personal-ops/PersonalOpsSidebar";
import { readDogTrackerState, emptyDogTrackerState } from "../../../lib/modules/dog-tracker/store";
import { emptyPersonalLifeState, readPersonalLifeState } from "../../../lib/modules/personal-life/store";
import { readPersonalOpsState } from "../../../lib/modules/personal-ops/store";
import { PERSONAL_OPS_SCHEMA_VERSION, type PersonalOpsState } from "../../../lib/modules/personal-ops/types";
import { legacyPersonalRecordsToResources, resourceForClient } from "../../../lib/modules/resources/legacy-adapter";
import { defaultStyleGuideState, readStyleGuideState } from "../../../lib/modules/style-guide/store";
import { readPersonalRecords } from "../../../lib/personal-records-store";
import { requireAdminSession } from "../../../lib/require-admin";

export type PersonalUtilityView = "style-guide" | "dog";

function emptyOps(): PersonalOpsState {
  return { schemaVersion: PERSONAL_OPS_SCHEMA_VERSION, goals: [], decisions: [], obligations: [], followUps: [], routines: [], captures: [], templates: [], auditEvents: [], legacyMappings: [] };
}

function countsFor(ops: PersonalOpsState, life: Awaited<ReturnType<typeof readPersonalLifeState>>, dogCount: number, componentCount: number): PersonalOpsSidebarCounts {
  const core = [...ops.goals, ...ops.decisions, ...ops.obligations, ...ops.followUps];
  return {
    command: core.filter((item) => item.lifecycle !== "complete" && item.lifecycle !== "archived").length + ops.routines.filter((item) => item.lifecycle !== "archived").length,
    goals: ops.goals.length,
    decisions: ops.decisions.length,
    obligations: ops.obligations.length,
    followUps: ops.followUps.length,
    routines: ops.routines.length,
    captures: ops.captures.length,
    templates: ops.templates.length,
    archived: core.filter((item) => item.lifecycle === "archived").length,
    lists: life.lists.length,
    travel: life.trips.length,
    personalBuild: life.buildItems.length,
    car: life.vehicles.length,
    styleGuide: componentCount,
    dog: dogCount
  };
}

export default async function PersonalUtilityRoutePage({ view }: { view: PersonalUtilityView }) {
  await requireAdminSession();
  const [opsResult, lifeResult, styleResult, dogResult, recordsResult] = await Promise.all([
    readPersonalOpsState().then((state) => ({ ok: true as const, state })).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : "Personal could not be loaded." })),
    readPersonalLifeState().then((state) => ({ ok: true as const, state })).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : "Personal systems could not be loaded." })),
    view === "style-guide" ? readStyleGuideState().then((state) => ({ ok: true as const, state })).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : "Style Guide could not be loaded." })) : Promise.resolve({ ok: true as const, state: defaultStyleGuideState() }),
    readDogTrackerState().then((state) => ({ ok: true as const, state })).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : "Dog care could not be loaded." })),
    view === "style-guide" ? readPersonalRecords().then((records) => ({ ok: true as const, records })).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : "Resources could not be loaded." })) : Promise.resolve({ ok: true as const, records: [] })
  ]);

  const ops = opsResult.ok ? opsResult.state : emptyOps();
  const life = lifeResult.ok ? lifeResult.state : emptyPersonalLifeState();
  const resources = recordsResult.ok ? legacyPersonalRecordsToResources(recordsResult.records).map(resourceForClient) : [];
  const style = styleResult.ok ? styleResult.state : defaultStyleGuideState();
  const dog = dogResult.ok ? dogResult.state : emptyDogTrackerState();
  const counts = countsFor(ops, life, dog.events.length, resources.filter((item) => item.provenance.areas.some((area) => area.toLowerCase() === "style guide")).length);
  const errors = [opsResult.ok ? "" : opsResult.error, lifeResult.ok ? "" : lifeResult.error, styleResult.ok ? "" : styleResult.error, dogResult.ok ? "" : dogResult.error, recordsResult.ok ? "" : recordsResult.error].filter(Boolean).join(" ");

  return (
    <div className="shell admin-chrome-main module-ref-shell personal-ops-module-shell native-module-shell">
      <AdminChrome showCommandSearch={false} showPageSidebar={false} sidebarTitle="Personal" sidebarSummary="Private command surfaces and personal systems." />
      {view === "style-guide" ? (
        <PersonalStyleGuideWorkspace initialState={style} initialResources={resources} sidebarCounts={counts} initialLoadError={errors || undefined} />
      ) : (
        <DogTrackerWorkspace initialState={dog} sidebarCounts={counts} initialLoadError={errors || undefined} />
      )}
    </div>
  );
}
