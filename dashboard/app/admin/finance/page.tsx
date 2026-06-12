import AdminChrome from "../../../components/AdminChrome";
import FinanceWorkspace from "../../../components/FinanceWorkspace";
import { requireAdminSession } from "../../../lib/require-admin";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  await requireAdminSession();

  return (
    <main className="shell admin-chrome-main finance-workspace-shell">
      <AdminChrome
        sidebarTitle="Finance"
        showCommandSearch={false}
        showPageSidebar={false}
        showLocalAi={false}
      />
      <FinanceWorkspace />
    </main>
  );
}
