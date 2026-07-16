import type {
  FinanceAccount,
  FinanceBill,
  FinanceBudget,
  FinanceFixtureDataset,
  FinanceFixtureRepository,
  FinanceLinkedContext,
  FinanceReminder,
  FinanceReviewItem,
  FinanceTransaction
} from "./types";

const accounts: readonly FinanceAccount[] = [
  { id: "operating", name: "Operating", kind: "Checking", inst: "Mercury", mask: "4021", balance: 18420.55, delta30: 4.2, hue: "blue", spark: [18, 22, 20, 26, 24, 29, 31, 33] },
  { id: "reserve", name: "Reserve", kind: "Savings", inst: "Ally", mask: "7782", balance: 42500, delta30: 1.1, hue: "teal", spark: [39, 39, 41, 41, 43, 43, 44, 46] },
  { id: "petty-cash", name: "Petty / Cash", kind: "Cash", inst: "Vault", mask: "-", balance: 1240, delta30: 0, hue: "yellow", spark: [11, 11, 14, 11, 11, 12, 12, 12] },
  { id: "studio-card", name: "Studio Card", kind: "Credit", inst: "Amex", mask: "1009", balance: -3284.12, delta30: -12, hue: "crimson", spark: [34, 31, 28, 25, 20, 23, 21, 22] },
  { id: "long-hold", name: "Long Hold", kind: "Brokerage", inst: "Fidelity", mask: "5530", balance: 96240, delta30: 2.8, hue: "violet", spark: [84, 86, 85, 88, 91, 90, 93, 95] },
  { id: "unigentamos-llc", name: "Unigentamos LLC", kind: "Business", inst: "Mercury", mask: "3300", balance: 28160, delta30: 3.5, hue: "indigo", spark: [24, 24, 26, 27, 28, 30, 31, 33] }
];

const budgets: readonly FinanceBudget[] = [
  { id: "studio-tools", category: "Studio & Tools", hue: "indigo", spent: 640, limit: 900, icon: "Wrench" },
  { id: "saas", category: "Software & SaaS", hue: "cyan", spent: 412, limit: 450, icon: "Cloud" },
  { id: "food", category: "Food & Dining", hue: "orange", spent: 588, limit: 600, icon: "Fork" },
  { id: "health", category: "Health", hue: "green", spent: 180, limit: 400, icon: "Heart" },
  { id: "travel", category: "Travel", hue: "teal", spent: 1240, limit: 1000, icon: "Plane" },
  { id: "home", category: "Home & Utilities", hue: "brown", spent: 720, limit: 850, icon: "Home" },
  { id: "learning", category: "Learning", hue: "violet", spent: 95, limit: 250, icon: "Book" },
  { id: "buffer", category: "Buffer / Misc", hue: "neutral", spent: 210, limit: 500, icon: "Circle" }
];

const bills: readonly FinanceBill[] = [
  { id: "aws", name: "AWS", amount: 188.4, due: "Jun 12", dueIn: 0, status: "overdue", account: "Unigentamos LLC", category: "Software & SaaS", hue: "orange", recurring: "monthly", autopay: false, icon: "Server", brandColors: ["#ff9900", "#232f3e", "#ec7211"] },
  { id: "studio-rent", name: "Studio Rent", amount: 2400, due: "Jun 15", dueIn: 3, status: "due", account: "Operating", category: "Home & Utilities", hue: "crimson", recurring: "monthly", autopay: false, icon: "Building", brandColors: ["#a855f7", "#e11d48", "#f97316"] },
  { id: "adobe", name: "Adobe Creative Cloud", amount: 59.99, due: "Jun 14", dueIn: 2, status: "soon", account: "Studio Card", category: "Software & SaaS", hue: "cyan", recurring: "monthly", autopay: true, icon: "Cloud", brandColors: ["#ff0000", "#fa0f00", "#470137"] },
  { id: "phone", name: "Phone & Data", amount: 78, due: "Jun 16", dueIn: 4, status: "soon", account: "Operating", category: "Home & Utilities", hue: "blue", recurring: "monthly", autopay: true, icon: "Phone", brandColors: ["#0ea5e9", "#2563eb", "#22d3ee"] },
  { id: "health", name: "Health Insurance", amount: 412, due: "Jun 18", dueIn: 6, status: "scheduled", account: "Operating", category: "Health", hue: "green", recurring: "monthly", autopay: true, icon: "Heart", brandColors: ["#16a34a", "#14b8a6", "#86efac"] },
  { id: "figma", name: "Figma Org", amount: 45, due: "Jun 20", dueIn: 8, status: "scheduled", account: "Unigentamos LLC", category: "Software & SaaS", hue: "violet", recurring: "monthly", autopay: true, icon: "Pen", brandColors: ["#f24e1e", "#a259ff", "#1abcfe"] },
  { id: "notion", name: "Notion Team", amount: 32, due: "Jun 22", dueIn: 10, status: "scheduled", account: "Operating", category: "Software & SaaS", hue: "indigo", recurring: "monthly", autopay: true, icon: "Notebook", brandColors: ["#18181b", "#71717a", "#f4f4f5"] },
  { id: "domain", name: "Domain Renewal", amount: 22, due: "Jun 09", dueIn: -3, status: "paid", account: "Studio Card", category: "Software & SaaS", hue: "neutral", recurring: "annual", autopay: true, icon: "Globe", brandColors: ["#71717a", "#d4d4d8", "#a1a1aa"] }
];

