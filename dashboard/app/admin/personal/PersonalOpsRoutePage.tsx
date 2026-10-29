import { readProjectsState } from "../../../lib/modules/projects/store";
import { projectLinkPreview } from "../../../lib/modules/projects/link-preview";
import AdminChrome from "../../../components/AdminChrome";
import PersonalOpsAdvancedWorkspace, {
  type PersonalOpsAdvancedView
} from "../../../components/personal-ops/PersonalOpsAdvancedWorkspace";
import PersonalOpsWorkspace, {
  type LegacyEntityGoalProjection,
  type PersonalOpsView
} from "../../../components/personal-ops/PersonalOpsWorkspace";
import { readEntityGoals } from "../../../lib/entity-goals-store";
import { ENTITY_HUBS } from "../../../lib/entity-hub";
import { classifyLegacyPersonalRecords } from "../../../lib/modules/personal-ops/legacy-adapter";
import { readPersonalOpsState } from "../../../lib/modules/personal-ops/store";
import {
  PERSONAL_OPS_SCHEMA_VERSION,
  type LegacyPersonalRecordDescriptor,
  type PersonalOpsState
} from "../../../lib/modules/personal-ops/types";
import { readPersonalRecords, type PersonalRecord } from "../../../lib/personal-records-store";
import { requireAdminSession } from "../../../lib/require-admin";

function emptyPersonalOpsState(): PersonalOpsState {
  return {
    schemaVersion: PERSONAL_OPS_SCHEMA_VERSION,
    goals: [],
    decisions: [],
    obligations: [],
    followUps: [],
    routines: [],
    captures: [],
    templates: [],
    auditEvents: [],
    legacyMappings: []
  };
}

