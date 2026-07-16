import AdminChrome from "../../../../components/AdminChrome";
import MediaUploadQueueWorkspace from "../../../../components/media/MediaUploadQueueWorkspace";
import { requireAdminSession } from "../../../../lib/require-admin";

export const dynamic = "force-dynamic";

export default async function MediaUploadQueuePage() {
  await requireAdminSession();

  return (
    <div className="shell admin-chrome-main module-ref-shell media-module-shell native-module-shell">
      <AdminChrome
        showCommandSearch={false}
        showPageSidebar={false}
        showLocalAi={false}
        sidebarTitle="Media"
        sidebarSummary="Binary intake, provenance, rights, versions, duplicates, and usage."
      />
      <MediaUploadQueueWorkspace />
    </div>
  );
}
