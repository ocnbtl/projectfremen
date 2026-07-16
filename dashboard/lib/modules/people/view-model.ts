import type {
  PeopleCadenceState,
  PeopleDirectoryItem,
  PeopleRecord,
  PeopleViewModel
} from "./types";

export type PeopleSort = "name" | "recent" | "next_contact";

export type PeopleViewOptions = {
  query?: string;
  selectedId?: string;
  sort?: PeopleSort;
  now?: Date;
};

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function derivePeopleCadenceState(person: PeopleRecord, now = new Date()): PeopleCadenceState {
  if (person.profileStatus === "archived") return "paused";
  if (person.profileStatus === "dormant") return "dormant";

  const next = parseDate(person.profile.nextContact || person.time.nextReview);
  const last = parseDate(person.profile.lastContact || person.time.lastReview);
  if (!next) return last ? "unknown" : "dormant";

  const days = Math.ceil((next.getTime() - now.getTime()) / 86400000);
  if (days <= 0) return "overdue";
  if (days <= 7) return "due_soon";
  return "current";
}

export function peopleRecordToDirectoryItem(
  person: PeopleRecord,
  now = new Date()
): PeopleDirectoryItem {
  return {
    id: person.id,
    fullName: person.fullName,
    type: person.type,
    profileStatus: person.profileStatus,
    legacyStatus: person.legacyStatus,
    cadenceState: derivePeopleCadenceState(person, now),
    relationshipLabel: person.subjects[0] || person.profile.context || "Relationship",
    primaryEmail: person.profile.primaryEmail,
    phoneNumber: person.profile.phoneNumber,
    location: person.profile.livesIn,
    occupation: person.profile.primaryOccupation,
    employer: person.profile.primaryEmployer,
    lastContactAt: person.profile.lastContact || person.time.lastReview,
    nextFollowUpAt: person.profile.nextContact || person.time.nextReview,
    projects: [...person.projects],
    updatedAt: person.updatedAt
  };
}

function searchableText(person: PeopleRecord): string {
  return [
    person.fullName,
    person.context,
    person.profile.nickname,
    person.profile.primaryEmail,
    person.profile.workEmail,
    person.profile.phoneNumber,
    person.profile.primaryOccupation,
    person.profile.primaryEmployer,
    person.profile.livesIn,
    ...person.subjects,
    ...person.projects
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function comparePeople(left: PeopleRecord, right: PeopleRecord, sort: PeopleSort): number {
  if (sort === "recent") return right.updatedAt.localeCompare(left.updatedAt);
  if (sort === "next_contact") {
    const leftDate = left.profile.nextContact || left.time.nextReview || "9999-12-31";
    const rightDate = right.profile.nextContact || right.time.nextReview || "9999-12-31";
    const byDate = leftDate.localeCompare(rightDate);
    if (byDate !== 0) return byDate;
  }
  return left.fullName.localeCompare(right.fullName, undefined, { sensitivity: "base" });
}

export function buildPeopleViewModel(
  people: PeopleRecord[],
  options: PeopleViewOptions = {}
): PeopleViewModel {
  const query = options.query?.trim().toLowerCase() || "";
  const sort = options.sort || "name";
  const now = options.now || new Date();
  const filtered = people
    .filter((person) => !query || searchableText(person).includes(query))
    .sort((left, right) => comparePeople(left, right, sort));

  return {
    total: people.length,
    filteredTotal: filtered.length,
    items: filtered.map((person) => peopleRecordToDirectoryItem(person, now)),
    selected: people.find((person) => person.id === options.selectedId) || null
  };
}
