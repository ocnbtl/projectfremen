import AdminChrome from "../../../../components/AdminChrome";
import { WorkspaceTopbarProvider } from "../../../../components/admin-shell/WorkspaceTopbar";
import WritingSettings from "../../../../components/writing/WritingSettings";
import { requireAdminSession } from "../../../../lib/require-admin";

export const dynamic = "force-dynamic";

export default async function PersonalSettingsPage() {
  await requireAdminSession();
  return (
    <WorkspaceTopbarProvider>
      <div className="shell admin-chrome-main module-ref-shell personal-ops-module-shell native-module-shell">
        <AdminChrome sidebarTitle="Personal" showCommandSearch={false} showPageSidebar={false} showLocalAi={false} />
        <WritingSettings />
      </div>
    </WorkspaceTopbarProvider>
  );
}
