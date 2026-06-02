import Link from "next/link";
import AdminChrome from "../../../components/AdminChrome";
import { requireAdminSession } from "../../../lib/require-admin";

export const dynamic = "force-dynamic";

const financeStats = [
  { label: "Net cash", value: "+$2,840", tone: "green" },
  { label: "Bills due", value: "4", tone: "crimson" },
  { label: "Budget left", value: "$1,260", tone: "green" },
  { label: "Subscriptions", value: "$312/mo", tone: "orange" }
];

const cashFlowRows = [
  ["Income posted", "+$4,200", "green"],
  ["Rent scheduled", "-$1,480", "crimson"],
  ["Card payment", "-$620", "blue"],
  ["Savings transfer", "-$400", "cyan"]
];

const budgets = [
  ["Groceries", "72", "green"],
  ["Travel", "41", "blue"],
  ["Tools", "88", "orange"],
  ["Home", "53", "cyan"]
];

const bills = [
  ["Rent", "Jun 3", "$1,480"],
  ["Internet", "Jun 5", "$88"],
  ["Insurance", "Jun 12", "$142"],
  ["Cloud tools", "Jun 15", "$84"]
];

export default async function FinancePage() {
  await requireAdminSession();

  return (
    <main className="shell admin-chrome-main module-ref-shell finance-module-shell">
      <AdminChrome
        sidebarTitle="Finance"
        sidebarSummary="Cash flow, accounts, budgets, bills, subscriptions, and financial reviews."
        sidebarItems={[
          { label: "Accounts", value: "6" },
          { label: "Bills due", value: "4" },
          { label: "Budgets", value: "9" },
          { label: "Subscriptions", value: "14" }
        ]}
        sidebarActions={[
          { label: "Overview", href: "/admin/finance" },
          { label: "Bills & subscriptions", href: "/admin/finance" },
          { label: "Budgets", href: "/admin/finance" },
          { label: "Reports", href: "/admin/finance" },
          { label: "Monthly Review", href: "/admin/reviews/monthly" },
          { label: "Personal Ops", href: "/admin/personal/finance" }
        ]}
      />
      <header className="module-ref-header">
        <div>
          <p className="module-ref-kicker module-ref-tone-blue">Finance</p>
          <h1>Finance command view</h1>
          <p>
            A practical finance module for day-to-day cash flow, recurring costs, budgets, bills,
            subscriptions, and monthly review prep.
          </p>
        </div>
        <label className="module-ref-search">
          <span aria-hidden="true">/</span>
          <input aria-label="Search finance" placeholder="Search bills, budgets, accounts" />
          <kbd>cash</kbd>
        </label>
      </header>

      <section className="module-ref-content">
        <div className="module-ref-main">
          <div className="module-ref-stat-grid">
            {financeStats.map((item) => (
              <article className={`module-ref-stat module-ref-tone-${item.tone}`} key={item.label}>
                <span className="module-ref-dot" />
                <strong>{item.value}</strong>
                <p>{item.label}</p>
              </article>
            ))}
          </div>

          <article className="module-ref-panel">
            <div className="module-ref-section-title">
              <h2>Cash flow</h2>
              <span>Manual snapshot</span>
            </div>
            <div className="module-ref-cash-list">
              {cashFlowRows.map(([label, amount, tone]) => (
                <div className={`module-ref-cash-row module-ref-tone-${tone}`} key={label}>
                  <strong>{label}</strong>
                  <span>{amount}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="module-ref-panel">
            <div className="module-ref-section-title">
              <h2>Budget watch</h2>
              <Link href="/admin/reviews/monthly" className="review-back-link">
                Monthly Review
              </Link>
            </div>
            <div className="module-ref-budget-list">
              {budgets.map(([label, amount, tone]) => (
                <div className={`module-ref-budget module-ref-tone-${tone}`} key={label}>
                  <strong>{label}</strong>
                  <span>{amount}% used</span>
                  <div className="module-ref-budget-meter">
                    <span style={{ width: `${amount}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>

        <aside className="module-ref-detail">
          <div className="module-ref-detail-title">
            <span className="module-ref-eyebrow module-ref-tone-crimson">Upcoming bills</span>
            <h2>Bills and subscriptions</h2>
          </div>
          <p>
            Manual, summarized finance state only. No bank connections, credentials, raw
            transaction feeds, or account numbers are introduced.
          </p>
          <div className="module-ref-field-list">
            {bills.map(([label, date, amount]) => (
              <div className="module-ref-field" key={label}>
                <strong>{label}</strong>
                <span>
                  {date} / {amount}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
