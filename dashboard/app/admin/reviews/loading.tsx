import AdminChrome from "../../../components/AdminChrome";
import SystemState from "../../../components/operational/SystemState";

export default function ReviewsLoading() {
  return (
    <div className="shell admin-chrome-main module-ref-shell reviews-module-shell native-module-shell">
      <AdminChrome
        showCommandSearch={false}
        showPageSidebar={false}
        showLocalAi={false}
        sidebarTitle="Reviews"
        sidebarSummary="Recurring operating closure, evidence use, candidate resolution, and carry-forward."
      />
      <main className="module-shell" aria-label="Loading Reviews">
        <SystemState variant="loading" title="Loading review directory" skeletonRows={8} />
        <SystemState variant="loading" title="Loading ReviewRun workspace" skeletonRows={12} />
        <SystemState variant="loading" title="Loading completion rail" skeletonRows={7} />
      </main>
    </div>
  );
}

