import AdminChrome from "../../../components/AdminChrome";
import SystemState from "../../../components/operational/SystemState";
import styles from "../../../components/content-graph/ContentGraphWorkspace.module.css";

export default function NotesLoading() {
  return (
    <div className="shell admin-chrome-main module-ref-shell notes-module-shell native-module-shell">
      <AdminChrome showCommandSearch={false} showPageSidebar={false} showLocalAi={false} sidebarTitle="Notes" />
      <main className={styles.loadingShell} aria-label="Loading Notes workspace">
        <SystemState variant="loading" skeletonRows={8} compact />
        <SystemState variant="loading" title="Loading Notes directory" skeletonRows={7} />
        <SystemState variant="loading" title="Loading selected Note" skeletonRows={5} />
      </main>
    </div>
  );
}
