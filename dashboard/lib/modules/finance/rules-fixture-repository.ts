import { createNativeObjectRef } from "../../native-objects/routes";
import type {
  FinanceRule,
  FinanceRuleAction,
  FinanceRuleCondition,
  FinanceRuleTestCase,
  FinanceRulesFixtureRepository
} from "./types";

const condition = (
  id: string,
  field: FinanceRuleCondition["field"],
  operator: FinanceRuleCondition["operator"],
  label: string,
  value?: FinanceRuleCondition["value"]
): FinanceRuleCondition => ({
  id,
  field,
  operator,
  label,
  ...(value !== undefined ? { value } : {}),
  required: true
});

const action = (
  id: string,
  label: string,
  destination: FinanceRuleAction["destination"],
  approvalRequired = false,
  mutationLevel: FinanceRuleAction["mutationLevel"] = "flag_only"
): FinanceRuleAction => ({
  id,
  label,
  destination,
  approvalRequired,
  mutationLevel
});

const test = (
  id: string,
  label: string,
  input: FinanceRuleTestCase["input"],
  expectedActionIds: readonly string[]
): FinanceRuleTestCase => ({
  id,
  label,
  input,
  expectedActionIds
});

const financeRef = (objectType: string, objectId: string, label: string) =>
  createNativeObjectRef({
    module: "finance",
    objectType,
    objectId,
    label
  });

const projectRef = (objectId: string, label: string) =>
  createNativeObjectRef({
    module: "projects",
    objectType: "project",
    objectId,
    label
  });

