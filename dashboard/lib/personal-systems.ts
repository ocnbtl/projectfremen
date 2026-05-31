export type PersonalSystemSensitivity = "reference" | "private" | "sensitive";
export type PersonalSystemStatus = "inventory" | "planned" | "blocked";

export type PersonalSystemSource = {
  label: string;
  status: "candidate" | "needs-inventory" | "blocked";
  detail: string;
};

export type PersonalSystemDomain = {
  slug: string;
  label: string;
  shortLabel: string;
  summary: string;
  operatingView: string;
  sourceStatus: string;
  sensitivity: PersonalSystemSensitivity;
  status: PersonalSystemStatus;
  nextStep: string;
  workflows: string[];
  sources: PersonalSystemSource[];
  privacyBoundary: string;
  blockedUntil: string;
};

export const PERSONAL_SYSTEM_DOMAINS: PersonalSystemDomain[] = [
  {
    slug: "ai-monitoring",
    label: "AI Monitoring",
    shortLabel: "AI",
    summary: "Track AI work sessions, outputs, decisions, and follow-up actions.",
    operatingView: "A session ledger that separates durable decisions from transient chat output.",
    sourceStatus: "Obsidian and Codex history to be inventoried before ingestion.",
    sensitivity: "private",
    status: "inventory",
    nextStep: "Define session metadata and what stays in notes versus dashboard state.",
    workflows: [
      "Daily AI work log with project, tool, outcome, and follow-up status.",
      "Decision register for choices that should survive beyond one chat thread.",
      "Review queue for outputs that need implementation, verification, or archival."
    ],
    sources: [
      {
        label: "Codex thread history",
        status: "candidate",
        detail: "Use as review context only until a durable export shape is approved."
      },
      {
        label: "Obsidian AI notes",
        status: "needs-inventory",
        detail: "Folder names, note templates, and retention rules are not mapped yet."
      }
    ],
    privacyBoundary: "Do not persist raw chat transcripts or account tokens in the dashboard.",
    blockedUntil: "Session metadata, retention policy, and redaction rules are explicit."
  },
  {
    slug: "notes-docs",
    label: "Notes and Docs",
    shortLabel: "Notes",
    summary: "Connect durable notes, active documents, thoughts, and reference material.",
    operatingView: "A read-only index of active notes, durable docs, and source-of-truth locations.",
    sourceStatus: "Obsidian vault structure not yet mapped.",
    sensitivity: "private",
    status: "inventory",
    nextStep: "Inventory vault folders and choose read-only versus export-backed sync.",
    workflows: [
      "Surface current working notes without moving their source of truth.",
      "Separate evergreen references from active project drafts and personal thoughts.",
      "Flag stale docs that need archive, promotion, or deletion decisions."
    ],
    sources: [
      {
        label: "Obsidian vault",
        status: "needs-inventory",
        detail: "Candidate folders should be listed before any local file scanning is added."
      },
      {
        label: "GitHub docs index",
        status: "candidate",
        detail: "Existing docs sync can inform project docs but should not absorb private notes."
      }
    ],
    privacyBoundary: "Start read-only. Do not copy private notes into Supabase without a storage decision.",
    blockedUntil: "Vault root, folder taxonomy, and sync direction are documented."
  },
  {
    slug: "finance",
    label: "Finance",
    shortLabel: "Finance",
    summary: "Summarize finances with clean graphs and strategic review surfaces.",
    operatingView: "A high-level planning surface for aggregates, not account-level transaction storage.",
    sourceStatus: "No accounts, balances, or transactions collected in this slice.",
    sensitivity: "sensitive",
    status: "blocked",
    nextStep: "Decide local-only, manual summary, or external-account integration boundaries.",
    workflows: [
      "Monthly summary snapshot with manually entered totals if approved later.",
      "Goal and runway views that avoid exposing raw transactions by default.",
      "Integration decision record before any bank, spreadsheet, or app connection."
    ],
    sources: [
      {
        label: "Manual monthly summary",
        status: "candidate",
        detail: "Lowest-risk starting point after the privacy model is approved."
      },
      {
        label: "External finance tools",
        status: "blocked",
        detail: "No account integrations until credentials, storage, and deletion rules are written."
      }
    ],
    privacyBoundary: "No balances, transactions, account identifiers, or credentials in this phase.",
    blockedUntil: "Finance storage, access, redaction, and backup rules are approved."
  },
  {
    slug: "family",
    label: "Family",
    shortLabel: "Family",
    summary: "Keep relationship context, notes, important dates, and care reminders organized.",
    operatingView: "A private reminder and relationship-context layer with strict data minimization.",
    sourceStatus: "No family profile data collected in this slice.",
    sensitivity: "sensitive",
    status: "blocked",
    nextStep: "Define what belongs in private notes before any dashboard persistence.",
    workflows: [
      "Important dates and reminders after a minimal-field policy exists.",
      "Context notes that remain in Obsidian unless intentionally promoted.",
      "Care or follow-up prompts with no unnecessary sensitive detail."
    ],
    sources: [
      {
        label: "Private notes",
        status: "blocked",
        detail: "Do not scan or import until consent, minimization, and edit/delete rules are clear."
      },
      {
        label: "Calendar reminders",
        status: "candidate",
        detail: "Could become metadata-only if a calendar integration is approved later."
      }
    ],
    privacyBoundary: "No personal profiles, health details, or relationship notes in dashboard storage yet.",
    blockedUntil: "A minimization policy and delete workflow exist."
  },
  {
    slug: "jobs",
    label: "Jobs and Applications",
    shortLabel: "Jobs",
    summary: "Track job history, applications, opportunities, and supporting materials.",
    operatingView: "A pipeline board for opportunities, stages, materials, and follow-up dates.",
    sourceStatus: "Historical sources and active pipeline are not yet connected.",
    sensitivity: "private",
    status: "planned",
    nextStep: "Model application stages, source documents, and archive rules.",
    workflows: [
      "Active opportunity list with status, owner action, and next follow-up.",
      "Document checklist for resume, portfolio, cover letter, and notes.",
      "Archive lane for past roles and applications after source locations are known."
    ],
    sources: [
      {
        label: "Application materials",
        status: "needs-inventory",
        detail: "File locations and naming conventions need mapping before indexing."
      },
      {
        label: "Opportunity notes",
        status: "needs-inventory",
        detail: "Likely Obsidian-backed, but source-of-truth is not confirmed."
      }
    ],
    privacyBoundary: "No employer contacts, compensation details, or application documents ingested yet.",
    blockedUntil: "Pipeline stages and archive rules are defined."
  },
  {
    slug: "travel",
    label: "Travel",
    shortLabel: "Travel",
    summary: "Plan trips with itinerary state, map-ready locations, bookings, and constraints.",
    operatingView: "A trip command board that can later feed map and globe views.",
    sourceStatus: "Trip notes and booking confirmations need source inventory.",
    sensitivity: "private",
    status: "planned",
    nextStep: "Start with a read-only trip index before map or globe implementation.",
    workflows: [
      "Trip index with dates, route status, lodging status, and constraint flags.",
      "Map-ready stop list after location source and privacy rules are known.",
      "Booking confirmation checklist that references sources without storing secrets."
    ],
    sources: [
      {
        label: "Trip notes",
        status: "needs-inventory",
        detail: "Obsidian or document artifacts can seed the first read-only trip index."
      },
      {
        label: "Booking confirmations",
        status: "candidate",
        detail: "Metadata-only references are acceptable later; confirmation numbers stay out."
      }
    ],
    privacyBoundary: "No live location, confirmation numbers, payment details, or private address data.",
    blockedUntil: "Trip source inventory and location redaction rules are documented."
  },
  {
    slug: "university-notes",
    label: "University Notes",
    shortLabel: "University",
    summary: "Expose past coursework, notes, and reference material as searchable context.",
    operatingView: "A curated archive browser for coursework and reusable reference material.",
    sourceStatus: "Archive location and folder taxonomy not yet confirmed.",
    sensitivity: "reference",
    status: "inventory",
    nextStep: "Identify archive roots and decide whether this is search-only or curated.",
    workflows: [
      "Course index grouped by term, class, and topic.",
      "Reusable reference highlights promoted into the broader notes system.",
      "Archive cleanup queue for duplicate or obsolete material."
    ],
    sources: [
      {
        label: "Course archive",
        status: "needs-inventory",
        detail: "Root folder and file types need confirmation."
      },
      {
        label: "Reference notes",
        status: "candidate",
        detail: "Good candidate for read-only search before any structured persistence."
      }
    ],
    privacyBoundary: "Avoid ingesting grades, student records, or third-party personal information.",
    blockedUntil: "Archive roots and allowed file categories are listed."
  },
  {
    slug: "related-systems",
    label: "Related Systems",
    shortLabel: "Systems",
    summary: "Reserve space for other personal tools that should connect later.",
    operatingView: "A triage shelf for repeated workflows before they deserve a first-class module.",
    sourceStatus: "No external applications connected in this slice.",
    sensitivity: "private",
    status: "planned",
    nextStep: "Promote only after a real workflow repeats enough to deserve a module.",
    workflows: [
      "Capture candidate systems without committing to integrations too early.",
      "Track why a workflow should become a module and what data it would need.",
      "Retire placeholders that do not produce repeated operational value."
    ],
    sources: [
      {
        label: "Future app inventory",
        status: "candidate",
        detail: "Airtable, calendars, files, or other tools can be evaluated one by one."
      },
      {
        label: "Manual workflow notes",
        status: "needs-inventory",
        detail: "Only promote after a repeated workflow is visible."
      }
    ],
    privacyBoundary: "No new external app connections without an integration-specific review.",
    blockedUntil: "A repeated workflow and source owner are identified."
  }
];

export const PERSONAL_SYSTEM_GUARDRAILS = [
  "Founder-only admin surface attached to the existing command center.",
  "No new public routes, auth middleware, or production network calls in the first slice.",
  "No sensitive finance, family, or job data ingestion until storage and privacy rules are explicit.",
  "Obsidian remains a source-of-truth candidate; sync direction must be chosen per domain."
];

export function getPersonalSystemDomain(slug: string) {
  return PERSONAL_SYSTEM_DOMAINS.find((domain) => domain.slug === slug) || null;
}
