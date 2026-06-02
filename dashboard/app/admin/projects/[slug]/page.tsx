import Link from "next/link";
import { notFound } from "next/navigation";
import AdminChrome from "../../../../components/AdminChrome";
import { getProjectBySlug } from "../../../../lib/admin-navigation";
import { requireAdminSession } from "../../../../lib/require-admin";

export const dynamic = "force-dynamic";

export default async function ProjectPlaceholderPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireAdminSession();
  const { slug } = await params;
  const project = getProjectBySlug(slug);

  if (!project) {
    notFound();
  }

  return (
    <main className="shell admin-chrome-main">
      <AdminChrome
        sidebarTitle={project.shortLabel}
        sidebarSummary="Planned project workspace."
        sidebarItems={[
          { label: "Status", value: project.status },
          { label: "Route", value: project.href }
        ]}
        sidebarActions={[
          { label: "All Projects", href: "/admin/projects" },
          { label: "Notes", href: "/admin/notes" }
        ]}
      />
      <header className="topbar">
        <div>
          <h1 style={{ margin: 0 }}>{project.label}</h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            This project is reserved in the top-level hierarchy. Its dedicated dashboard can be
            built once the workflow and source data are clearer.
          </p>
        </div>
        <Link href="/admin/projects" className="review-back-link">
          Back to Projects
        </Link>
      </header>

      <section className="card">
        <h2>Planned Workspace</h2>
        <p className="muted">
          Use Notes or Personal Ops notes for now. This page exists so top navigation remains
          stable while the project system grows.
        </p>
      </section>
    </main>
  );
}
