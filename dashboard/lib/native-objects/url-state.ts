export type UrlSearchParamsInput =
  | string
  | URLSearchParams
  | {
      forEach(callback: (value: string, key: string) => void): void;
      get(name: string): string | null;
    };

export type UrlStateCodec<Value> = {
  param: string;
  defaultValue: Value;
  parse(raw: string | null): Value | undefined;
  serialize(value: Value): string | readonly string[] | null | undefined;
  omit?: (value: Value) => boolean;
};

export type UrlStateSchema<State extends object> = {
  [Key in keyof State]: UrlStateCodec<State[Key]>;
};

function toSearchParams(input?: UrlSearchParamsInput): URLSearchParams {
  if (!input) {
    return new URLSearchParams();
  }
  if (typeof input === "string") {
    return new URLSearchParams(input.startsWith("?") ? input.slice(1) : input);
  }
  if (input instanceof URLSearchParams) {
    return new URLSearchParams(input);
  }
  const params = new URLSearchParams();
  input.forEach((value, key) => params.append(key, value));
  return params;
}

export function parseUrlState<State extends object>(
  input: UrlSearchParamsInput,
  schema: UrlStateSchema<State>
): State {
  const params = toSearchParams(input);
  const parsed = {} as State;

  for (const key of Object.keys(schema) as Array<keyof State>) {
    const codec = schema[key];
    parsed[key] = codec.parse(params.get(codec.param)) ?? codec.defaultValue;
  }

  return parsed;
}

export function serializeUrlState<State extends object>(
  state: Partial<State>,
  schema: UrlStateSchema<State>,
  base?: UrlSearchParamsInput
): URLSearchParams {
  const params = toSearchParams(base);

  for (const key of Object.keys(schema) as Array<keyof State>) {
    const codec = schema[key];
    params.delete(codec.param);
    const value = state[key] ?? codec.defaultValue;
    if (codec.omit?.(value)) {
      continue;
    }
    const serialized = codec.serialize(value);
    if (serialized === null || serialized === undefined || serialized === "") {
      continue;
    }
    if (Array.isArray(serialized)) {
      for (const item of serialized) {
        params.append(codec.param, item);
      }
    } else {
      params.set(codec.param, serialized as string);
    }
  }

  return params;
}

const PEOPLE_FILTERS = ["all", "due", "week", "active", "dormant", "orgs"] as const;
const PEOPLE_SORTS = ["last-name", "recent-contact", "next-follow-up", "priority"] as const;
const PEOPLE_VIEWS = ["list", "compact", "grid"] as const;
const PEOPLE_TABS = ["overview", "timeline", "notes", "relations", "files", "properties"] as const;
const PEOPLE_SIDEBARS = [
  "all",
  "starred",
  "recent",
  "upcoming",
  "attention",
  "relationship-map",
  "family",
  "close-friends",
  "business",
  "advisors-mentors",
  "neighbors",
  "health-wellness",
  "all-lists",
  "no-contact-90",
  "high-priority",
  "birthdays-month",
  "new-people",
  "profile-gaps",
  "dormant",
  "import-export",
  "duplicates",
  "recently-deleted",
  "customize"
] as const;

export type PeopleFilter = (typeof PEOPLE_FILTERS)[number];
export type PeopleSort = (typeof PEOPLE_SORTS)[number];
export type PeopleView = (typeof PEOPLE_VIEWS)[number];
export type PeopleTab = (typeof PEOPLE_TABS)[number];
export type PeopleSidebar = (typeof PEOPLE_SIDEBARS)[number];

export type PeopleUrlState = {
  query: string;
  filter: PeopleFilter;
  sort: PeopleSort;
  view: PeopleView;
  sidebar: PeopleSidebar;
  person: string;
  tab: PeopleTab;
  ai: boolean;
};

function enumCodec<const Values extends readonly string[]>(param: string, values: Values, defaultValue: Values[number]) {
  return {
    param,
    defaultValue,
    parse(raw: string | null): Values[number] | undefined {
      return raw && (values as readonly string[]).includes(raw) ? (raw as Values[number]) : undefined;
    },
    serialize(value: Values[number]) {
      return value;
    },
    omit(value: Values[number]) {
      return value === defaultValue;
    }
  } satisfies UrlStateCodec<Values[number]>;
}

