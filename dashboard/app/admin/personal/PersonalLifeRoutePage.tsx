import AdminChrome from "../../../components/AdminChrome";
import PersonalLifeWorkspace, { type PersonalLifeLinkOption, type PersonalLifeView } from "../../../components/personal-ops/PersonalLifeWorkspace";
import { createNativeObjectRef } from "../../../lib/native-objects/routes";
import { emptyPersonalLifeState, readPersonalLifeState } from "../../../lib/modules/personal-life/store";
import { readPersonalOpsState } from "../../../lib/modules/personal-ops/store";
import { listCredentialSummaries } from "../../../lib/modules/personal-passwords/store";
import type { CredentialSummary } from "../../../lib/modules/personal-passwords/types";
import { readPersonalRecords } from "../../../lib/personal-records-store";
import { PERSONAL_OPS_SCHEMA_VERSION, type PersonalOpsState } from "../../../lib/modules/personal-ops/types";
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
export default async function PersonalLifeRoutePage({ view }: { view: PersonalLifeView }) {
  await requireAdminSession();
  const [lifeResult, opsResult, passwordsResult, recordsResult] = await Promise.all([
    readPersonalLifeState()
      .then((state) => ({ ok: true as const, state }))
      .catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : "Personal systems could not be loaded." })),
    readPersonalOpsState()
      .then((state) => ({ ok: true as const, state }))
      .catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : "Personal Ops could not be loaded." })),
    view === "passwords"
      ? listCredentialSummaries()
          .then((items) => ({ ok: true as const, items }))
          .catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : "Encrypted credentials could not be loaded." }))
      : Promise.resolve({ ok: true as const, items: [] as CredentialSummary[] }),
    view === "lists"
      ? readPersonalRecords()
          .then((records) => ({ ok: true as const, records }))
          .catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : "Linkable records could not be loaded." }))
      : Promise.resolve({ ok: true as const, records: [] })
  ]);
  const errors = [lifeResult.ok ? "" : lifeResult.error, opsResult.ok ? "" : opsResult.error, passwordsResult.ok ? "" : passwordsResult.error, recordsResult.ok ? "" : recordsResult.error].filter(Boolean);
  const linkOptions: PersonalLifeLinkOption[] = recordsResult.ok
    ? recordsResult.records.flatMap((record): PersonalLifeLinkOption[] => {
        if (record.archivedAt) return [];
        if (record.className === "person") {
          return [{ kind: "person", ref: createNativeObjectRef({ module: "people", objectType: "person", objectId: record.id, label: record.profile?.fullName || record.title }) }];
        }
        if (record.className === "note") {
          return [{ kind: "object", ref: createNativeObjectRef({ module: "notes", objectType: "note", objectId: record.id, label: record.title }) }];
        }
        if (record.className === "resource") {
          return [{ kind: "object", ref: createNativeObjectRef({ module: "resources", objectType: "resource", objectId: record.id, label: record.title }) }];
        }
        if (record.className === "file") {
          return [{ kind: "object", ref: createNativeObjectRef({ module: "media", objectType: "media_asset", objectId: record.id, label: record.title }) }];
        }
        return [];
      }).sort((left, right) => left.ref.label.localeCompare(right.ref.label))
    : [];

  return (
    <div className="shell admin-chrome-main module-ref-shell personal-ops-module-shell native-module-shell">
      <AdminChrome showCommandSearch={false} showPageSidebar={false} showLocalAi={false} sidebarTitle="Personal Ops" sidebarSummary="Private command surfaces for lists, travel, personal gear, vehicles, and encrypted credentials." />
      <PersonalLifeWorkspace
        initialView={view}
        initialState={lifeResult.ok ? lifeResult.state : emptyPersonalLifeState()}
        personalOpsState={opsResult.ok ? opsResult.state : emptyPersonalOpsState()}
        initialCredentials={passwordsResult.ok ? passwordsResult.items : []}
        initialLinkOptions={linkOptions}
        initialLoadError={errors.length ? errors.join(" ") : undefined}
      />
    </div>
  );
}
