import Link from "next/link";
import AdminChrome from "../../../components/AdminChrome";
import { ADMIN_PROJECTS } from "../../../lib/admin-navigation";
import { requireAdminSession } from "../../../lib/require-admin";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  await requireAdminSession();
  const activeCount = ADMIN_PROJECTS.filter((project) => project.status === "active").length;

  return (
    <main className="shell admin-chrome-main">
      <AdminChrome
        sidebarTitle="Projects"
        sidebarSummary="All project command centers, sorted alphabetically in the top nav."
        sidebarItems={[
          { label: "Projects", value: String(ADMIN_PROJECTS.length) },
          { label: "Active", value: String(activeCount) },
          { label: "Planned", value: String(ADMIN_PROJECTS.length - activeCount) }
        ]}
        sidebarActions={[
          { label: "KPI Tracker", href: "/admin/kpis" },
          { label: "Docs", href: "/admin/docs" }
        ]}
      />
      <header className="topbar">
        <div>
          <h1 style={{ margin: 0 }}>Projects</h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            Broad project navigation for Unigentamos. Active projects link to their command
            centers; planned projects hold space until their modules are built.
          </p>
        </div>
        <Link href="/admin" className="review-back-link">
          Back to Home
        </Link>
      </header>

      <section className="admin-hub-grid">
        {ADMIN_PROJECTS.map((project) => (
          <article className="card admin-hub-card" key={project.slug}>
            <div>
              <p>{project.status}</p>
              <h2>{project.label}</h2>
            </div>
            <Link href={project.href}>Open</Link>
          </article>
        ))}
      </section>
    </main>
  );
}