export const PEOPLE_URL_STATE_SCHEMA: UrlStateSchema<PeopleUrlState> = {
  query: {
    param: "query",
    defaultValue: "",
    parse: (raw) => raw?.trim() || undefined,
    serialize: (value) => value.trim(),
    omit: (value) => value.trim() === ""
  },
  filter: enumCodec("filter", PEOPLE_FILTERS, "all"),
  sort: enumCodec("sort", PEOPLE_SORTS, "last-name"),
  view: enumCodec("view", PEOPLE_VIEWS, "list"),
  sidebar: enumCodec("sidebar", PEOPLE_SIDEBARS, "all"),
  person: {
    param: "person",
    defaultValue: "",
    parse: (raw) => raw?.trim() || undefined,
    serialize: (value) => value.trim(),
    omit: (value) => value.trim() === ""
  },
  tab: enumCodec("tab", PEOPLE_TABS, "overview"),
  ai: {
    param: "ai",
    defaultValue: false,
    parse: (raw) => (raw === "1" || raw === "true" ? true : raw === "0" || raw === "false" ? false : undefined),
    serialize: (value) => (value ? "1" : null),
    omit: (value) => !value
  }
};

export function parsePeopleUrlState(searchParams: UrlSearchParamsInput): PeopleUrlState {
  return parseUrlState(searchParams, PEOPLE_URL_STATE_SCHEMA);
}

export function serializePeopleUrlState(
  state: Partial<PeopleUrlState>,
  base?: UrlSearchParamsInput
): URLSearchParams {
  return serializeUrlState(state, PEOPLE_URL_STATE_SCHEMA, base);
}

const FINANCE_VIEWS = ["overview", "accounts", "budgets", "bills", "review", "transactions"] as const;
const FINANCE_FILTERS = [
  "",
  "attention",
  "due-week",
  "unreviewed",
  "recurring",
  "savings-movement",
  "over-budget",
  "incomplete"
] as const;
const FINANCE_SORTS = [
  "default",
  "date-desc",
  "date-asc",
  "amount-desc",
  "amount-asc",
  "merchant-asc",
  "name-asc",
  "balance-desc",
  "balance-asc",
  "change-desc",
  "attention",
  "urgency",
  "due-soon",
  "spent-desc",
  "limit-desc",
  "remaining-asc",
  "category-asc",
  "open-first",
  "source-order",
  "label-asc"
] as const;
const FINANCE_TABS = [
  "overview",
  "properties",
  "links",
  "audit",
  "rules",
  "transactions",
  "reconcile",
  "transfers",
  "imports",
  "payments",
  "value",
  "subscriptions",
  "projects",
  "evidence",
  "decisions",
  "activity"
] as const;

export type FinanceView = (typeof FINANCE_VIEWS)[number];
export type FinanceFilter = (typeof FINANCE_FILTERS)[number];
export type FinanceSort = (typeof FINANCE_SORTS)[number];
export type FinanceTab = (typeof FINANCE_TABS)[number];

export type FinanceUrlState = {
  view: FinanceView;
  filter: FinanceFilter;
  sort: FinanceSort;
  query: string;
  selected: string;
  tab: FinanceTab;
  ai: boolean;
};

export const FINANCE_URL_STATE_SCHEMA: UrlStateSchema<FinanceUrlState> = {
  view: enumCodec("view", FINANCE_VIEWS, "overview"),
  filter: enumCodec("filter", FINANCE_FILTERS, ""),
  sort: enumCodec("sort", FINANCE_SORTS, "default"),
  query: {
    param: "query",
    defaultValue: "",
    parse: (raw) => raw?.trim() || undefined,
    serialize: (value) => value.trim(),
    omit: (value) => value.trim() === ""
  },
  selected: {
    param: "selected",
    defaultValue: "",
    parse: (raw) => raw?.trim() || undefined,
    serialize: (value) => value.trim(),
    omit: (value) => value.trim() === ""
  },
  tab: enumCodec("tab", FINANCE_TABS, "overview"),
  ai: {
    param: "ai",
    defaultValue: false,
    parse: (raw) => (raw === "1" || raw === "true" ? true : raw === "0" || raw === "false" ? false : undefined),
    serialize: (value) => (value ? "1" : null),
    omit: (value) => !value
  }
};

export function parseFinanceUrlState(searchParams: UrlSearchParamsInput): FinanceUrlState {
  return parseUrlState(searchParams, FINANCE_URL_STATE_SCHEMA);
}

const FINANCE_FILTERS_BY_VIEW: Readonly<Record<FinanceView, readonly FinanceFilter[]>> = {
  overview: [""],
  accounts: [""],
  transactions: ["", "unreviewed"],
  bills: ["", "due-week", "recurring"],
  budgets: ["", "over-budget"],
  review: ["", "incomplete"]
};

