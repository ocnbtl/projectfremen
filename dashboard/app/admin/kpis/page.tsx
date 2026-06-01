import Link from "next/link";
import AdminChrome from "../../../components/AdminChrome";
import KpiManager from "../../../components/KpiManager";
import { requireAdminSession } from "../../../lib/require-admin";

export const dynamic = "force-dynamic";

export default async function AdminKpisPage() {
  await requireAdminSession();
  return (
    <main className="shell admin-chrome-main">
      <AdminChrome
        sidebarTitle="KPI Tracker"
        sidebarSummary="Update high-level project metrics and source links."
        sidebarItems={[
          { label: "Surface", value: "Metrics" },
          { label: "Access", value: "Admin only" }
        ]}
        sidebarActions={[
          { label: "Projects", href: "/admin/projects" },
          { label: "Weekly Review", href: "/admin/reviews/weekly" }
        ]}
      />
      <header className="topbar">
        <div>
          <h1 style={{ margin: 0 }}>KPI Tracker</h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            Update and sync KPI values by brand.
          </p>
        </div>
        <Link href="/admin" className="review-back-link">
          Back to Home
        </Link>
      </header>

      <KpiManager />
    </main>
  );
}
