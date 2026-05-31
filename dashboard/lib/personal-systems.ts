export type PersonalSystemSensitivity = "reference" | "private" | "sensitive";

export type PersonalSystemDomain = {
  slug: string;
  label: string;
  summary: string;
  sourceStatus: string;
  sensitivity: PersonalSystemSensitivity;
  nextStep: string;
};

export const PERSONAL_SYSTEM_DOMAINS: PersonalSystemDomain[] = [
  {
    slug: "ai-monitoring",
    label: "AI Monitoring",
    summary: "Track AI work sessions, outputs, decisions, and follow-up actions.",
    sourceStatus: "Obsidian and Codex history to be inventoried before ingestion.",
    sensitivity: "private",
    nextStep: "Define session metadata and what stays in notes versus dashboard state."
  },
  {
    slug: "notes-docs",
    label: "Notes and Docs",
    summary: "Connect durable notes, active documents, thoughts, and reference material.",
    sourceStatus: "Obsidian vault structure not yet mapped.",
    sensitivity: "private",
    nextStep: "Inventory vault folders and choose read-only versus export-backed sync."
  },
  {
    slug: "finance",
    label: "Finance",
    summary: "Summarize finances with clean graphs and strategic review surfaces.",
    sourceStatus: "No accounts, balances, or transactions collected in this slice.",
    sensitivity: "sensitive",
    nextStep: "Decide local-only, manual summary, or external-account integration boundaries."
  },
  {
    slug: "family",
    label: "Family",
    summary: "Keep relationship context, notes, important dates, and care reminders organized.",
    sourceStatus: "No family profile data collected in this slice.",
    sensitivity: "sensitive",
    nextStep: "Define what belongs in private notes before any dashboard persistence."
  },
  {
    slug: "jobs",
    label: "Jobs and Applications",
    summary: "Track job history, applications, opportunities, and supporting materials.",
    sourceStatus: "Historical sources and active pipeline are not yet connected.",
    sensitivity: "private",
    nextStep: "Model application stages, source documents, and archive rules."
  },
  {
    slug: "travel",
    label: "Travel",
    summary: "Plan trips with itinerary state, map-ready locations, bookings, and constraints.",
    sourceStatus: "Trip notes and booking confirmations need source inventory.",
    sensitivity: "private",
    nextStep: "Start with a read-only trip index before map or globe implementation."
  },
  {
    slug: "university-notes",
    label: "University Notes",
    summary: "Expose past coursework, notes, and reference material as searchable context.",
    sourceStatus: "Archive location and folder taxonomy not yet confirmed.",
    sensitivity: "reference",
    nextStep: "Identify archive roots and decide whether this is search-only or curated."
  },
  {
    slug: "related-systems",
    label: "Related Systems",
    summary: "Reserve space for other personal tools that should connect later.",
    sourceStatus: "No external applications connected in this slice.",
    sensitivity: "private",
    nextStep: "Promote only after a real workflow repeats enough to deserve a module."
  }
];

export const PERSONAL_SYSTEM_GUARDRAILS = [
  "Founder-only admin surface attached to the existing command center.",
  "No new public routes, auth middleware, or production network calls in the first slice.",
  "No sensitive finance, family, or job data ingestion until storage and privacy rules are explicit.",
  "Obsidian remains a source-of-truth candidate; sync direction must be chosen per domain."
];