const FINANCE_SORTS_BY_VIEW: Readonly<Record<FinanceView, readonly FinanceSort[]>> = {
  overview: ["default"],
  accounts: ["default", "name-asc", "balance-desc", "balance-asc", "change-desc"],
  transactions: ["default", "date-desc", "date-asc", "amount-desc", "amount-asc", "merchant-asc"],
  bills: ["default", "urgency", "due-soon", "amount-desc", "amount-asc", "name-asc"],
  budgets: ["default", "attention", "spent-desc", "limit-desc", "remaining-asc", "category-asc"],
  review: ["default", "open-first", "source-order", "label-asc"]
};

const FINANCE_TABS_BY_VIEW: Readonly<Record<FinanceView, readonly FinanceTab[]>> = {
  overview: ["overview"],
  accounts: ["overview", "transactions", "reconcile", "transfers", "imports", "properties"],
  transactions: ["overview", "properties", "links", "audit", "rules"],
  bills: ["overview", "payments", "value", "links", "rules", "properties"],
  budgets: ["overview", "transactions", "subscriptions", "projects", "rules", "properties"],
  review: ["overview", "evidence", "decisions", "links", "activity", "properties"]
};

/**
 * Removes contradictory cross-view state while preserving query, selection,
 * assistant state, and unrelated safe URL parameters during serialization.
 */
export function normalizeFinanceUrlStateForView(
  view: FinanceView,
  state: FinanceUrlState
): FinanceUrlState {
  return {
    ...state,
    view,
    filter: FINANCE_FILTERS_BY_VIEW[view].includes(state.filter) ? state.filter : "",
    sort: FINANCE_SORTS_BY_VIEW[view].includes(state.sort) ? state.sort : "default",
    tab: FINANCE_TABS_BY_VIEW[view].includes(state.tab) ? state.tab : "overview"
  };
}

export function serializeFinanceUrlState(
  state: Partial<FinanceUrlState>,
  base?: UrlSearchParamsInput
): URLSearchParams {
  return serializeUrlState(state, FINANCE_URL_STATE_SCHEMA, base);
}

const PERSONAL_OPS_TABS = [
  "overview",
  "details",
  "cadence",
  "generated-items",
  "history",
  "rules",
  "triage",
  "source",
  "fields",
  "usage",
  "key-results",
  "rationale",
  "evidence",
  "context",
  "links",
  "activity",
  "notes",
  "properties"
] as const;
const PERSONAL_OPS_SORTS = ["priority", "due", "updated", "title"] as const;

export type PersonalOpsTab = (typeof PERSONAL_OPS_TABS)[number];
export type PersonalOpsSort = (typeof PERSONAL_OPS_SORTS)[number];

export type PersonalOpsUrlState = {
  selected: string;
  tab: PersonalOpsTab;
  query: string;
  filter: string;
  sort: PersonalOpsSort;
  compact: boolean;
  ai: boolean;
};

function safeTokenCodec(param: string, defaultValue = "") {
  return {
    param,
    defaultValue,
    parse(raw: string | null) {
      const value = raw?.trim() || "";
      return value && /^[a-z0-9_-]{1,64}$/i.test(value) ? value : undefined;
    },
    serialize(value: string) {
      return value.trim();
    },
    omit(value: string) {
      return value.trim() === defaultValue;
    }
  } satisfies UrlStateCodec<string>;
}

export const PERSONAL_OPS_URL_STATE_SCHEMA: UrlStateSchema<PersonalOpsUrlState> = {
  selected: {
    param: "selected",
    defaultValue: "",
    parse: (raw) => raw?.trim() || undefined,
    serialize: (value) => value.trim(),
    omit: (value) => value.trim() === ""
  },
  tab: enumCodec("tab", PERSONAL_OPS_TABS, "overview"),
  query: {
    param: "query",
    defaultValue: "",
    parse: (raw) => raw?.trim() || undefined,
    serialize: (value) => value.trim(),
    omit: (value) => value.trim() === ""
  },
  filter: safeTokenCodec("filter", "all"),
  sort: enumCodec("sort", PERSONAL_OPS_SORTS, "priority"),
  compact: {
    param: "compact",
    defaultValue: false,
    parse: (raw) => (raw === "1" || raw === "true" ? true : raw === "0" || raw === "false" ? false : undefined),
    serialize: (value) => (value ? "1" : null),
    omit: (value) => !value
  },
  ai: {
    param: "ai",
    defaultValue: false,
    parse: (raw) => (raw === "1" || raw === "true" ? true : raw === "0" || raw === "false" ? false : undefined),
    serialize: (value) => (value ? "1" : null),
    omit: (value) => !value
  }
};

