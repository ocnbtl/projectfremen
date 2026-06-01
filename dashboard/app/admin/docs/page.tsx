import Link from "next/link";
import AdminChrome from "../../../components/AdminChrome";
import DocsIndexPanel from "../../../components/DocsIndexPanel";
import { requireAdminSession } from "../../../lib/require-admin";

export const dynamic = "force-dynamic";

export default async function AdminDocsPage() {
  await requireAdminSession();
  return (
    <main className="shell admin-chrome-main">
      <AdminChrome
        sidebarTitle="Docs"
        sidebarSummary="Repository document index and sync controls."
        sidebarItems={[
          { label: "Source", value: "GitHub" },
          { label: "Mode", value: "Authenticated" }
        ]}
        sidebarActions={[
          { label: "Notes", href: "/admin/notes" },
          { label: "Projects", href: "/admin/projects" }
        ]}
      />
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