function makeTransaction(
  input: Omit<FinanceTransaction, "currency" | "quarter" | "quarterYear" | "week" | "weekYear" | "tzOffset" | "ufInit">
    & Partial<Pick<FinanceTransaction, "quarter" | "quarterYear" | "week" | "weekYear" | "tzOffset" | "ufInit">>
): FinanceTransaction {
  return {
    currency: "USD",
    quarter: "Q2",
    quarterYear: "2026-Q2",
    week: 24,
    weekYear: "2026-W24",
    tzOffset: "-0400",
    ufInit: true,
    ...input
  };
}

const transactions: readonly FinanceTransaction[] = [
  makeTransaction({ id: "TX-7741", date: "Jun 12", weekdayName: "Friday", weekdayNum: 5, entity: "Apple", merchant: "Apple Store", account: "Studio Card", accountType: "Credit", category: "Studio & Tools", spendCategory: "Hardware", hue: "indigo", amount: -1299, io: "expense", memo: "iPad Pro setup for dashboard review and design work.", receipt: "Apple receipt pending", incomeSource: "", reimbursable: false, reimbursedOn: "", status: "pending" }),
  makeTransaction({ id: "TX-7740", date: "Jun 11", weekdayName: "Thursday", weekdayNum: 4, entity: "Stripe", merchant: "Stripe Payout", account: "Operating", accountType: "Checking", category: "Income", spendCategory: "", hue: "green", amount: 6840, io: "income", memo: "Weekly payout cleared to Operating.", receipt: "Stripe payout report", incomeSource: "Client revenue", reimbursable: false, reimbursedOn: "", status: "cleared" }),
  makeTransaction({ id: "TX-7739", date: "Jun 11", weekdayName: "Thursday", weekdayNum: 4, entity: "Blue Bottle", merchant: "Blue Bottle", account: "Studio Card", accountType: "Credit", category: "Food & Dining", spendCategory: "Meals", hue: "orange", amount: -18.5, io: "expense", memo: "Coffee before studio block.", receipt: "", incomeSource: "", reimbursable: false, reimbursedOn: "", status: "cleared" }),
  makeTransaction({ id: "TX-7738", date: "Jun 10", weekdayName: "Wednesday", weekdayNum: 3, entity: "AWS", merchant: "AWS", account: "Unigentamos LLC", accountType: "Business", category: "Software & SaaS", spendCategory: "Infrastructure", hue: "cyan", amount: -188.4, io: "expense", memo: "June infra charge; no autopay on bill record.", receipt: "AWS invoice", incomeSource: "", reimbursable: false, reimbursedOn: "", status: "cleared" }),
  makeTransaction({ id: "TX-7737", date: "Jun 10", weekdayName: "Wednesday", weekdayNum: 3, entity: "Whole Foods", merchant: "Whole Foods", account: "Operating", accountType: "Checking", category: "Food & Dining", spendCategory: "Groceries", hue: "orange", amount: -132.18, io: "expense", memo: "Weekly groceries.", receipt: "", incomeSource: "", reimbursable: false, reimbursedOn: "", status: "cleared" }),
  makeTransaction({ id: "TX-7736", date: "Jun 09", weekdayName: "Tuesday", weekdayNum: 2, entity: "Delta", merchant: "Delta Air Lines", account: "Studio Card", accountType: "Credit", category: "Travel", spendCategory: "Flights", hue: "teal", amount: -642, io: "expense", memo: "Project travel; review for reimbursement.", receipt: "Delta itinerary", incomeSource: "", reimbursable: true, reimbursedOn: "", status: "cleared" }),
  makeTransaction({ id: "TX-7735", date: "Jun 09", weekdayName: "Tuesday", weekdayNum: 2, entity: "Lumen", merchant: "Consulting - Lumen", account: "Unigentamos LLC", accountType: "Business", category: "Income", spendCategory: "", hue: "green", amount: 3200, io: "income", memo: "Consulting invoice paid.", receipt: "Invoice 2026-06-LUM", incomeSource: "Consulting", reimbursable: false, reimbursedOn: "", status: "cleared" }),
  makeTransaction({ id: "TX-7734", date: "Jun 08", weekdayName: "Monday", weekdayNum: 1, entity: "Figma", merchant: "Figma", account: "Unigentamos LLC", accountType: "Business", category: "Software & SaaS", spendCategory: "Design tools", hue: "violet", amount: -45, io: "expense", memo: "Org seat.", receipt: "Figma invoice", incomeSource: "", reimbursable: false, reimbursedOn: "", status: "cleared" }),
  makeTransaction({ id: "TX-7733", date: "Jun 08", weekdayName: "Monday", weekdayNum: 1, entity: "Uber", merchant: "Uber", account: "Operating", accountType: "Checking", category: "Travel", spendCategory: "Ground transport", hue: "teal", amount: -27.4, io: "expense", memo: "Ride from studio.", receipt: "Uber receipt", incomeSource: "", reimbursable: true, reimbursedOn: "", status: "cleared" }),
  makeTransaction({ id: "TX-7732", date: "Jun 07", weekdayName: "Sunday", weekdayNum: 7, entity: "Notion", merchant: "Notion", account: "Operating", accountType: "Checking", category: "Software & SaaS", spendCategory: "Knowledge tools", hue: "indigo", amount: -32, io: "expense", memo: "Team workspace.", receipt: "Notion invoice", incomeSource: "", reimbursable: false, reimbursedOn: "", status: "cleared" })
];

