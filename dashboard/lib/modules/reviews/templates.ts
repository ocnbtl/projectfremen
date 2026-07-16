import type { ModuleId } from "../../native-objects/types";
import type {
  ReviewCadence,
  ReviewChecklistAction,
  ReviewContextRelationship
} from "./types";

export type ReviewTemplateEvidenceDefinition = {
  id: string;
  title: string;
  description: string;
  required: boolean;
  blocksCompletion: boolean;
  ownerModule: ModuleId;
  allowedSourceModules: ModuleId[];
  relationship: ReviewContextRelationship;
};

export type ReviewTemplateChecklistDefinition = {
  id: string;
  label: string;
  description: string;
  required: boolean;
  ownerModule?: ModuleId;
  action: ReviewChecklistAction;
  carryForwardAllowed: boolean;
  waiverAllowed: boolean;
  evidence?: ReviewTemplateEvidenceDefinition;
};

export type ReviewTemplateDefinition = {
  id: string;
  version: number;
  cadence: ReviewCadence;
  title: string;
  checklist: readonly ReviewTemplateChecklistDefinition[];
};

const WEEKLY_CHECKLIST = [
  {
    id: "top-outcomes",
    label: "Top outcomes captured",
    description: "Summarize the week's wins and most important outcomes.",
    required: true,
    ownerModule: "personal_ops",
    action: "open",
    carryForwardAllowed: false,
    waiverAllowed: false
  },
  {
    id: "finance-snapshot",
    label: "Finance snapshot linked",
    description: "Link source evidence for the weekly Finance context; Reviews does not copy ledger facts.",
    required: true,
    ownerModule: "finance",
    action: "link",
    carryForwardAllowed: true,
    waiverAllowed: true,
    evidence: {
      id: "weekly-finance-snapshot",
      title: "Weekly Finance snapshot",
      description: "A Finance-owned snapshot or source record supporting the weekly review.",
      required: true,
      blocksCompletion: true,
      ownerModule: "finance",
      allowedSourceModules: ["finance"],
      relationship: "evidence"
    }
  },
  {
    id: "people-followups",
    label: "People follow-ups reviewed",
    description: "Review cadence risk and linked follow-up context without copying People records.",
    required: true,
    ownerModule: "people",
    action: "review",
    carryForwardAllowed: true,
    waiverAllowed: false
  },
  {
    id: "project-blockers",
    label: "Project blockers triaged",
    description: "Review linked Project blockers and assign their next route.",
    required: true,
    ownerModule: "projects",
    action: "resolve",
    carryForwardAllowed: true,
    waiverAllowed: false
  },
  {
    id: "goal-progress",
    label: "Goal progress reviewed",
    description: "Inspect Current Goals and key-result context through Personal Ops.",
    required: true,
    ownerModule: "personal_ops",
    action: "open",
    carryForwardAllowed: true,
    waiverAllowed: false
  },
  {
    id: "notes-reviewed",
    label: "Notes reviewed",
    description: "Scan linked authored knowledge and candidate decisions.",
    required: false,
    ownerModule: "notes",
    action: "open",
    carryForwardAllowed: true,
    waiverAllowed: true
  },
  {
    id: "resources-cleanup",
    label: "Resources cleanup checked",
    description: "Review linked external sources that need lifecycle attention.",
    required: false,
    ownerModule: "resources",
    action: "carry_forward",
    carryForwardAllowed: true,
    waiverAllowed: true
  },
  {
    id: "decisions-filed",
    label: "Decisions filed",
    description: "Resolve every required candidate into a durable destination or structured carry-forward.",
    required: true,
    ownerModule: "personal_ops",
    action: "file",
    carryForwardAllowed: true,
    waiverAllowed: false
  },
  {
    id: "followups-scheduled",
    label: "Follow-ups scheduled",
    description: "Create or explicitly carry every required actionable follow-up.",
    required: true,
    ownerModule: "personal_ops",
    action: "create_followup",
    carryForwardAllowed: true,
    waiverAllowed: false
  },
  {
    id: "carry-forward-confirmed",
    label: "Carry-forward confirmed",
    description: "Assign destination, owner, reason, and next action for unresolved review findings.",
    required: true,
    ownerModule: "reviews",
    action: "carry_forward",
    carryForwardAllowed: false,
    waiverAllowed: false
  }
] as const satisfies readonly ReviewTemplateChecklistDefinition[];

