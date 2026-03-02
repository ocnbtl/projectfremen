import Link from "next/link";
import DocsIndexPanel from "../../../components/DocsIndexPanel";

export default function AdminDocsPage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1 style={{ margin: 0 }}>GitHub Sync</h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            Sync docs index and search repository documents.
          </p>
        </div>
        <Link href="/admin" className="review-back-link">
          Back to Dashboard
        </Link>
      </header>

      <DocsIndexPanel />
    </main>
  );
}
