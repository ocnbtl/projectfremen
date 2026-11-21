import AdminChrome from "../../../../components/AdminChrome";
import { WorkspaceTopbarProvider } from "../../../../components/admin-shell/WorkspaceTopbar";
import type { ReactNode } from "react";
import { requireAdminSession } from "../../../../lib/require-admin";

export const dynamic = "force-dynamic";

export default async function PersonalSettingsLayout({children}: {children: ReactNode}) {
  await requireAdminSession();
  return (
    <WorkspaceTopbarProvider>
      <div className="shell admin-chrome-main module-ref-shell personal-ops-module-shell native-module-shell">
        <AdminChrome sidebarTitle="Personal" showCommandSearch={false} showPageSidebar={false} showLocalAi={false} />
        {children}
      </div>
    </WorkspaceTopbarProvider>
  );
}