export function parsePersonalOpsUrlState(searchParams: UrlSearchParamsInput): PersonalOpsUrlState {
  return parseUrlState(searchParams, PERSONAL_OPS_URL_STATE_SCHEMA);
}

export function serializePersonalOpsUrlState(
  state: Partial<PersonalOpsUrlState>,
  base?: UrlSearchParamsInput
): URLSearchParams {
  return serializeUrlState(state, PERSONAL_OPS_URL_STATE_SCHEMA, base);
}

const NOTES_VIEWS = [
  "all",
  "recent",
  "pinned",
  "active",
  "needs-review",
  "drafts",
  "linked-people",
  "linked-projects",
  "linked-finance",
  "linked-resources",
  "linked-reviews",
  "no-links",
  "decisions",
  "meetings",
  "ideas",
  "research",
  "personal-context",
  "project-notes",
  "archived"
] as const;
const NOTES_FILTERS = ["all", "active", "pinned", "linked", "no-links", "needs-review"] as const;
const NOTES_SORTS = ["updated-desc", "updated-asc", "created-desc", "title", "review"] as const;
const NOTES_DENSITIES = ["comfortable", "compact"] as const;
const NOTES_TABS = ["overview", "body", "links", "decisions", "review", "attachments", "properties"] as const;

export type NotesView = (typeof NOTES_VIEWS)[number];
export type NotesFilter = (typeof NOTES_FILTERS)[number];
export type NotesSort = (typeof NOTES_SORTS)[number];
export type NotesDensity = (typeof NOTES_DENSITIES)[number];
export type NotesTab = (typeof NOTES_TABS)[number];

export type NotesUrlState = {
  view: NotesView;
  filter: NotesFilter;
  sort: NotesSort;
  density: NotesDensity;
  query: string;
  note: string;
  tab: NotesTab;
  ai: boolean;
};

export const NOTES_URL_STATE_SCHEMA: UrlStateSchema<NotesUrlState> = {
  view: enumCodec("view", NOTES_VIEWS, "all"),
  filter: enumCodec("filter", NOTES_FILTERS, "all"),
  sort: enumCodec("sort", NOTES_SORTS, "updated-desc"),
  density: enumCodec("density", NOTES_DENSITIES, "compact"),
  query: {
    param: "query",
    defaultValue: "",
    parse: (raw) => raw?.trim() || undefined,
    serialize: (value) => value.trim(),
    omit: (value) => value.trim() === ""
  },
  note: {
    param: "note",
    defaultValue: "",
    parse: (raw) => raw?.trim() || undefined,
    serialize: (value) => value.trim(),
    omit: (value) => value.trim() === ""
  },
  tab: enumCodec("tab", NOTES_TABS, "overview"),
  ai: {
    param: "ai",
    defaultValue: false,
    parse: (raw) => (raw === "1" || raw === "true" ? true : raw === "0" || raw === "false" ? false : undefined),
    serialize: (value) => (value ? "1" : null),
    omit: (value) => !value
  }
};

export function parseNotesUrlState(searchParams: UrlSearchParamsInput): NotesUrlState {
  return parseUrlState(searchParams, NOTES_URL_STATE_SCHEMA);
}

export function serializeNotesUrlState(
  state: Partial<NotesUrlState>,
  base?: UrlSearchParamsInput
): URLSearchParams {
  return serializeUrlState(state, NOTES_URL_STATE_SCHEMA, base);
}

const RESOURCE_VIEWS = ["all", "pinned", "recent", "needs-review", "cited", "archived"] as const;
const RESOURCE_SORTS = ["updated-desc", "updated-asc", "title", "review"] as const;
const RESOURCE_TABS = ["overview", "source", "links", "notes", "review", "properties"] as const;

export type ResourcesUrlState = {
  view: (typeof RESOURCE_VIEWS)[number];
  sort: (typeof RESOURCE_SORTS)[number];
  query: string;
  selected: string;
  tab: (typeof RESOURCE_TABS)[number];
  item: string;
  ai: boolean;
};

