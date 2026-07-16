import AdminChrome from "../../../components/AdminChrome";
import SystemState from "../../../components/operational/SystemState";

export default function ProjectsLoading() {
  return (
    <div className="shell admin-chrome-main module-ref-shell projects-module-shell native-module-shell">
      <AdminChrome
        showCommandSearch={false}
        showPageSidebar={false}
        showLocalAi={false}
        sidebarTitle="Projects"
      />
      <main aria-label="Loading Projects" style={{ padding: "24px" }}>
        <SystemState
          variant="loading"
          title="Loading Projects"
          skeletonRows={8}
        />
      </main>
    </div>
  );
}
