import AdminChrome from "../../../components/AdminChrome";
import FinanceWorkspace from "../../../components/FinanceWorkspace";
import { readPersonalOpsState } from "../../../lib/modules/personal-ops/store";
import type { FinanceView } from "../../../lib/native-objects/url-state";
import { requireAdminSession } from "../../../lib/require-admin";

export default async function FinanceRoutePage({
  initialView
}: {
  initialView?: FinanceView;
}) {
  await requireAdminSession();
  const personalOpsResult = await readPersonalOpsState()
    .then((state) => ({ ok: true as const, state }))
    .catch((error: unknown) => ({
      ok: false as const,
      error: error instanceof Error ? error.message : "Personal Ops Decisions could not be loaded."
    }));

  return (
    <div className="shell admin-chrome-main module-ref-shell finance-workspace-shell native-module-shell">
      <AdminChrome
        sidebarTitle="Finance"
        sidebarSummary="Accounts, transactions, bills, budgets, and the Finance-owned monthly close."
        showCommandSearch={false}
        showPageSidebar={false}
        showLocalAi={false}
      />
      <FinanceWorkspace
        initialView={initialView}
        initialPersonalOpsDecisions={personalOpsResult.ok ? personalOpsResult.state.decisions : []}
        initialDecisionsError={personalOpsResult.ok ? "" : personalOpsResult.error}
      />
    </div>
  );
}
