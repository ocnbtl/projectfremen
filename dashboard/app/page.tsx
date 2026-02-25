import Link from "next/link";
import RotatingWelcome from "../components/RotatingWelcome";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="card">
        <h1>Unigentamos Admin</h1>
        <p className="muted">
          Unified operations dashboard for Unigentamos, pngwn, and Ranosa Decor.
        </p>
        <RotatingWelcome />
        <p style={{ marginTop: 16 }}>
          <Link href="/admin">Open Admin Dashboard</Link>
        </p>
      </section>

      <section className="grid grid-3" style={{ marginTop: 12 }}>
        <article className="card">
          <h3>Obsidian-Aligned</h3>
          <p className="muted">
            Property-first integration. No forced folder hierarchy or note-lineage changes.
          </p>
        </article>
        <article className="card">
          <h3>Action Center</h3>
          <p className="muted">
            Weekly and monthly priorities in one place so you do not need to remember workflows.
          </p>
        </article>
        <article className="card">
          <h3>Brand Oversight</h3>
          <p className="muted">
            Separate project views with parent-level monitoring for status, KPI, and risks.
          </p>
        </article>
      </section>
    </main>
  );
}
