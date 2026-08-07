import type {
  FinanceRule,
  FinanceRuleCapability,
  FinanceRuleCondition,
  FinanceRuleHealth,
  FinanceRuleTestCase,
  FinanceRuleTestInput,
  FinanceRulesDataset
} from "./types";

export type FinanceRulesFilter =
  | "all"
  | "active"
  | "draft"
  | "needs-review"
  | "categorization"
  | "receipts"
  | "bills-subs"
  | "budget-rules"
  | "savings-rules"
  | "import-rules"
  | "close-rules"
  | "project-linked"
  | "disabled";

export type FinanceRulesSort = "attention" | "name-asc" | "last-desc" | "next-asc";

export interface FinanceRulesViewInput {
  readonly query?: string;
  readonly filter?: string;
  readonly sort?: string;
  readonly selectedId?: string;
}

export interface FinanceRulesViewModel {
  readonly query: string;
  readonly filter: FinanceRulesFilter;
  readonly sort: FinanceRulesSort;
  readonly sourceCount: number;
  readonly visibleCount: number;
  readonly rows: readonly FinanceRule[];
  readonly selectedId: string | null;
  readonly selected: FinanceRule | null;
  readonly selectionBasis: "requested-visible-id" | "approved-default-rule" | "first-visible" | null;
  readonly counts: {
    readonly active: number;
    readonly draft: number;
    readonly needsReview: number;
    readonly disabled: number;
    readonly categorization: number;
    readonly receipts: number;
    readonly recurring: number;
    readonly budget: number;
    readonly savings: number;
    readonly imports: number;
    readonly closeBlockersGenerated: number;
    readonly highImpactApproval: number;
    readonly stable: number;
    readonly watch: number;
  };
}

export type FinanceRuleTestResultStatus = "pass" | "fail" | "review";

export interface FinanceRuleTestResult {
  readonly testId: string;
  readonly label: string;
  readonly status: FinanceRuleTestResultStatus;
  readonly expectedActionIds: readonly string[];
  readonly actualActionIds: readonly string[];
  readonly missingFields: readonly string[];
  readonly explanation: string;
}

export interface FinanceRuleTestRun {
  readonly ruleId: string;
  readonly executedAt: string;
  readonly executionMode: "deterministic_browser_preview" | "deterministic_server";
  readonly results: readonly FinanceRuleTestResult[];
  readonly passed: number;
  readonly failed: number;
  readonly review: number;
  readonly simulatedActionCount: number;
  readonly sourceMutationCount: 0;
}

const FILTERS: readonly FinanceRulesFilter[] = [
  "all",
  "active",
  "draft",
  "needs-review",
  "categorization",
  "receipts",
  "bills-subs",
  "budget-rules",
  "savings-rules",
  "import-rules",
  "close-rules",
  "project-linked",
  "disabled"
];

const SORTS: readonly FinanceRulesSort[] = ["attention", "name-asc", "last-desc", "next-asc"];

function normalizeFilter(value: string | undefined): FinanceRulesFilter {
  return FILTERS.includes(value as FinanceRulesFilter) ? value as FinanceRulesFilter : "all";
}

function normalizeSort(value: string | undefined): FinanceRulesSort {
  return SORTS.includes(value as FinanceRulesSort) ? value as FinanceRulesSort : "attention";
}

function isActive(rule: FinanceRule): boolean {
  return rule.enabled && rule.mode !== "draft" && rule.mode !== "disabled";
}

function needsReview(health: FinanceRuleHealth): boolean {
  return health === "needs_review" || health === "broken" || health === "overfiring";
}

function hasCapability(rule: FinanceRule, capability: FinanceRuleCapability): boolean {
  return rule.capabilities.includes(capability);
}

function matchesFilter(rule: FinanceRule, filter: FinanceRulesFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return isActive(rule);
  if (filter === "draft") return rule.mode === "draft";
  if (filter === "needs-review") return needsReview(rule.health);
  if (filter === "disabled") return rule.mode === "disabled";
  if (filter === "categorization") return hasCapability(rule, "categorization");
  if (filter === "receipts") return hasCapability(rule, "receipts");
  if (filter === "bills-subs") return hasCapability(rule, "recurring");
  if (filter === "budget-rules") return hasCapability(rule, "budget");
  if (filter === "savings-rules") return hasCapability(rule, "savings");
  if (filter === "import-rules") return hasCapability(rule, "imports");
  if (filter === "close-rules") return hasCapability(rule, "close");
  return hasCapability(rule, "project_linked");
}

