import Link from "next/link";
import ObsidianExportPanel from "../../../components/ObsidianExportPanel";

export default function AdminObsidianPage() {
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
          Back to Dashboard
        </Link>
      </header>

      <ObsidianExportPanel />
    </main>
  );
}
