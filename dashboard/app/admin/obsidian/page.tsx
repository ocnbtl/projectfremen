import Link from "next/link";
import ObsidianExportPanel from "../../../components/ObsidianExportPanel";
import { requireAdminSession } from "../../../lib/require-admin";

export default async function AdminObsidianPage() {
  await requireAdminSession();
  return (
    <main className="shell">
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