export const RESOURCES_URL_STATE_SCHEMA: UrlStateSchema<ResourcesUrlState> = {
  view: enumCodec("view", RESOURCE_VIEWS, "all"),
  sort: enumCodec("sort", RESOURCE_SORTS, "updated-desc"),
  query: {
    param: "query",
    defaultValue: "",
    parse: (raw) => raw?.trim() || undefined,
    serialize: (value) => value.trim(),
    omit: (value) => value.trim() === ""
  },
  selected: {
    param: "selected",
    defaultValue: "",
    parse: (raw) => raw?.trim() || undefined,
    serialize: (value) => value.trim(),
    omit: (value) => value.trim() === ""
  },
  tab: enumCodec("tab", RESOURCE_TABS, "overview"),
  item: {
    param: "item",
    defaultValue: "",
    parse: (raw) => raw?.trim() || undefined,
    serialize: (value) => value.trim(),
    omit: (value) => value.trim() === ""
  },
  ai: {
    param: "ai",
    defaultValue: false,
    parse: (raw) => (raw === "1" || raw === "true" ? true : raw === "0" || raw === "false" ? false : undefined),
    serialize: (value) => (value ? "1" : null),
    omit: (value) => !value
  }
};

export function parseResourcesUrlState(searchParams: UrlSearchParamsInput): ResourcesUrlState {
  return parseUrlState(searchParams, RESOURCES_URL_STATE_SCHEMA);
}

export function serializeResourcesUrlState(
  state: Partial<ResourcesUrlState>,
  base?: UrlSearchParamsInput
): URLSearchParams {
  return serializeUrlState(state, RESOURCES_URL_STATE_SCHEMA, base);
}

const MEDIA_VIEWS = [
  "all",
  "recent",
  "pinned",
  "needs-review",
  "in-use",
  "missing-metadata",
  "rights-usage",
  "archived"
] as const;
const MEDIA_SORTS = ["uploaded-desc", "updated-desc", "title", "size", "review", "usage"] as const;
const MEDIA_TABS = [
  "overview",
  "preview",
  "metadata",
  "source",
  "links",
  "rights",
  "usage",
  "review",
  "versions",
  "audit",
  "properties"
] as const;
const MEDIA_ISSUES = [
  "all",
  "rights",
  "type",
  "binary",
  "source",
  "owner",
  "no-resource-candidate",
  "resource-candidate",
  "accessibility",
  "links",
  "needs-confirmation",
  "confirmed-rights",
  "usage-unavailable"
] as const;

export type MediaView = (typeof MEDIA_VIEWS)[number];
export type MediaSort = (typeof MEDIA_SORTS)[number];
export type MediaTab = (typeof MEDIA_TABS)[number];
export type MediaIssue = (typeof MEDIA_ISSUES)[number];

export type MediaUrlState = {
  view: MediaView;
  sort: MediaSort;
  query: string;
  selected: string;
  tab: MediaTab;
  issue: MediaIssue;
  ai: boolean;
};

export const MEDIA_URL_STATE_SCHEMA: UrlStateSchema<MediaUrlState> = {
  view: enumCodec("view", MEDIA_VIEWS, "all"),
  sort: enumCodec("sort", MEDIA_SORTS, "uploaded-desc"),
  query: {
    param: "query",
    defaultValue: "",
    parse: (raw) => raw?.trim() || undefined,
    serialize: (value) => value.trim(),
    omit: (value) => value.trim() === ""
  },
  selected: {
    param: "selected",
    defaultValue: "",
    parse: (raw) => raw?.trim() || undefined,
    serialize: (value) => value.trim(),
    omit: (value) => value.trim() === ""
  },
  tab: enumCodec("tab", MEDIA_TABS, "overview"),
  issue: enumCodec("issue", MEDIA_ISSUES, "all"),
  ai: {
    param: "ai",
    defaultValue: false,
    parse: (raw) => (raw === "1" || raw === "true" ? true : raw === "0" || raw === "false" ? false : undefined),
    serialize: (value) => (value ? "1" : null),
    omit: (value) => !value
  }
};

export function parseMediaUrlState(searchParams: UrlSearchParamsInput): MediaUrlState {
  return parseUrlState(searchParams, MEDIA_URL_STATE_SCHEMA);
}

export function serializeMediaUrlState(
  state: Partial<MediaUrlState>,
  base?: UrlSearchParamsInput
): URLSearchParams {
  return serializeUrlState(state, MEDIA_URL_STATE_SCHEMA, base);
}

const MEDIA_DUPLICATE_FILTERS = ["all", "same-title", "rights-unresolved"] as const;
const MEDIA_DUPLICATE_SORTS = ["evidence-desc", "updated-desc", "title"] as const;
const MEDIA_DUPLICATE_TABS = ["overview", "compare", "metadata", "links", "rights", "audit"] as const;

