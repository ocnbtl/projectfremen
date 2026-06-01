import Link from "next/link";
import AdminChrome from "../../../components/AdminChrome";
import { requireAdminSession } from "../../../lib/require-admin";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  await requireAdminSession();

  return (
    <main className="shell admin-chrome-main">
      <AdminChrome
        sidebarTitle="Media"
        sidebarSummary="Placeholder hub for photos, videos, songs, and media notes."
        sidebarItems={[
          { label: "Status", value: "Planned" },
          { label: "Storage", value: "Not connected" }
        ]}
        sidebarActions={[
          { label: "Notes", href: "/admin/notes" },
          { label: "Personal Ops", href: "/admin/personal" }
        ]}
      />
      <header className="topbar">
        <div>
          <h1 style={{ margin: 0 }}>Media</h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            Future hub for pictures, videos, songs, and other media-linked context.
          </p>
        </div>
        <Link href="/admin" className="review-back-link">
          Back to Home
        </Link>
      </header>

      <section className="card">
        <h2>Media Boundary</h2>
        <p className="muted">
          This page is intentionally a shell until storage, privacy, and file-handling rules are
          designed. It exists now so the top navigation hierarchy is stable.
        </p>
      </section>
    </main>
  );
}
