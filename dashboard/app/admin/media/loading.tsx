import AdminChrome from "../../../components/AdminChrome";
import SystemState from "../../../components/operational/SystemState";
import styles from "../../../components/content-graph/ContentGraphWorkspace.module.css";

export default function MediaLoading() {
  return (
    <div className="shell admin-chrome-main module-ref-shell media-module-shell native-module-shell">
      <AdminChrome showCommandSearch={false} showPageSidebar={false} showLocalAi={false} sidebarTitle="Media" />
      <main className={styles.loadingShell} aria-label="Loading Media workspace">
        <SystemState variant="loading" skeletonRows={8} compact />
        <SystemState variant="loading" title="Loading Media directory" skeletonRows={7} />
        <SystemState variant="loading" title="Loading selected Media asset" skeletonRows={5} />
      </main>
    </div>
  );
}