const reviewItems: readonly FinanceReviewItem[] = [
  { id: "reconcile", label: "Reconcile all accounts", done: true, hue: "green" },
  { id: "categorize", label: "Categorize uncleared transactions", done: true, hue: "green" },
  { id: "budget-overruns", label: "Review budget overruns (Travel +24%)", done: false, hue: "orange" },
  { id: "subscriptions", label: "Audit active subscriptions", done: false, hue: "violet" },
  { id: "caps", label: "Set next month's budget caps", done: false, hue: "indigo" },
  { id: "decisions", label: "Link Finance candidates to accepted Personal Ops Decisions; keep Notes & Projects as context", done: false, hue: "cyan" }
];

const reminders: readonly FinanceReminder[] = [
  { id: "rate", text: "Confirm Q3 contractor rate before invoicing", due: "Jun 13", hue: "orange", kind: "decision" },
  { id: "transfer", text: "Move $5k surplus -> Reserve", due: "Jun 14", hue: "teal", kind: "action" },
  { id: "vimeo", text: "Cancel unused Vimeo Pro", due: "Jun 16", hue: "crimson", kind: "action" },
  { id: "close", text: "Monthly close - reconcile Studio Card", due: "Jun 30", hue: "violet", kind: "review" }
];

const linkedContext: readonly FinanceLinkedContext[] = [
  { id: "pricing", title: "2026 Pricing model rev. C", type: "Note", hue: "yellow" },
  { id: "studio-buildout", title: "Studio buildout", type: "Project", hue: "indigo" },
  { id: "contracts", title: "Vendor contracts / 2026", type: "Resource", hue: "brown" },
  { id: "monthly-close", title: "Finance Monthly Review", type: "Finance", hue: "violet" }
];

const snapshot: FinanceFixtureDataset["snapshot"] = {
  lastMonthOut: 6084,
  netWorthDeltaLabel: "+3.4% vs last month",
  liquidDeltaLabel: "+2.1% across 5 accts",
  debtDeltaLabel: "-12% 1 card",
  netThisMonth: 3900,
  averageBurn: 7766,
  savingsRate: 39,
  monthIncome: 10040,
  monthSpend: 6140,
  monthSaved: 3900,
  accountDetailCode: "AC-01",
  cashflow: {
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    income: [9.1, 8.8, 8.7, 10.6, 11.1, 10.4, 10.0, 11.4, 12.7, 12.4, 11.6, 10.0],
    spend: [9.2, 8.7, 8.6, 10.5, 11.1, 10.5, 10.0, 11.2, 12.7, 12.5, 11.7, 10.1],
    savings: [1.6, 0.8, 1.1, 2.4, 3.0, -0.4, 1.2, 2.8, 3.4, 2.7, -0.6, 3.9]
  },
  attentionItems: [
    { icon: "Alert", title: "AWS payment overdue", detail: "$188.40 · no autopay", label: "OVERDUE", hue: "crimson" },
    { icon: "Trending", title: "Travel over budget", detail: "+24% · $1,240 / $1,000", label: "BUDGET", hue: "orange" },
    { icon: "PiggyBank", title: "$5k surplus idle", detail: "move to Reserve?", label: "ACTION", hue: "violet" }
  ]
};

const dataset: FinanceFixtureDataset = {
  accounts,
  budgets,
  bills,
  transactions,
  reviewItems,
  reminders,
  linkedContext,
  snapshot
};

export const financeFixtureRepository: FinanceFixtureRepository = {
  metadata: {
    id: "finance-june-2026-preview",
    periodLabel: "June 2026",
    previewLabel: "Fixture dataset · June 2026 · read-only preview",
    readOnly: true,
    persistenceConnected: false
  },
  read() {
    return dataset;
  }
};