const rules: readonly FinanceRule[] = [
  {
    id: "RULE-CAT-APPLE",
    name: "Merchant contains Apple",
    description: "Suggest Studio & Tools and require receipt evidence for Apple purchases.",
    type: "categorization",
    scope: "Transactions",
    trigger: "Merchant contains Apple",
    mode: "auto",
    health: "stable",
    enabled: true,
    requiresApproval: false,
    capabilities: ["categorization", "receipts"],
    linkedObjects: [financeRef("transaction", "TX-7741", "Apple Store · TX-7741")],
    generatedCloseBlockers: 0,
    lastEventAt: "2026-06-12T13:40:00-04:00",
    nextAction: "Review receipt",
    conditions: [condition("apple-merchant", "merchant", "contains", "Merchant contains Apple", "Apple")],
    actions: [
      action("suggest-studio-tools", "Suggest Studio & Tools", "finance"),
      action("request-apple-receipt", "Flag missing receipt evidence", "media")
    ],
    tests: [
      test("apple-match", "Apple Store purchase", { merchant: "Apple Store" }, ["suggest-studio-tools", "request-apple-receipt"]),
      test("apple-no-match", "Unrelated merchant", { merchant: "Figma" }, [])
    ],
    guardrails: ["Never mark a transaction reviewed.", "Never attach fabricated receipt evidence."],
    failureMode: "Accessory and subscription purchases may need a different category.",
    activity: [
      { id: "ACT-RULE-CAT-APPLE", occurredAt: "2026-06-12T13:40:00-04:00", action: "fixture_defined", summary: "Read-only rule fixture normalized from the approved Finance design." }
    ]
  },
  {
    id: "RULE-CAT-FREMEN-TRAVEL",
    name: "Delta / Uber during Project Fremen travel",
    description: "Suggest Travel, preserve Project Fremen context, and surface budget review.",
    type: "categorization",
    scope: "Project-linked transactions",
    trigger: "Delta or Uber with Project Fremen context",
    mode: "suggest",
    health: "stable",
    enabled: true,
    requiresApproval: false,
    capabilities: ["categorization", "project_linked"],
    linkedObjects: [
      financeRef("transaction", "TX-7736", "Delta Air Lines · TX-7736"),
      financeRef("transaction", "TX-7733", "Uber · TX-7733"),
      projectRef("fremen", "Project Fremen")
    ],
    generatedCloseBlockers: 0,
    lastEventAt: "2026-06-12T12:20:00-04:00",
    nextAction: "Confirm project context",
    conditions: [
      condition("fremen-travel-category", "category", "equals", "Category is Travel", "Travel"),
      condition("fremen-travel-project", "projectLinked", "is_true", "Project context is linked")
    ],
    actions: [
      action("suggest-travel-category", "Suggest Travel category", "finance"),
      action("preserve-project-link", "Preserve Project reference", "projects"),
      action("flag-budget-review", "Flag budget review", "finance")
    ],
    tests: [
      test("fremen-travel-linked", "Project-linked travel", { category: "Travel", projectLinked: true }, ["suggest-travel-category", "preserve-project-link", "flag-budget-review"]),
      test("fremen-travel-unlinked", "Travel without project context", { category: "Travel", projectLinked: false }, [])
    ],
    guardrails: ["Never reclassify a Project.", "Never create a Project-owned task."],
    failureMode: "A trip can be personal, reimbursable, or linked to another Project.",
    activity: [
      { id: "ACT-RULE-CAT-FREMEN-TRAVEL", occurredAt: "2026-06-12T12:20:00-04:00", action: "fixture_defined", summary: "Fixture rule preserves Project ownership through a reference." }
    ]
  },
  {
    id: "RULE-REC-AWS",
    name: "AWS monthly charge",
    description: "Detect an AWS recurring candidate and request bill evidence.",
    type: "recurrence",
    scope: "Bills & subscriptions",
    trigger: "AWS repeats monthly",
    mode: "suggest",
    health: "needs_review",
    enabled: true,
    requiresApproval: false,
    capabilities: ["receipts", "recurring"],
    linkedObjects: [
      financeRef("bill", "aws", "AWS bill"),
      financeRef("transaction", "TX-7738", "AWS · TX-7738")
    ],
    generatedCloseBlockers: 0,
    lastEventAt: "2026-06-12T11:45:00-04:00",
    nextAction: "Verify canonical payment account",
    conditions: [
      condition("aws-merchant", "merchant", "contains", "Merchant contains AWS", "AWS"),
      condition("aws-occurrences", "recurringOccurrences", "greater_than_or_equal", "At least two recurring occurrences", 2)
    ],
    actions: [
      action("suggest-aws-subscription", "Suggest subscription candidate", "finance", false, "draft_record"),
      action("request-aws-evidence", "Request bill evidence", "media")
    ],
    tests: [
      test("aws-recurring", "Recurring AWS charge", { merchant: "AWS", recurringOccurrences: 3 }, ["suggest-aws-subscription", "request-aws-evidence"]),
      test("aws-single", "One AWS charge", { merchant: "AWS", recurringOccurrences: 1 }, [])
    ],
    guardrails: ["Never mark AWS paid.", "Never choose a payment account without evidence."],
    failureMode: "Multiple AWS accounts can share merchant text and different payment sources.",
    activity: [
      { id: "ACT-RULE-REC-AWS", occurredAt: "2026-06-12T11:45:00-04:00", action: "review_requested", summary: "Payment-account ambiguity keeps the fixture rule in Needs Review." }
    ]
  },
  {
    id: "RULE-BUDGET-110",
    name: "Forecast over 110% of cap",
    description: "Surface material budget variance in Budgets and Monthly Review, then suggest a durable decision candidate.",
    type: "budget_variance",
    scope: "Active budget categories",
    trigger: "Forecast exceeds 110% of cap",
    mode: "manual_approval",
    health: "needs_review",
    enabled: true,
    requiresApproval: true,
    capabilities: ["budget", "close", "project_linked"],
    linkedObjects: [
      financeRef("budget", "travel", "Travel budget"),
      financeRef("finance_close_check", "budget-overruns", "Review budget overruns"),
      financeRef("transaction", "TX-7736", "Delta Air Lines · TX-7736"),
      financeRef("transaction", "TX-7733", "Uber · TX-7733"),
      projectRef("fremen", "Project Fremen")
    ],
    generatedCloseBlockers: 1,
    lastEventAt: "2026-06-12T10:55:00-04:00",
    nextAction: "Review reimbursable travel exception",
    conditions: [
      condition("budget-forecast-threshold", "forecastPercent", "greater_than", "Forecast exceeds 110%", 110),
      condition("budget-current-close", "closePeriod", "is_true", "Category belongs to the current close"),
      condition("budget-not-reimbursed", "reimbursed", "is_false", "Spend is not already reimbursed")
    ],
    actions: [
      action("flag-budget-variance", "Flag category as a variance", "finance"),
      action("draft-close-blocker", "Draft Monthly Review blocker", "reviews", false, "draft_record"),
      action("suggest-decision-candidate", "Suggest Finance decision candidate", "personal_ops", true, "draft_record")
    ],
    tests: [
      test("budget-travel-over", "Travel at 142% with source context", { forecastPercent: 142, closePeriod: true, reimbursed: false }, ["flag-budget-variance", "draft-close-blocker", "suggest-decision-candidate"]),
      test("budget-saas-watch", "Software & SaaS at 104%", { forecastPercent: 104, closePeriod: true, reimbursed: false }, []),
      test("budget-reimbursed-travel", "Reimbursed travel over cap", { forecastPercent: 142, closePeriod: true, reimbursed: true }, []),
      test("budget-prior-period", "Prior-period variance", { forecastPercent: 128, closePeriod: false, reimbursed: false }, [])
    ],
    guardrails: [
      "Never change a budget cap automatically.",
      "Never reclassify Project spend.",
      "Never resolve a close blocker without explicit evidence or decision."
    ],
    failureMode: "May overfire when travel is reimbursable or already owned by a Project.",
    activity: [
      { id: "ACT-RULE-BUDGET-110-1", occurredAt: "2026-06-12T10:55:00-04:00", action: "review_requested", summary: "Fixture health set to Needs Review because reimbursable travel needs an explicit exception." },
      { id: "ACT-RULE-BUDGET-110-2", occurredAt: "2026-06-11T16:20:00-04:00", action: "test_previewed", summary: "Four deterministic fixture cases defined; no source record was mutated." }
    ]
  },
  {
    id: "RULE-SAVE-RESERVE",
    name: "Operating to Reserve transfer",
    description: "Suggest confirmation when a savings movement is proposed between Operating and Reserve.",
    type: "savings",
    scope: "Savings movements",
    trigger: "Operating → Reserve",
    mode: "manual_approval",
    health: "stable",
    enabled: true,
    requiresApproval: true,
    capabilities: ["savings"],
    linkedObjects: [
      financeRef("account", "operating", "Operating · ••4021"),
      financeRef("account", "reserve", "Reserve · ••7782")
    ],
    generatedCloseBlockers: 0,
    lastEventAt: "2026-06-11T15:10:00-04:00",
    nextAction: "Confirm movement evidence",
    conditions: [
      condition("save-from-operating", "fromAccount", "equals", "Source is Operating", "Operating"),
      condition("save-to-reserve", "toAccount", "equals", "Destination is Reserve", "Reserve")
    ],
    actions: [
      action("request-savings-confirmation", "Request savings confirmation", "finance", true, "source_mutation")
    ],
    tests: [
      test("save-canonical", "Operating to Reserve", { fromAccount: "Operating", toAccount: "Reserve" }, ["request-savings-confirmation"]),
      test("save-unrelated", "Studio Card to Operating", { fromAccount: "Studio Card", toAccount: "Operating" }, [])
    ],
    guardrails: ["Never move money.", "Never treat a proposal as actual savings movement."],
    failureMode: "Account aliases or transfers may not represent true savings movement.",
    activity: [
      { id: "ACT-RULE-SAVE-RESERVE", occurredAt: "2026-06-11T15:10:00-04:00", action: "fixture_defined", summary: "The rule distinguishes the $5,000 proposal from the $3,900 fixture movement." }
    ]
  },
  {
    id: "RULE-IMPORT-LOW-CONFIDENCE",
    name: "Unknown import merchant with low confidence",
    description: "Create a mapping-repair queue item without rewriting imported source text.",
    type: "import_repair",
    scope: "Imported transactions",
    trigger: "Merchant confidence below 70%",
    mode: "suggest",
    health: "broken",
    enabled: true,
    requiresApproval: false,
    capabilities: ["imports"],
    linkedObjects: [],
    generatedCloseBlockers: 0,
    lastEventAt: "2026-06-11T13:00:00-04:00",
    nextAction: "Connect import provenance",
    conditions: [
      condition("import-low-confidence", "confidence", "less_than", "Mapping confidence below 70%", 70)
    ],
    actions: [
      action("create-import-repair", "Create mapping repair item", "finance", false, "draft_record")
    ],
    tests: [
      test("import-low", "Low-confidence merchant", { confidence: 42 }, ["create-import-repair"]),
      test("import-high", "High-confidence merchant", { confidence: 96 }, [])
    ],
    guardrails: ["Never overwrite imported source text.", "Never infer a canonical merchant from confidence alone."],
    failureMode: "The fixture has no import batch, source row, or immutable provenance record.",
    activity: [
      { id: "ACT-RULE-IMPORT-LOW-CONFIDENCE", occurredAt: "2026-06-11T13:00:00-04:00", action: "review_requested", summary: "Marked Broken because an import repository is not connected." }
    ]
  },
  {
    id: "RULE-REC-TOLERANCE",
    name: "Recurring amount within tolerance",
    description: "Suggest a subscription candidate when recurring amount variation remains within 5%.",
    type: "recurrence",
    scope: "Transactions",
    trigger: "Three occurrences within 5%",
    mode: "suggest",
    health: "stable",
    enabled: true,
    requiresApproval: false,
    capabilities: ["recurring"],
    linkedObjects: [],
    generatedCloseBlockers: 0,
    lastEventAt: "2026-06-10T17:05:00-04:00",
    nextAction: "Review candidate",
    conditions: [
      condition("rec-tolerance-count", "recurringOccurrences", "greater_than_or_equal", "At least three occurrences", 3),
      condition("rec-tolerance-variance", "amountVariancePercent", "less_than", "Amount variance below 5%", 5)
    ],
    actions: [
      action("suggest-recurring-candidate", "Suggest recurring candidate", "finance", false, "draft_record")
    ],
    tests: [
      test("rec-tolerance-match", "Three stable charges", { recurringOccurrences: 3, amountVariancePercent: 2 }, ["suggest-recurring-candidate"]),
      test("rec-tolerance-drift", "Variable charges", { recurringOccurrences: 3, amountVariancePercent: 12 }, [])
    ],
    guardrails: ["Never create a bill automatically.", "Never infer cancellation intent."],
    failureMode: "Usage-based services can look recurring while remaining variable.",
    activity: [
      { id: "ACT-RULE-REC-TOLERANCE", occurredAt: "2026-06-10T17:05:00-04:00", action: "fixture_defined", summary: "Tolerance remains literal and testable." }
    ]
  },
  {
    id: "RULE-CLOSE-STATEMENT",
    name: "Missing statement before close",
    description: "Draft an evidence blocker while a required account statement is missing.",
    type: "close_blocker",
    scope: "Finance Monthly Review",
    trigger: "Required statement missing",
    mode: "suggest",
    health: "stable",
    enabled: true,
    requiresApproval: false,
    capabilities: ["close"],
    linkedObjects: [financeRef("monthly_review", "reconcile", "Reconcile all accounts")],
    generatedCloseBlockers: 2,
    lastEventAt: "2026-06-10T14:10:00-04:00",
    nextAction: "Attach source statement",
    conditions: [
      condition("close-statement-missing", "statementPresent", "is_false", "Required statement is missing"),
      condition("close-current-period", "closePeriod", "is_true", "Current close period")
    ],
    actions: [
      action("draft-statement-blocker", "Draft evidence blocker", "reviews", false, "draft_record")
    ],
    tests: [
      test("statement-missing", "Current-period statement missing", { statementPresent: false, closePeriod: true }, ["draft-statement-blocker"]),
      test("statement-present", "Statement attached", { statementPresent: true, closePeriod: true }, [])
    ],
    guardrails: ["Never waive evidence.", "Never mark an account reconciled."],
    failureMode: "A source statement may exist outside the currently indexed Media evidence.",
    activity: [
      { id: "ACT-RULE-CLOSE-STATEMENT", occurredAt: "2026-06-10T14:10:00-04:00", action: "fixture_defined", summary: "Two fixture close blockers are historical examples, not live close state." }
    ]
  },
  {
    id: "RULE-REC-VALUE-QUARTERLY",
    name: "Subscription value review every quarter",
    description: "Draft a review prompt before an accepted Personal Ops follow-up can be created.",
    type: "recurrence",
    scope: "Bills & subscriptions",
    trigger: "Quarterly value-review cadence",
    mode: "draft",
    health: "draft",
    enabled: false,
    requiresApproval: false,
    capabilities: ["recurring"],
    linkedObjects: [],
    generatedCloseBlockers: 0,
    lastEventAt: null,
    nextAction: "Define acceptance handoff",
    conditions: [condition("value-quarterly", "recurringOccurrences", "greater_than_or_equal", "At least three monthly charges", 3)],
    actions: [
      action("draft-value-review", "Draft value-review prompt", "personal_ops", true, "draft_record")
    ],
    tests: [test("value-quarterly-match", "Three monthly charges", { recurringOccurrences: 3 }, ["draft-value-review"])],
    guardrails: ["Never create an accepted Personal Ops Follow-up.", "Never cancel a subscription."],
    failureMode: "The acceptance handoff to Personal Ops is not connected.",
    activity: [
      { id: "ACT-RULE-REC-VALUE-QUARTERLY", occurredAt: "2026-06-09T15:25:00-04:00", action: "fixture_defined", summary: "High-impact downstream work remains a draft until accepted." }
    ]
  },
  {
    id: "RULE-PROJECT-SPEND",
    name: "Project-linked spend above threshold",
    description: "Preserve Project context and surface a Finance review flag for material spend.",
    type: "project_link",
    scope: "Project-linked transactions",
    trigger: "Amount above $500 with Project link",
    mode: "suggest",
    health: "stable",
    enabled: true,
    requiresApproval: false,
    capabilities: ["budget", "project_linked"],
    linkedObjects: [
      financeRef("transaction", "TX-7736", "Delta Air Lines · TX-7736"),
      projectRef("fremen", "Project Fremen")
    ],
    generatedCloseBlockers: 0,
    lastEventAt: "2026-06-09T18:05:00-04:00",
    nextAction: "Review linked spend",
    conditions: [
      condition("project-spend-threshold", "amount", "greater_than", "Absolute spend above $500", 500),
      condition("project-spend-linked", "projectLinked", "is_true", "Project context linked")
    ],
    actions: [
      action("flag-project-spend", "Flag for Finance review", "finance"),
      action("preserve-project-spend-link", "Preserve Project reference", "projects")
    ],
    tests: [
      test("project-spend-match", "Material linked spend", { amount: 642, projectLinked: true }, ["flag-project-spend", "preserve-project-spend-link"]),
      test("project-spend-small", "Small linked spend", { amount: 27.4, projectLinked: true }, [])
    ],
    guardrails: ["Never mutate Project state.", "Never create a Project task."],
    failureMode: "The amount threshold may need account- or Project-specific policy.",
    activity: [
      { id: "ACT-RULE-PROJECT-SPEND", occurredAt: "2026-06-09T18:05:00-04:00", action: "fixture_defined", summary: "Project remains the native owner of Project context." }
    ]
  },
  {
    id: "RULE-RECEIPT-REIMBURSE",
    name: "Receipt missing on reimbursable transaction",
    description: "Request Media evidence for reimbursable spend that lacks a receipt.",
    type: "receipt_evidence",
    scope: "Reimbursable transactions",
    trigger: "Reimbursable and receipt missing",
    mode: "disabled",
    health: "overfiring",
    enabled: false,
    requiresApproval: false,
    capabilities: ["receipts"],
    linkedObjects: [financeRef("transaction", "TX-7736", "Delta Air Lines · TX-7736")],
    generatedCloseBlockers: 0,
    lastEventAt: "2026-06-09T17:15:00-04:00",
    nextAction: "Repair receipt-state source",
    conditions: [
      condition("receipt-reimbursable", "reimbursable", "is_true", "Transaction is reimbursable"),
      condition("receipt-missing", "receiptPresent", "is_false", "Receipt is missing")
    ],
    actions: [
      action("request-receipt-evidence", "Request Media evidence", "media", false, "draft_record")
    ],
    tests: [
      test("receipt-missing-match", "Reimbursable without receipt", { reimbursable: true, receiptPresent: false }, ["request-receipt-evidence"]),
      test("receipt-present", "Reimbursable with receipt", { reimbursable: true, receiptPresent: true }, [])
    ],
    guardrails: ["Never fabricate or upload a receipt.", "Never mark reimbursement complete."],
    failureMode: "Legacy receipt text cannot distinguish missing evidence from an inaccessible file.",
    activity: [
      { id: "ACT-RULE-RECEIPT-REIMBURSE", occurredAt: "2026-06-09T17:15:00-04:00", action: "disabled", summary: "Disabled after overfire risk was identified in legacy receipt text." }
    ]
  },
  {
    id: "RULE-CLOSE-BILLS",
    name: "Unreviewed bills before close",
    description: "Draft a close blocker and carry-forward candidate while bill review remains open.",
    type: "close_blocker",
    scope: "Finance Monthly Review",
    trigger: "Bill review incomplete",
    mode: "draft",
    health: "draft",
    enabled: false,
    requiresApproval: false,
    capabilities: ["recurring", "close"],
    linkedObjects: [financeRef("finance_close_check", "subscriptions", "Audit active subscriptions")],
    generatedCloseBlockers: 1,
    lastEventAt: null,
    nextAction: "Define carry-forward policy",
    conditions: [
      condition("close-bill-unreviewed", "billReviewed", "is_false", "Bill review is incomplete"),
      condition("close-bill-period", "closePeriod", "is_true", "Current close period")
    ],
    actions: [
      action("draft-bill-close-blocker", "Draft close blocker", "reviews", false, "draft_record"),
      action("draft-bill-carry-forward", "Draft carry-forward candidate", "personal_ops", true, "draft_record")
    ],
    tests: [
      test("close-bill-open", "Unreviewed current bill", { billReviewed: false, closePeriod: true }, ["draft-bill-close-blocker", "draft-bill-carry-forward"]),
      test("close-bill-reviewed", "Reviewed bill", { billReviewed: true, closePeriod: true }, [])
    ],
    guardrails: ["Never mark a bill reviewed.", "Never create an accepted Follow-up."],
    failureMode: "Carry-forward risk policy remains an open product decision.",
    activity: [
      { id: "ACT-RULE-CLOSE-BILLS", occurredAt: "2026-06-09T12:30:00-04:00", action: "fixture_defined", summary: "The draft keeps close ownership in Finance and action ownership in Personal Ops." }
    ]
  },
  {
    id: "RULE-CAT-GENERIC-MERCHANT",
    name: "Known merchant category",
    description: "Historical disabled category suggestion for a verified merchant mapping.",
    type: "categorization",
    scope: "Transactions",
    trigger: "Known merchant mapping",
    mode: "disabled",
    health: "stable",
    enabled: false,
    requiresApproval: false,
    capabilities: ["categorization"],
    linkedObjects: [],
    generatedCloseBlockers: 0,
    lastEventAt: "2026-06-08T16:00:00-04:00",
    nextAction: "Keep disabled",
    conditions: [condition("generic-merchant", "merchant", "present", "Merchant is present")],
    actions: [action("suggest-known-category", "Suggest known category", "finance")],
    tests: [test("generic-merchant-match", "Merchant present", { merchant: "Blue Bottle" }, ["suggest-known-category"])],
    guardrails: ["Never auto-categorize an ambiguous merchant."],
    failureMode: "Merchant identity and category policy are not persisted.",
    activity: [
      { id: "ACT-RULE-CAT-GENERIC-MERCHANT", occurredAt: "2026-06-08T16:00:00-04:00", action: "disabled", summary: "Disabled because canonical merchant identity is unavailable." }
    ]
  },
  {
    id: "RULE-IMPORT-DUPLICATE",
    name: "Possible duplicate import row",
    description: "Draft a repair item when import identity is ambiguous.",
    type: "import_repair",
    scope: "Imports",
    trigger: "Low-confidence duplicate candidate",
    mode: "draft",
    health: "draft",
    enabled: false,
    requiresApproval: false,
    capabilities: ["imports"],
    linkedObjects: [],
    generatedCloseBlockers: 0,
    lastEventAt: null,
    nextAction: "Connect import identity",
    conditions: [condition("import-duplicate-confidence", "confidence", "less_than", "Duplicate confidence below 80%", 80)],
    actions: [action("draft-duplicate-repair", "Draft duplicate repair", "finance", false, "draft_record")],
    tests: [test("import-duplicate-low", "Ambiguous duplicate", { confidence: 63 }, ["draft-duplicate-repair"])],
    guardrails: ["Never merge or discard an import row automatically."],
    failureMode: "No import batch or row identity is connected.",
    activity: [
      { id: "ACT-RULE-IMPORT-DUPLICATE", occurredAt: "2026-06-08T14:25:00-04:00", action: "fixture_defined", summary: "Draft only; duplicate resolution remains manual." }
    ]
  },
  {
    id: "RULE-RECEIPT-ABOVE-250",
    name: "Receipt required above $250",
    description: "Historical evidence policy fixture for material expenses.",
    type: "receipt_evidence",
    scope: "Expense transactions",
    trigger: "Amount above $250 and receipt missing",
    mode: "disabled",
    health: "stable",
    enabled: false,
    requiresApproval: false,
    capabilities: ["receipts"],
    linkedObjects: [financeRef("transaction", "TX-7741", "Apple Store · TX-7741")],
    generatedCloseBlockers: 0,
    lastEventAt: "2026-06-08T11:15:00-04:00",
    nextAction: "Define evidence policy",
    conditions: [
      condition("receipt-amount", "amount", "greater_than", "Absolute amount above $250", 250),
      condition("receipt-required-missing", "receiptPresent", "is_false", "Receipt is missing")
    ],
    actions: [action("request-material-receipt", "Request Media evidence", "media", false, "draft_record")],
    tests: [
      test("receipt-material-missing", "Material expense without receipt", { amount: 1299, receiptPresent: false }, ["request-material-receipt"]),
      test("receipt-small-missing", "Small expense without receipt", { amount: 18.5, receiptPresent: false }, [])
    ],
    guardrails: ["Never attach or synthesize receipt evidence."],
    failureMode: "The evidence threshold is not an approved Finance policy.",
    activity: [
      { id: "ACT-RULE-RECEIPT-ABOVE-250", occurredAt: "2026-06-08T11:15:00-04:00", action: "disabled", summary: "Threshold remains a fixture until policy is approved." }
    ]
  },
  {
    id: "RULE-CLOSE-STALE-SOURCE",
    name: "Stale source before close",
    description: "Historical close check for stale or inaccessible evidence.",
    type: "close_blocker",
    scope: "Finance Monthly Review",
    trigger: "Close source unavailable",
    mode: "disabled",
    health: "stable",
    enabled: false,
    requiresApproval: false,
    capabilities: ["receipts", "close"],
    linkedObjects: [financeRef("monthly_review", "reconcile", "Reconcile all accounts")],
    generatedCloseBlockers: 1,
    lastEventAt: "2026-06-07T15:50:00-04:00",
    nextAction: "Keep disabled",
    conditions: [
      condition("close-stale-source", "statementPresent", "is_false", "Source statement unavailable"),
      condition("close-stale-period", "closePeriod", "is_true", "Current close period")
    ],
    actions: [action("draft-stale-source-blocker", "Draft stale-source blocker", "reviews", false, "draft_record")],
    tests: [test("close-source-missing", "Current source unavailable", { statementPresent: false, closePeriod: true }, ["draft-stale-source-blocker"])],
    guardrails: ["Never treat inaccessible evidence as absent.", "Never close Finance from Reviews."],
    failureMode: "Source health and freshness are not connected.",
    activity: [
      { id: "ACT-RULE-CLOSE-STALE-SOURCE", occurredAt: "2026-06-07T15:50:00-04:00", action: "disabled", summary: "Disabled until source-health evidence is available." }
    ]
  }
];

export const financeRulesFixtureRepository: FinanceRulesFixtureRepository = {
  metadata: {
    id: "finance-rules-approved-design-preview",
    previewLabel: "Approved rule scenarios · read-only deterministic preview",
    readOnly: true,
    persistenceConnected: false,
    testExecution: "deterministic_browser_preview"
  },
  read() {
    return { rules };
  }
};
