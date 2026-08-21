import AdminChrome from "../../../components/AdminChrome";
import PersonalLifeWorkspace, { type PersonalLifeView } from "../../../components/personal-ops/PersonalLifeWorkspace";
import { emptyPersonalLifeState, readPersonalLifeState } from "../../../lib/modules/personal-life/store";
import { readPersonalOpsState } from "../../../lib/modules/personal-ops/store";
import { listCredentialSummaries } from "../../../lib/modules/personal-passwords/store";
import type { CredentialSummary } from "../../../lib/modules/personal-passwords/types";
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
  const [lifeResult, opsResult, passwordsResult] = await Promise.all([
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
      : Promise.resolve({ ok: true as const, items: [] as CredentialSummary[] })
  ]);
  const errors = [lifeResult.ok ? "" : lifeResult.error, opsResult.ok ? "" : opsResult.error, passwordsResult.ok ? "" : passwordsResult.error].filter(Boolean);

  return (
    <div className="shell admin-chrome-main module-ref-shell personal-ops-module-shell native-module-shell">
      <AdminChrome showCommandSearch={false} showPageSidebar={false} showLocalAi={false} sidebarTitle="Personal Ops" sidebarSummary="Private command surfaces for lists, travel, personal gear, vehicles, and encrypted credentials." />
      <PersonalLifeWorkspace
        initialView={view}
        initialState={lifeResult.ok ? lifeResult.state : emptyPersonalLifeState()}
        personalOpsState={opsResult.ok ? opsResult.state : emptyPersonalOpsState()}
        initialCredentials={passwordsResult.ok ? passwordsResult.items : []}
        initialLoadError={errors.length ? errors.join(" ") : undefined}
      />
    </div>
  );
}
