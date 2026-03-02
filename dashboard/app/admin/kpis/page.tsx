import Link from "next/link";
import KpiManager from "../../../components/KpiManager";

export default function AdminKpisPage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1 style={{ margin: 0 }}>KPI Tracker</h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            Update and sync KPI values by brand.
          </p>
        </div>
        <Link href="/admin" className="review-back-link">
          Back to Dashboard
        </Link>
      </header>

      <KpiManager />
    </main>
  );
}
