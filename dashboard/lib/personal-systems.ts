export type PersonalSystemSensitivity = "reference" | "private" | "sensitive";
export type PersonalSystemStatus = "active" | "designing" | "guarded";

export type PersonalSystemField = {
  label: string;
  status: "ready" | "planned" | "guarded";
  detail: string;
};

export type PersonalSystemDomain = {
  slug: string;
  label: string;
  shortLabel: string;
  summary: string;
  operatingView: string;
  systemStatus: string;
  sensitivity: PersonalSystemSensitivity;
  status: PersonalSystemStatus;
  nextStep: string;
  workflows: string[];
  fields: PersonalSystemField[];
  privacyBoundary: string;
  dataBoundary: string;
};

export const PERSONAL_SYSTEM_DOMAINS: PersonalSystemDomain[] = [
  {
    slug: "ai-monitoring",
    label: "AI Monitoring",
    shortLabel: "AI",
    summary: "Track AI work sessions, outputs, decisions, and follow-up actions inside Unigentamos.",
    operatingView: "A session ledger that separates durable decisions from transient chat output.",
    systemStatus: "Native records are ready for session notes, decisions, and follow-ups.",
    sensitivity: "private",
    status: "active",
    nextStep: "Start recording durable AI decisions and implementation follow-ups.",
    workflows: [
      "Daily AI work log with project, tool, outcome, and follow-up status.",
      "Decision register for choices that should survive beyond one chat thread.",
      "Review queue for outputs that need implementation, verification, or archival."
    ],
    fields: [
      {
        label: "Session summary",
        status: "ready",
        detail: "Store the useful result, decision, or follow-up, not the raw transcript."
      },
      {
        label: "Related domains",
        status: "ready",
        detail: "Link an AI record to travel, jobs, notes, or project work when it overlaps."
      }
    ],
    privacyBoundary: "Do not persist raw chat transcripts or account tokens in the dashboard.",
    dataBoundary: "Keep records short, outcome-oriented, and safe to resurface later."
  },
  {
    slug: "notes-docs",
    label: "Notes and Docs",
    shortLabel: "Notes",
    summary: "Create durable notes, active documents, thoughts, and reference material.",
    operatingView: "A native note workspace where records can overlap with every other domain.",
    systemStatus: "Native note records are ready for capture and cross-domain linking.",
    sensitivity: "private",
    status: "active",
    nextStep: "Use this as the default capture lane for durable notes and reusable context.",
    workflows: [
      "Capture current working notes directly in the system.",
      "Separate evergreen references from active project drafts and personal thoughts.",
      "Flag stale docs that need archive, promotion, or deletion decisions."
    ],
    fields: [
      {
        label: "Note body",
        status: "ready",
        detail: "Long-form text is stored on the record and can be linked to other domains."
      },
      {
        label: "Link or file reference",
        status: "ready",
        detail: "Store a URL or plain file reference when the record points at a document."
      }
    ],
    privacyBoundary: "Private notes stay behind the existing admin session and CSRF protection.",
    dataBoundary: "This is the source of truth for new notes created in the website."
  },
  {
    slug: "finance",
    label: "Finance",
    shortLabel: "Finance",
    summary: "Summarize finances with clean graphs, manual snapshots, and strategic review surfaces.",
    operatingView: "A high-level planning surface for aggregates, not account-level transaction storage.",
    systemStatus: "Manual aggregate records are allowed; account integrations remain out of scope.",
    sensitivity: "sensitive",
    status: "guarded",
    nextStep: "Capture only manual summaries, goals, and decisions until detailed rules exist.",
    workflows: [
      "Monthly summary snapshot with manually entered totals.",
      "Goal and runway views that avoid exposing raw transactions by default.",
      "Integration decision record before any bank, spreadsheet, or app connection."
    ],
    fields: [
      {
        label: "Manual monthly summary",
        status: "ready",
        detail: "Use record text for aggregate summaries, decisions, and review notes."
      },
      {
        label: "Account-level detail",
        status: "guarded",
        detail: "Avoid account numbers, raw transactions, credentials, and confirmation codes."
      }
    ],
    privacyBoundary: "No credentials, account identifiers, or raw transaction feeds.",
    dataBoundary: "Finance records should be manual, summarized, and intentionally sparse."
  },
  {
    slug: "family",
    label: "Family",
    shortLabel: "Family",
    summary: "Keep relationship context, important dates, and care reminders organized.",
    operatingView: "A private reminder and relationship-context layer with strict data minimization.",
    systemStatus: "Minimal private records are allowed when they are useful and respectful.",
    sensitivity: "sensitive",
    status: "guarded",
    nextStep: "Start with dates, reminders, and lightweight context instead of broad profiles.",
    workflows: [
      "Important dates and reminders with minimal personal detail.",
      "Context notes that support better follow-through.",
      "Care or follow-up prompts with no unnecessary sensitive detail."
    ],
    fields: [
      {
        label: "Reminder context",
        status: "ready",
        detail: "Store only what helps you act thoughtfully later."
      },
      {
        label: "Sensitive profile detail",
        status: "guarded",
        detail: "Avoid medical, legal, or highly personal details unless a stricter model exists."
      }
    ],
    privacyBoundary: "Minimize private details and avoid storing information that does not serve a clear purpose.",
    dataBoundary: "Records should be editable, concise, and easy to archive."
  },
  {
    slug: "jobs",
    label: "Jobs and Applications",
    shortLabel: "Jobs",
    summary: "Track job history, applications, opportunities, and supporting materials.",
    operatingView: "A pipeline board for opportunities, stages, materials, and follow-up dates.",
    systemStatus: "Native records are ready for opportunities, materials, and follow-ups.",
    sensitivity: "private",
    status: "active",
    nextStep: "Use records for active opportunities and next follow-up actions.",
    workflows: [
      "Active opportunity list with status, owner action, and next follow-up.",
      "Document checklist for resume, portfolio, cover letter, and notes.",
      "Archive lane for past roles and applications after source locations are known."
    ],
    fields: [
      {
        label: "Opportunity record",
        status: "ready",
        detail: "Track company, role, stage, follow-up, and supporting notes in one record."
      },
      {
        label: "Material reference",
        status: "ready",
        detail: "Link to a resume, portfolio, or document reference without uploading files yet."
      }
    ],
    privacyBoundary: "Avoid sensitive compensation or employer contact details unless needed.",
    dataBoundary: "Jobs records live in the website and can be linked to notes/docs."
  },
  {
    slug: "travel",
    label: "Travel",
    shortLabel: "Travel",
    summary: "Plan trips with itinerary state, map-ready locations, bookings, and constraints.",
    operatingView: "A trip command board for itineraries, constraints, stops, and booking tasks.",
    systemStatus: "Native records are ready for trip plans, stops, constraints, and checklists.",
    sensitivity: "private",
    status: "active",
    nextStep: "Create trip records first; map and globe views can read from those records later.",
    workflows: [
      "Trip index with dates, route status, lodging status, and constraint flags.",
      "Map-ready stop list after location source and privacy rules are known.",
      "Booking confirmation checklist that references sources without storing secrets."
    ],
    fields: [
      {
        label: "Trip or stop record",
        status: "ready",
        detail: "Store dates, places, constraints, and next actions as native records."
      },
      {
        label: "Booking reference",
        status: "guarded",
        detail: "Use metadata-only references; keep confirmation numbers and payment details out."
      }
    ],
    privacyBoundary: "No live location, confirmation numbers, payment details, or private address data.",
    dataBoundary: "Travel records are dashboard-native and can later power a map view."
  },
  {
    slug: "university-notes",
    label: "University Notes",
    shortLabel: "University",
    summary: "Capture coursework, notes, and reference material as searchable context.",
    operatingView: "A curated archive browser for coursework and reusable reference material.",
    systemStatus: "Native archive records are ready for course notes and references.",
    sensitivity: "reference",
    status: "designing",
    nextStep: "Create curated course/reference records before adding search or file upload.",
    workflows: [
      "Course index grouped by term, class, and topic.",
      "Reusable reference highlights promoted into the broader notes system.",
      "Archive cleanup queue for duplicate or obsolete material."
    ],
    fields: [
      {
        label: "Course note",
        status: "ready",
        detail: "Store class, topic, and durable reference notes directly."
      },
      {
        label: "File attachment",
        status: "planned",
        detail: "File upload can come later after the record model is stable."
      }
    ],
    privacyBoundary: "Avoid ingesting grades, student records, or third-party personal information.",
    dataBoundary: "Curated notes live here; raw archive imports wait until upload rules exist."
  },
  {
    slug: "related-systems",
    label: "Related Systems",
    shortLabel: "Systems",
    summary: "Reserve space for other personal tools that should connect later.",
    operatingView: "A triage shelf for repeated workflows before they deserve a first-class module.",
    systemStatus: "Native records are ready for candidate workflows and system ideas.",
    sensitivity: "private",
    status: "designing",
    nextStep: "Promote only after a real workflow repeats enough to deserve a module.",
    workflows: [
      "Capture candidate systems without committing to integrations too early.",
      "Track why a workflow should become a module and what data it would need.",
      "Retire placeholders that do not produce repeated operational value."
    ],
    fields: [
      {
        label: "Candidate system",
        status: "ready",
        detail: "Record repeated workflows and promote them only when they prove useful."
      },
      {
        label: "External app integration",
        status: "planned",
        detail: "Any connector gets a separate safety review before implementation."
      }
    ],
    privacyBoundary: "No new external app connections without an integration-specific review.",
    dataBoundary: "This module tracks future candidates; it is not an integration layer yet."
  }
];

export const PERSONAL_SYSTEM_GUARDRAILS = [
  "Founder-only admin surface attached to the existing command center.",
  "No new auth middleware, public endpoints, or production network calls for Personal Ops records.",
  "Personal Ops records use the existing app_state persistence layer.",
  "Sensitive domains use manual, minimized records until a stricter model is needed."
];

export function getPersonalSystemDomain(slug: string) {
  return PERSONAL_SYSTEM_DOMAINS.find((domain) => domain.slug === slug) || null;
}
