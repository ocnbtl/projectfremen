import AdminChrome from "../../../components/AdminChrome";
import FinanceWorkspace from "../../../components/FinanceWorkspace";
import type { FinanceView } from "../../../lib/native-objects/url-state";
import { requireAdminSession } from "../../../lib/require-admin";

export default async function FinanceRoutePage({
  initialView
}: {
  initialView?: FinanceView;
}) {
  await requireAdminSession();

  return (
    <div className="shell admin-chrome-main module-ref-shell finance-workspace-shell native-module-shell">
      <AdminChrome
        sidebarTitle="Finance"
        sidebarSummary="Accounts, transactions, bills, budgets, and the Finance-owned monthly close."
        showCommandSearch={false}
        showPageSidebar={false}
        showLocalAi={false}
      />
      <FinanceWorkspace initialView={initialView} />
    </div>
  );
}