const MONTHLY_CHECKLIST = [
  {
    id: "finance-close-reviewed",
    label: "Finance close reviewed",
    description: "Review the Finance-owned close state and linked source evidence.",
    required: true,
    ownerModule: "finance",
    action: "reconcile",
    carryForwardAllowed: false,
    waiverAllowed: false,
    evidence: {
      id: "monthly-finance-close",
      title: "Finance close source",
      description: "A Finance-owned close snapshot or source record; Review-local checks never close Finance.",
      required: true,
      blocksCompletion: true,
      ownerModule: "finance",
      allowedSourceModules: ["finance"],
      relationship: "evidence"
    }
  },
  {
    id: "budget-overages-reviewed",
    label: "Budget overages reviewed",
    description: "Review linked Finance variance sources and route unresolved decisions.",
    required: true,
    ownerModule: "finance",
    action: "review",
    carryForwardAllowed: true,
    waiverAllowed: false
  },
  {
    id: "bills-subscriptions-audited",
    label: "Bills and subscriptions audited",
    description: "Link Finance-owned bill and subscription evidence before resolving the check.",
    required: true,
    ownerModule: "finance",
    action: "link",
    carryForwardAllowed: true,
    waiverAllowed: true,
    evidence: {
      id: "monthly-bills-subscriptions",
      title: "Bill and subscription review evidence",
      description: "Finance-owned bill or subscription sources supporting the monthly audit.",
      required: true,
      blocksCompletion: true,
      ownerModule: "finance",
      allowedSourceModules: ["finance", "media"],
      relationship: "evidence"
    }
  },
  {
    id: "savings-movement-confirmed",
    label: "Savings movement confirmed",
    description: "Confirm against the Finance-owned transfer; proposal and actual movement remain separate.",
    required: true,
    ownerModule: "finance",
    action: "file",
    carryForwardAllowed: true,
    waiverAllowed: false,
    evidence: {
      id: "monthly-savings-movement",
      title: "Savings movement proof",
      description: "Finance-owned evidence for the actual transfer or savings movement.",
      required: true,
      blocksCompletion: true,
      ownerModule: "finance",
      allowedSourceModules: ["finance", "media"],
      relationship: "evidence"
    }
  },
  {
    id: "project-blockers-rolled-forward",
    label: "Project blockers rolled forward",
    description: "Preserve Project ownership while routing unresolved blockers into the next period.",
    required: true,
    ownerModule: "projects",
    action: "carry_forward",
    carryForwardAllowed: true,
    waiverAllowed: false
  },
  {
    id: "current-goals-checked",
    label: "Current Goals checked",
    description: "Review Current Goals through Personal Ops and link source evidence when required.",
    required: true,
    ownerModule: "personal_ops",
    action: "open",
    carryForwardAllowed: true,
    waiverAllowed: false,
    evidence: {
      id: "monthly-goal-progress",
      title: "Current Goals progress evidence",
      description: "Personal Ops-owned Goal or Key Result evidence supporting the monthly check.",
      required: true,
      blocksCompletion: true,
      ownerModule: "personal_ops",
      allowedSourceModules: ["personal_ops"],
      relationship: "evidence"
    }
  },
  {
    id: "people-followups-reviewed",
    label: "People follow-ups reviewed",
    description: "Review People cadence context and Personal Ops follow-through links.",
    required: true,
    ownerModule: "people",
    action: "review",
    carryForwardAllowed: true,
    waiverAllowed: false
  },
  {
    id: "notes-review-processed",
    label: "Notes needing review processed",
    description: "Inspect linked authored knowledge without copying Note bodies.",
    required: false,
    ownerModule: "notes",
    action: "open",
    carryForwardAllowed: true,
    waiverAllowed: true
  },
  {
    id: "resources-cleanup-checked",
    label: "Resources cleanup checked",
    description: "Review external-source lifecycle and route cleanup work to Resources.",
    required: false,
    ownerModule: "resources",
    action: "carry_forward",
    carryForwardAllowed: true,
    waiverAllowed: true
  },
  {
    id: "media-review-checked",
    label: "Media needs-review queue checked",
    description: "Link Media-owned evidence and route metadata work without copying files.",
    required: false,
    ownerModule: "media",
    action: "link",
    carryForwardAllowed: true,
    waiverAllowed: true,
    evidence: {
      id: "monthly-media-review",
      title: "Media review evidence",
      description: "Optional Media-owned evidence supporting the monthly review.",
      required: false,
      blocksCompletion: false,
      ownerModule: "media",
      allowedSourceModules: ["media"],
      relationship: "evidence"
    }
  },
  {
    id: "decisions-filed",
    label: "Decisions filed",
    description: "Resolve required review candidates into durable Personal Ops or native-module destinations.",
    required: true,
    ownerModule: "personal_ops",
    action: "file",
    carryForwardAllowed: true,
    waiverAllowed: false
  },
  {
    id: "carry-forward-assigned",
    label: "Carry-forward assigned",
    description: "Every unresolved item needs a destination, owner, reason, and next action.",
    required: true,
    ownerModule: "reviews",
    action: "carry_forward",
    carryForwardAllowed: false,
    waiverAllowed: false
  },
  {
    id: "next-month-priorities-drafted",
    label: "Next month priorities drafted",
    description: "Save the next-focus summary or link a Personal Ops Goal destination.",
    required: true,
    ownerModule: "personal_ops",
    action: "draft",
    carryForwardAllowed: false,
    waiverAllowed: true
  }
] as const satisfies readonly ReviewTemplateChecklistDefinition[];

export const REVIEW_TEMPLATES: Readonly<Record<ReviewCadence, ReviewTemplateDefinition>> = {
  weekly: {
    id: "reviews-weekly-v1",
    version: 1,
    cadence: "weekly",
    title: "Weekly Review",
    checklist: WEEKLY_CHECKLIST
  },
  monthly: {
    id: "reviews-monthly-v1",
    version: 1,
    cadence: "monthly",
    title: "Monthly Review",
    checklist: MONTHLY_CHECKLIST
  }
};

export const REVIEW_DECISION_READINESS_CHECKS = [
  "Finance decisions filed",
  "Budget variance decisions resolved",
  "Carry-forward destinations selected",
  "Project blockers assigned",
  "Personal Ops decisions created",
  "Evidence linked to high-risk decisions",
  "Waived decisions have reasons",
  "Deferred decisions have review dates",
  "Monthly decision summary saved"
] as const;

export function getReviewTemplate(cadence: ReviewCadence): ReviewTemplateDefinition {
  return REVIEW_TEMPLATES[cadence];
}