function legacyDescriptor(record: PersonalRecord): LegacyPersonalRecordDescriptor {
  return {
    id: record.id,
    domain: record.domain,
    className: record.className,
    status: record.status,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export default async function PersonalOpsRoutePage({
  view
}: {
  view: PersonalOpsView | PersonalOpsAdvancedView;
}) {
  await requireAdminSession();

  if (view === "routines" || view === "inbox" || view === "templates") {
    const [nativeResult, recordsResult] = await Promise.all([
      readPersonalOpsState()
        .then((state) => ({ ok: true as const, state }))
        .catch((error: unknown) => ({
          ok: false as const,
          error: error instanceof Error ? error.message : "Personal data could not be loaded."
        })),
      view === "inbox"
        ? readPersonalRecords()
            .then((records) => ({ ok: true as const, records }))
            .catch((error: unknown) => ({
              ok: false as const,
              error: error instanceof Error ? error.message : "Legacy Personal Records could not be loaded."
            }))
        : Promise.resolve({ ok: true as const, records: [] as PersonalRecord[] })
    ]);

    const legacyCandidates = recordsResult.ok
      ? classifyLegacyPersonalRecords(recordsResult.records.map(legacyDescriptor))
      : [];
    const loadErrors = [
      nativeResult.ok ? "" : `Native Personal: ${nativeResult.error}`,
      recordsResult.ok ? "" : `Legacy source records: ${recordsResult.error}`
    ].filter(Boolean);

    return (
      <div className="shell admin-chrome-main module-ref-shell personal-ops-module-shell native-module-shell">
        <AdminChrome
          showCommandSearch={false}
          showPageSidebar={false}
          showLocalAi={false}
          sidebarTitle="Personal"
          sidebarSummary="Goals, decisions, obligations, follow-ups, routines, capture, and reusable templates."
        />
        <PersonalOpsAdvancedWorkspace
          initialState={nativeResult.ok ? nativeResult.state : emptyPersonalOpsState()}
          initialView={view}
          legacyCandidates={view === "inbox" ? legacyCandidates : []}
          initialLoadError={loadErrors.length ? loadErrors.join(" ") : undefined}
        />
      </div>
    );
  }

  const [nativeResult, recordsResult, entityGoalResults] = await Promise.all([
    readPersonalOpsState()
      .then((state) => ({ ok: true as const, state }))
      .catch((error: unknown) => ({
        ok: false as const,
        error: error instanceof Error ? error.message : "Personal data could not be loaded."
      })),
    readPersonalRecords()
      .then((records) => ({ ok: true as const, records }))
      .catch((error: unknown) => ({
        ok: false as const,
        error: error instanceof Error ? error.message : "Legacy Personal Records could not be loaded."
      })),
    Promise.all(
      ENTITY_HUBS.map(async (hub) => {
        try {
          return {
            ok: true as const,
            hub,
            goals: await readEntityGoals(hub.slug, hub.defaultGoals)
          };
        } catch (error) {
          return {
            ok: false as const,
            hub,
            error: error instanceof Error ? error.message : `${hub.heading} goals could not be loaded.`
          };
        }
      })
    )
  ]);

  // Reuse records already loaded for this page; never fetch identities per card.
  const identityRecords = recordsResult.ok ? recordsResult.records.filter(record => !record.archivedAt && !record.mediaProfile?.archivedAt) : [];
  const recordsById = new Map(identityRecords.map(record => [record.id, record]));
  const linkedPreviews: Record<string, { imageUrl?: string; imageUpdatedAt?: string; detail?: string }> = {};
  if (nativeResult.ok) {
    const linkedItems = [...nativeResult.state.goals, ...nativeResult.state.decisions, ...nativeResult.state.obligations, ...nativeResult.state.followUps, ...nativeResult.state.routines];
    const hasProjects = linkedItems.some(item => [...("sourceRefs" in item ? item.sourceRefs : []), ...item.linkedRefs].some(ref => ref.module === "projects" && ref.objectType === "project"));
    const linkedProjects = hasProjects ? await readProjectsState().then(state => new Map(state.projects.map(project => [project.id, project]))).catch(() => new Map()) : new Map();
    for (const item of linkedItems) {
      for (const ref of [...("sourceRefs" in item ? item.sourceRefs : []), ...item.linkedRefs]) {
        if (ref.module === "projects" && ref.objectType === "project") {
          linkedPreviews[`projects:project:${ref.objectId}`] = projectLinkPreview(linkedProjects.get(ref.objectId));
          continue;
        }
        const record = recordsById.get(ref.objectId);
        if (!record) continue;
        const matches = ref.module === "people" && ((ref.objectType === "person" && record.className === "person") || (ref.objectType === "organization" && record.className === "org")) || ref.module === "resources" && record.className === "resource";
        if (matches) linkedPreviews[`${ref.module}:${ref.objectType}:${ref.objectId}`] = { imageUrl:record.profile?.photoUrl || record.resourceProfile?.metadata?.imageUrl, imageUpdatedAt:record.profile?.photoUpdatedAt, detail:record.body?.slice(0, 320) };
      }
    }
  }
  const legacyGoals: LegacyEntityGoalProjection[] = entityGoalResults.flatMap((result) =>
    result.ok
      ? result.goals.map((goal, index) => ({
          id: `legacy-goal:${result.hub.slug}:${index}`,
          slug: result.hub.slug,
          entity: result.hub.entity,
          projectLabel: result.hub.projectLabel,
          text: goal.text,
          done: goal.done,
          organizationId: identityRecords.find(record => record.className === "org" && record.title.toLowerCase() === result.hub.entity.toLowerCase())?.id,
          imageUrl: identityRecords.find(record => record.className === "org" && record.title.toLowerCase() === result.hub.entity.toLowerCase())?.profile?.photoUrl,
          imageUpdatedAt: identityRecords.find(record => record.className === "org" && record.title.toLowerCase() === result.hub.entity.toLowerCase())?.profile?.photoUpdatedAt,
          index
        }))
      : []
  );

  const legacyCandidates = recordsResult.ok
    ? classifyLegacyPersonalRecords(recordsResult.records.map(legacyDescriptor))
    : [];

  const loadErrors = [
    nativeResult.ok ? "" : `Native Personal: ${nativeResult.error}`,
    recordsResult.ok ? "" : `Legacy source records: ${recordsResult.error}`,
    ...entityGoalResults.map((result) =>
      result.ok ? "" : `Current Goals (${result.hub.entity}): ${result.error}`
    )
  ].filter(Boolean);

  return (
    <div className="shell admin-chrome-main module-ref-shell personal-ops-module-shell native-module-shell">
      <AdminChrome
        showCommandSearch={false}
        showPageSidebar={false}
        showLocalAi={false}
        sidebarTitle="Personal"
        sidebarSummary="Goals, durable decisions, obligations, actionable follow-ups, and a mixed operating queue."
      />
      <PersonalOpsWorkspace
        initialState={nativeResult.ok ? nativeResult.state : emptyPersonalOpsState()}
        initialView={view}
        legacyGoals={legacyGoals}
        linkedPreviews={linkedPreviews}
        legacyCandidates={legacyCandidates}
        initialLoadError={loadErrors.length ? loadErrors.join(" ") : undefined}
      />
    </div>
  );
}