function searchText(rule: FinanceRule): string {
  return [
    rule.id,
    rule.name,
    rule.description,
    rule.type,
    rule.scope,
    rule.trigger,
    rule.mode,
    rule.health,
    rule.nextAction,
    ...rule.capabilities,
    ...rule.actions.flatMap((item) => [item.label, item.destination]),
    ...rule.linkedObjects.flatMap((item) => [item.module, item.objectType, item.objectId, item.label])
  ].join(" ").toLowerCase();
}

function attentionRank(health: FinanceRuleHealth): number {
  if (health === "overfiring") return 0;
  if (health === "broken") return 1;
  if (health === "needs_review") return 2;
  if (health === "draft") return 3;
  return 4;
}

function lastEventValue(rule: FinanceRule): number {
  if (!rule.lastEventAt) return Number.NEGATIVE_INFINITY;
  const value = Date.parse(rule.lastEventAt);
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

export function buildFinanceRulesViewModel(
  dataset: FinanceRulesDataset,
  input: FinanceRulesViewInput = {}
): FinanceRulesViewModel {
  const query = input.query?.trim().toLowerCase() ?? "";
  const filter = normalizeFilter(input.filter);
  const sort = normalizeSort(input.sort);
  const rows = dataset.rules
    .map((rule, sourceIndex) => ({ rule, sourceIndex }))
    .filter(({ rule }) => matchesFilter(rule, filter))
    .filter(({ rule }) => !query || searchText(rule).includes(query))
    .sort((left, right) => {
      if (sort === "name-asc") {
        return left.rule.name.localeCompare(right.rule.name) || left.sourceIndex - right.sourceIndex;
      }
      if (sort === "last-desc") {
        return lastEventValue(right.rule) - lastEventValue(left.rule) || left.sourceIndex - right.sourceIndex;
      }
      if (sort === "next-asc") {
        return left.rule.nextAction.localeCompare(right.rule.nextAction) || left.sourceIndex - right.sourceIndex;
      }
      return attentionRank(left.rule.health) - attentionRank(right.rule.health)
        || Number(right.rule.requiresApproval) - Number(left.rule.requiresApproval)
        || left.sourceIndex - right.sourceIndex;
    })
    .map(({ rule }) => rule);
  const requestedSelection = input.selectedId
    ? rows.find((rule) => rule.id === input.selectedId) ?? null
    : null;
  const approvedDefault = rows.find((rule) => rule.id === "RULE-BUDGET-110") ?? null;
  const selected = requestedSelection || (input.selectedId === undefined ? approvedDefault || rows[0] || null : null);
  const all = dataset.rules;
  const activeRules = all.filter(isActive);
  const stable = activeRules.filter((rule) => rule.health === "stable").length;
  const watch = activeRules.length - stable;

  return {
    query,
    filter,
    sort,
    sourceCount: all.length,
    visibleCount: rows.length,
    rows,
    selectedId: selected?.id ?? null,
    selected,
    selectionBasis: requestedSelection
      ? "requested-visible-id"
      : input.selectedId !== undefined
        ? null
        : approvedDefault
          ? "approved-default-rule"
          : rows.length
            ? "first-visible"
            : null,
    counts: {
      active: all.filter(isActive).length,
      draft: all.filter((rule) => rule.mode === "draft").length,
      needsReview: all.filter((rule) => needsReview(rule.health)).length,
      disabled: all.filter((rule) => rule.mode === "disabled").length,
      categorization: all.filter((rule) => hasCapability(rule, "categorization")).length,
      receipts: all.filter((rule) => hasCapability(rule, "receipts")).length,
      recurring: all.filter((rule) => hasCapability(rule, "recurring")).length,
      budget: all.filter((rule) => hasCapability(rule, "budget")).length,
      savings: all.filter((rule) => hasCapability(rule, "savings")).length,
      imports: all.filter((rule) => hasCapability(rule, "imports")).length,
      closeBlockersGenerated: all.reduce((sum, rule) => sum + rule.generatedCloseBlockers, 0),
      highImpactApproval: all.filter((rule) => rule.requiresApproval).length,
      stable,
      watch
    }
  };
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (typeof left === "string" && typeof right === "string") {
    return left.toLowerCase() === right.toLowerCase();
  }
  return left === right;
}

function conditionMatches(condition: FinanceRuleCondition, input: FinanceRuleTestInput): boolean {
  const raw = input[condition.field];
  const comparable = condition.field === "amount" && typeof raw === "number" ? Math.abs(raw) : raw;
  if (condition.operator === "present") return comparable !== undefined && comparable !== null && comparable !== "";
  if (condition.operator === "missing") return comparable === undefined || comparable === null || comparable === "";
  if (condition.operator === "is_true") return comparable === true;
  if (condition.operator === "is_false") return comparable === false;
  if (condition.operator === "contains") {
    return typeof comparable === "string"
      && typeof condition.value === "string"
      && comparable.toLowerCase().includes(condition.value.toLowerCase());
  }
  if (condition.operator === "equals") return valuesEqual(comparable, condition.value);
  if (typeof comparable !== "number" || typeof condition.value !== "number") return false;
  if (condition.operator === "greater_than") return comparable > condition.value;
  if (condition.operator === "greater_than_or_equal") return comparable >= condition.value;
  return comparable < condition.value;
}

function missingRequiredFields(rule: Pick<FinanceRule, "conditions">, testCase: FinanceRuleTestCase): string[] {
  return rule.conditions
    .filter((item) => item.required)
    .filter((item) => testCase.input[item.field] === undefined)
    .map((item) => item.field);
}

function sameActionSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

export function evaluateFinanceRuleTest(
  rule: Pick<FinanceRule, "conditions" | "actions">,
  testCase: FinanceRuleTestCase
): FinanceRuleTestResult {
  const missingFields = missingRequiredFields(rule, testCase);
  if (missingFields.length) {
    return {
      testId: testCase.id,
      label: testCase.label,
      status: "review",
      expectedActionIds: testCase.expectedActionIds,
      actualActionIds: [],
      missingFields,
      explanation: `Preview needs ${missingFields.join(", ")} before the rule can be evaluated.`
    };
  }
  const triggered = rule.conditions.filter((item) => item.required).every((item) => conditionMatches(item, testCase.input));
  const actualActionIds = triggered ? rule.actions.map((item) => item.id) : [];
  const passed = sameActionSet(actualActionIds, testCase.expectedActionIds);
  return {
    testId: testCase.id,
    label: testCase.label,
    status: passed ? "pass" : "fail",
    expectedActionIds: testCase.expectedActionIds,
    actualActionIds,
    missingFields,
    explanation: passed
      ? triggered
        ? `${actualActionIds.length} expected preview action${actualActionIds.length === 1 ? "" : "s"} matched.`
        : "The rule correctly stayed inactive for this stored test case."
      : `Expected ${testCase.expectedActionIds.length} action${testCase.expectedActionIds.length === 1 ? "" : "s"}, previewed ${actualActionIds.length}.`
  };
}

export function runFinanceRuleTests(
  rule: Pick<FinanceRule, "id" | "conditions" | "actions" | "tests">,
  executedAt: string,
  executionMode: FinanceRuleTestRun["executionMode"] = "deterministic_browser_preview"
): FinanceRuleTestRun {
  const results = rule.tests.map((testCase) => evaluateFinanceRuleTest(rule, testCase));
  return {
    ruleId: rule.id,
    executedAt,
    executionMode,
    results,
    passed: results.filter((result) => result.status === "pass").length,
    failed: results.filter((result) => result.status === "fail").length,
    review: results.filter((result) => result.status === "review").length,
    simulatedActionCount: results.reduce((sum, result) => sum + result.actualActionIds.length, 0),
    sourceMutationCount: 0
  };
}
