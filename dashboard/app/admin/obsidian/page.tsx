import Link from "next/link";
import AdminChrome from "../../../components/AdminChrome";
import ObsidianExportPanel from "../../../components/ObsidianExportPanel";
import { requireAdminSession } from "../../../lib/require-admin";

export const dynamic = "force-dynamic";

export default async function AdminObsidianPage() {
  await requireAdminSession();
  return (
    <main className="shell admin-chrome-main">
      <AdminChrome
        sidebarTitle="Legacy Export"
        sidebarSummary="Obsidian export remains available, but Personal Ops is now dashboard-native."
        sidebarItems={[
          { label: "Direction", value: "Export only" },
          { label: "Primary notes", value: "Unigentamos" }
        ]}
        sidebarActions={[
          { label: "Native Notes", href: "/admin/notes" },
          { label: "Personal Ops", href: "/admin/personal" }
        ]}
      />
      <header className="topbar">
        <div>
          <h1 style={{ margin: 0 }}>Obsidian Export</h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            Preview and write export files.
          </p>
        </div>
        <Link href="/admin" className="review-back-link">
          Back to Home
        </Link>
      </header>

      <ObsidianExportPanel />
    </main>
  );
}
