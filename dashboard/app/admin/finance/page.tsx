import Link from "next/link";
import AdminChrome from "../../../components/AdminChrome";
import { requireAdminSession } from "../../../lib/require-admin";

export const dynamic = "force-dynamic";

const financeStats = [
  { label: "Net cash", value: "+$2,840", tone: "green" },
  { label: "Bills due", value: "4", tone: "crimson" },
  { label: "Budget left", value: "$1,260", tone: "blue" },
  { label: "Subscriptions", value: "$312/mo", tone: "orange" }
];

const cashFlowRows = [
  ["Income posted", "+$4,200", "green"],
  ["Rent scheduled", "-$1,480", "crimson"],
  ["Card payment", "-$620", "blue"],
  ["Savings transfer", "-$400", "cyan"]
];

export default async function FinancePage() {
  await requireAdminSession();

  return (
    <main className="shell admin-chrome-main finance-module-shell">
      <AdminChrome
        sidebarTitle="Finance"
        sidebarSummary="Cash flow, accounts, budgets, bills, subscriptions, and financial reviews."
        sidebarItems={[
          { label: "Accounts", value: "6" },
          { label: "Bills due", value: "4" },
          { label: "Budgets", value: "9" }
        ]}
        sidebarActions={[
          { label: "Overview", href: "/admin/finance" },
          { label: "Monthly Review", href: "/admin/reviews/monthly" },
          { label: "Personal Ops", href: "/admin/personal/finance" }
        ]}
      />
      <header className="topbar">
        <div>
          <p className="muted personal-ops-kicker">Finance</p>
          <h1 style={{ margin: 0 }}>Finance command view</h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            A practical finance module for cash flow, recurring costs, budgets, and review prep.
          </p>
        </div>
        <Link href="/admin/reviews/monthly" className="review-back-link">
          Monthly Review
        </Link>
      </header>

      <section className="grid grid-4 module-stat-grid">
        {financeStats.map((item) => (
          <article className={`module-stat module-stat-${item.tone}`} key={item.label}>
            <span />
            <strong>{item.value}</strong>
            <p>{item.label}</p>
          </article>
        ))}
      </section>

      <section className="module-layout">
        <article className="card module-main-panel">
          <div className="personal-ops-section-heading">
            <h2>Cash flow</h2>
            <span>Manual snapshot</span>
          </div>
          <div className="module-table">
            {cashFlowRows.map(([label, amount, tone]) => (
              <div key={label}>
                <strong>{label}</strong>
                <span className={`module-amount module-amount-${tone}`}>{amount}</span>
              </div>
            ))}
          </div>
        </article>

        <aside className="card module-side-panel">
          <h2>Safety boundary</h2>
          <p className="muted">
            This first pass uses manual, summarized finance state only. No bank connections,
            credentials, raw transaction feeds, or account numbers are introduced.
          </p>
        </aside>
      </section>
    </main>
  );
}
