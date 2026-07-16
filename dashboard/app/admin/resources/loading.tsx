import AdminChrome from "../../../components/AdminChrome";
import SystemState from "../../../components/operational/SystemState";
import styles from "../../../components/content-graph/ContentGraphWorkspace.module.css";

export default function ResourcesLoading() {
  return (
    <div className="shell admin-chrome-main module-ref-shell resource-module-shell native-module-shell">
      <AdminChrome showCommandSearch={false} showPageSidebar={false} showLocalAi={false} sidebarTitle="Resources" />
      <main className={styles.loadingShell} aria-label="Loading Resources workspace">
        <SystemState variant="loading" skeletonRows={8} compact />
        <SystemState variant="loading" title="Loading Resources directory" skeletonRows={7} />
        <SystemState variant="loading" title="Loading selected Resource" skeletonRows={5} />
      </main>
    </div>
  );
}