export type MediaDuplicateFilter = (typeof MEDIA_DUPLICATE_FILTERS)[number];
export type MediaDuplicateSort = (typeof MEDIA_DUPLICATE_SORTS)[number];
export type MediaDuplicateTab = (typeof MEDIA_DUPLICATE_TABS)[number];

export type MediaDuplicatesUrlState = {
  query: string;
  filter: MediaDuplicateFilter;
  sort: MediaDuplicateSort;
  selected: string;
  tab: MediaDuplicateTab;
  ai: boolean;
};

export const MEDIA_DUPLICATES_URL_STATE_SCHEMA: UrlStateSchema<MediaDuplicatesUrlState> = {
  query: {
    param: "query",
    defaultValue: "",
    parse: (raw) => raw?.trim() || undefined,
    serialize: (value) => value.trim(),
    omit: (value) => value.trim() === ""
  },
  filter: enumCodec("filter", MEDIA_DUPLICATE_FILTERS, "all"),
  sort: enumCodec("sort", MEDIA_DUPLICATE_SORTS, "evidence-desc"),
  selected: {
    param: "selected",
    defaultValue: "",
    parse(raw) {
      const value = raw?.trim() || "";
      return /^legacy-source-[a-f0-9]{8}-[a-f0-9]+$/.test(value) ? value : undefined;
    },
    serialize: (value) => value.trim(),
    omit: (value) => value.trim() === ""
  },
  tab: enumCodec("tab", MEDIA_DUPLICATE_TABS, "compare"),
  ai: {
    param: "ai",
    defaultValue: false,
    parse: (raw) => (raw === "1" || raw === "true" ? true : raw === "0" || raw === "false" ? false : undefined),
    serialize: (value) => (value ? "1" : null),
    omit: (value) => !value
  }
};

export function parseMediaDuplicatesUrlState(
  searchParams: UrlSearchParamsInput
): MediaDuplicatesUrlState {
  const params = toSearchParams(searchParams);
  if (!params.get("selected") && params.get("case")) {
    params.set("selected", params.get("case") || "");
  }
  return parseUrlState(params, MEDIA_DUPLICATES_URL_STATE_SCHEMA);
}

export function serializeMediaDuplicatesUrlState(
  state: Partial<MediaDuplicatesUrlState>,
  base?: UrlSearchParamsInput
): URLSearchParams {
  const params = serializeUrlState(state, MEDIA_DUPLICATES_URL_STATE_SCHEMA, base);
  params.delete("case");
  params.delete("view");
  params.delete("issue");
  return params;
}

const MEDIA_IN_USE_FILTERS = [
  "all",
  "projects",
  "reviews",
  "personal-ops",
  "attention",
  "legacy",
  "unreferenced"
] as const;
const MEDIA_IN_USE_SORTS = ["attention-desc", "locations-desc", "updated-desc", "title"] as const;
const MEDIA_IN_USE_TABS = [
  "overview",
  "usage",
  "rights",
  "versions",
  "links",
  "audit",
  "properties"
] as const;

export type MediaInUseFilter = (typeof MEDIA_IN_USE_FILTERS)[number];
export type MediaInUseSort = (typeof MEDIA_IN_USE_SORTS)[number];
export type MediaInUseTab = (typeof MEDIA_IN_USE_TABS)[number];

export type MediaInUseUrlState = {
  query: string;
  filter: MediaInUseFilter;
  sort: MediaInUseSort;
  selected: string;
  tab: MediaInUseTab;
  ai: boolean;
};

export const MEDIA_IN_USE_URL_STATE_SCHEMA: UrlStateSchema<MediaInUseUrlState> = {
  query: {
    param: "query",
    defaultValue: "",
    parse: (raw) => raw?.trim() || undefined,
    serialize: (value) => value.trim(),
    omit: (value) => value.trim() === ""
  },
  filter: enumCodec("filter", MEDIA_IN_USE_FILTERS, "all"),
  sort: enumCodec("sort", MEDIA_IN_USE_SORTS, "attention-desc"),
  selected: {
    param: "selected",
    defaultValue: "",
    parse: (raw) => raw?.trim() || undefined,
    serialize: (value) => value.trim(),
    omit: (value) => value.trim() === ""
  },
  tab: enumCodec("tab", MEDIA_IN_USE_TABS, "usage"),
  ai: {
    param: "ai",
    defaultValue: false,
    parse: (raw) => (raw === "1" || raw === "true" ? true : raw === "0" || raw === "false" ? false : undefined),
    serialize: (value) => (value ? "1" : null),
    omit: (value) => !value
  }
};

