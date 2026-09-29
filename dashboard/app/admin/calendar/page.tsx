import AdminChrome from "../../../components/AdminChrome";
import CalendarWorkspace from "../../../components/planning/CalendarWorkspace";
import { requireAdminSession } from "../../../lib/require-admin";
export const dynamic = "force-dynamic";
export default async function CalendarPage() {
  await requireAdminSession();
  return (
    <div className="shell admin-chrome-main native-module-shell">
      <AdminChrome
        sidebarTitle="Calendar"
        showCommandSearch={false}
        showPageSidebar={false}
        showLocalAi={false}
      />
      <CalendarWorkspace />
    </div>
  );
}
