import SystemState from "../../../components/operational/SystemState";

export default function PeopleLoading() {
  return (
    <main className="shell admin-chrome-main module-ref-shell people-module-shell">
      <section className="people-redesign-shell people-loading-shell" aria-label="Loading People workspace">
        <aside className="people-desktop-sidebar" aria-hidden="true">
          <SystemState variant="loading" skeletonRows={8} compact />
        </aside>
        <section className="people-directory-panel">
          <SystemState variant="loading" title="Loading People directory" skeletonRows={7} />
        </section>
        <section className="people-profile-panel">
          <SystemState variant="loading" title="Loading selected profile" skeletonRows={5} />
        </section>
      </section>
    </main>
  );
}
