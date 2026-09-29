import AdminChrome from "../../../components/AdminChrome";
import MapWorkspace from "../../../components/planning/MapWorkspace";
import { requireAdminSession } from "../../../lib/require-admin";
export const dynamic = "force-dynamic";
export default async function MapPage() {
  await requireAdminSession();
  return (
    <div className="shell admin-chrome-main native-module-shell">
      <AdminChrome
        sidebarTitle="Map"
        showCommandSearch={false}
        showPageSidebar={false}
        showLocalAi={false}
      />
      <MapWorkspace />
    </div>
  );
}