export function parseMediaInUseUrlState(searchParams: UrlSearchParamsInput): MediaInUseUrlState {
  const params = toSearchParams(searchParams);
  if (!params.get("selected") && params.get("asset")) {
    params.set("selected", params.get("asset") || "");
  }
  return parseUrlState(params, MEDIA_IN_USE_URL_STATE_SCHEMA);
}

export function serializeMediaInUseUrlState(
  state: Partial<MediaInUseUrlState>,
  base?: UrlSearchParamsInput
): URLSearchParams {
  const params = serializeUrlState(state, MEDIA_IN_USE_URL_STATE_SCHEMA, base);
  params.delete("asset");
  params.delete("view");
  params.delete("issue");
  params.delete("case");
  return params;
}

const MEDIA_UPLOAD_FILTERS = ["all", "needs-type", "possible-duplicate"] as const;
const MEDIA_UPLOAD_SORTS = ["added-desc", "filename", "size-desc"] as const;
const MEDIA_UPLOAD_TABS = ["intake", "metadata", "duplicates", "links", "rights", "log"] as const;

export type MediaUploadFilter = (typeof MEDIA_UPLOAD_FILTERS)[number];
export type MediaUploadSort = (typeof MEDIA_UPLOAD_SORTS)[number];
export type MediaUploadTab = (typeof MEDIA_UPLOAD_TABS)[number];

export type MediaUploadUrlState = {
  filter: MediaUploadFilter;
  sort: MediaUploadSort;
  tab: MediaUploadTab;
  ai: boolean;
};

export const MEDIA_UPLOAD_URL_STATE_SCHEMA: UrlStateSchema<MediaUploadUrlState> = {
  filter: enumCodec("filter", MEDIA_UPLOAD_FILTERS, "all"),
  sort: enumCodec("sort", MEDIA_UPLOAD_SORTS, "added-desc"),
  tab: enumCodec("tab", MEDIA_UPLOAD_TABS, "intake"),
  ai: {
    param: "ai",
    defaultValue: false,
    parse: (raw) => (raw === "1" || raw === "true" ? true : raw === "0" || raw === "false" ? false : undefined),
    serialize: (value) => (value ? "1" : null),
    omit: (value) => !value
  }
};

export function parseMediaUploadUrlState(
  searchParams: UrlSearchParamsInput
): MediaUploadUrlState {
  return parseUrlState(searchParams, MEDIA_UPLOAD_URL_STATE_SCHEMA);
}

export function serializeMediaUploadUrlState(
  state: Partial<MediaUploadUrlState>,
  base?: UrlSearchParamsInput
): URLSearchParams {
  return serializeUrlState(state, MEDIA_UPLOAD_URL_STATE_SCHEMA, base);
}

const PROJECT_VIEWS = [
  "all",
  "active",
  "planned",
  "attention",
  "due",
  "needs-review",
  "blocked",
  "linked",
  "archived"
] as const;
const PROJECT_FILTERS = [
  "all",
  "active",
  "planned",
  "due",
  "needs-review",
  "blocked",
  "linked",
  "missing-owner",
  "stale",
  "archived"
] as const;
const PROJECT_SORTS = [
  "attention-updated",
  "updated-desc",
  "title",
  "priority",
  "due"
] as const;
const PROJECT_TABS = [
  "overview",
  "timeline",
  "notes-decisions",
  "people",
  "files-links",
  "properties"
] as const;

export type ProjectView = (typeof PROJECT_VIEWS)[number];
export type ProjectFilter = (typeof PROJECT_FILTERS)[number];
export type ProjectSort = (typeof PROJECT_SORTS)[number];
export type ProjectTab = (typeof PROJECT_TABS)[number];

export type ProjectsUrlState = {
  view: ProjectView;
  filter: ProjectFilter;
  sort: ProjectSort;
  query: string;
  item: string;
  tab: ProjectTab;
  compact: boolean;
  ai: boolean;
};

export const PROJECTS_URL_STATE_SCHEMA: UrlStateSchema<ProjectsUrlState> = {
  view: enumCodec("view", PROJECT_VIEWS, "all"),
  filter: enumCodec("filter", PROJECT_FILTERS, "all"),
  sort: enumCodec("sort", PROJECT_SORTS, "attention-updated"),
  query: {
    param: "query",
    defaultValue: "",
    parse: (raw) => raw?.trim() || undefined,
    serialize: (value) => value.trim(),
    omit: (value) => value.trim() === ""
  },
  item: {
    param: "item",
    defaultValue: "",
    parse: (raw) => raw?.trim() || undefined,
    serialize: (value) => value.trim(),
    omit: (value) => value.trim() === ""
  },
  tab: enumCodec("tab", PROJECT_TABS, "overview"),
  compact: {
    param: "compact",
    defaultValue: false,
    parse: (raw) => (raw === "1" || raw === "true" ? true : raw === "0" || raw === "false" ? false : undefined),
    serialize: (value) => (value ? "1" : null),
    omit: (value) => !value
  },
  ai: {
    param: "ai",
    defaultValue: false,
    parse: (raw) => (raw === "1" || raw === "true" ? true : raw === "0" || raw === "false" ? false : undefined),
    serialize: (value) => (value ? "1" : null),
    omit: (value) => !value
  }
};

