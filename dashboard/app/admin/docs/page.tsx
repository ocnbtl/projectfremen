import Link from "next/link";
import DocsIndexPanel from "../../../components/DocsIndexPanel";
import { requireAdminSession } from "../../../lib/require-admin";

export default async function AdminDocsPage() {
  await requireAdminSession();
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
          Back to Home
        </Link>
      </header>

      <DocsIndexPanel />
    </main>
  );
}
