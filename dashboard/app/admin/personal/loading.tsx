import AdminChrome from "../../../components/AdminChrome";
import SystemState from "../../../components/operational/SystemState";
import styles from "../../../components/personal-ops/PersonalOpsWorkspace.module.css";

export default function PersonalOpsLoading() {
  return (
    <div className="shell admin-chrome-main module-ref-shell personal-ops-module-shell native-module-shell">
      <AdminChrome
        showCommandSearch={false}
        showPageSidebar={false}
        showLocalAi={false}
        sidebarTitle="Personal Ops"
      />
      <main className={styles.shell} data-has-inspector="true" aria-label="Loading Personal Ops workspace">
        <aside className={styles.sidebar} aria-hidden="true">
          <SystemState variant="loading" skeletonRows={8} compact />
        </aside>
        <section className={styles.directory}>
          <SystemState variant="loading" title="Loading operating queue" skeletonRows={8} />
        </section>
        <aside className={styles.inspector}>
          <SystemState variant="loading" title="Loading selected object" skeletonRows={6} />
        </aside>
      </main>
    </div>
  );
}