export function parseProjectsUrlState(searchParams: UrlSearchParamsInput): ProjectsUrlState {
  return parseUrlState(searchParams, PROJECTS_URL_STATE_SCHEMA);
}

export function serializeProjectsUrlState(
  state: Partial<ProjectsUrlState>,
  base?: UrlSearchParamsInput
): URLSearchParams {
  return serializeUrlState(state, PROJECTS_URL_STATE_SCHEMA, base);
}

const REVIEWS_VIEWS = [
  "all",
  "current",
  "open",
  "needs-evidence",
  "completed",
  "archived"
] as const;
const REVIEW_CADENCES = ["all", "weekly", "monthly", "quarterly", "annual", "custom"] as const;
const REVIEWS_FILTERS = [
  "all",
  "current",
  "open",
  "needs-evidence",
  "blocked",
  "completed",
  "archived"
] as const;
const REVIEWS_SORTS = ["cadence-due", "due", "updated-desc", "title"] as const;
const REVIEWS_TABS = [
  "overview",
  "checklist",
  "evidence",
  "decisions",
  "follow-ups",
  "finance",
  "properties"
] as const;

export type ReviewsView = (typeof REVIEWS_VIEWS)[number];
export type ReviewsCadence = (typeof REVIEW_CADENCES)[number];
export type ReviewsFilter = (typeof REVIEWS_FILTERS)[number];
export type ReviewsSort = (typeof REVIEWS_SORTS)[number];
export type ReviewsTab = (typeof REVIEWS_TABS)[number];

export type ReviewsUrlState = {
  review: string;
  view: ReviewsView;
  cadence: ReviewsCadence;
  filter: ReviewsFilter;
  sort: ReviewsSort;
  query: string;
  tab: ReviewsTab;
  item: string;
  compact: boolean;
  ai: boolean;
};

export const REVIEWS_URL_STATE_SCHEMA: UrlStateSchema<ReviewsUrlState> = {
  review: {
    param: "review",
    defaultValue: "",
    parse: (raw) => raw?.trim() || undefined,
    serialize: (value) => value.trim(),
    omit: (value) => value.trim() === ""
  },
  view: enumCodec("view", REVIEWS_VIEWS, "all"),
  cadence: enumCodec("cadence", REVIEW_CADENCES, "all"),
  filter: enumCodec("filter", REVIEWS_FILTERS, "all"),
  sort: enumCodec("sort", REVIEWS_SORTS, "cadence-due"),
  query: {
    param: "query",
    defaultValue: "",
    parse: (raw) => raw?.trim() || undefined,
    serialize: (value) => value.trim(),
    omit: (value) => value.trim() === ""
  },
  tab: enumCodec("tab", REVIEWS_TABS, "overview"),
  item: {
    param: "item",
    defaultValue: "",
    parse: (raw) => raw?.trim() || undefined,
    serialize: (value) => value.trim(),
    omit: (value) => value.trim() === ""
  },
  compact: {
    param: "compact",
    defaultValue: false,
    parse: (raw) => (raw === "1" || raw === "true" ? true : raw === "0" || raw === "false" ? false : undefined),
    serialize: (value) => (value ? "1" : null),
    omit: (value) => !value
  },
  ai: {
    param: "ai",
    defaultValue: false,
    parse: (raw) => (raw === "1" || raw === "true" ? true : raw === "0" || raw === "false" ? false : undefined),
    serialize: (value) => (value ? "1" : null),
    omit: (value) => !value
  }
};

export function parseReviewsUrlState(searchParams: UrlSearchParamsInput): ReviewsUrlState {
  return parseUrlState(searchParams, REVIEWS_URL_STATE_SCHEMA);
}

export function serializeReviewsUrlState(
  state: Partial<ReviewsUrlState>,
  base?: UrlSearchParamsInput
): URLSearchParams {
  return serializeUrlState(state, REVIEWS_URL_STATE_SCHEMA, base);
}
