import type {
  PersonalContactProfile,
  PersonalRecord,
  PersonalRecordInput,
  PersonalRecordPatch,
  PersonalRecordStatus
} from "../../personal-records-store";
import { createNativeObjectRef } from "../../native-objects/routes";
import type {
  PeopleContactProfile,
  PeopleCreateInput,
  PeopleLegacyStatus,
  PeopleProfileStatus,
  PeopleRecord,
  PeopleUpdateInput
} from "./types";

type LegacyPeopleRecord = PersonalRecord & { className: "person" | "org" };

const EMPTY_PROFILE_LISTS = {
  associatedPeople: [],
  children: [],
  interactions: [],
  memories: []
} satisfies Pick<
  PeopleContactProfile,
  "associatedPeople" | "children" | "interactions" | "memories"
>;

function copyProfile(profile?: PersonalContactProfile): PeopleContactProfile {
  return {
    ...EMPTY_PROFILE_LISTS,
    ...profile,
    associatedPeople: [...(profile?.associatedPeople || [])],
    children: [...(profile?.children || [])],
    interactions: [...(profile?.interactions || [])],
    memories: [...(profile?.memories || [])]
  };
}

function profileStatus(status: PersonalRecordStatus): PeopleProfileStatus {
  return status === "inactive" ? "dormant" : "active";
}

export function isLegacyPeopleRecord(record: PersonalRecord): record is LegacyPeopleRecord {
  return record.className === "person" || record.className === "org";
}

export function legacyPersonalRecordToPeopleRecord(record: LegacyPeopleRecord): PeopleRecord {
  const profile = copyProfile(record.profile);
  const fullName = profile.fullName?.trim() || record.title;

  return {
    id: record.id,
    nativeRef: createNativeObjectRef({
      module: "people",
      objectType: record.className === "org" ? "organization" : "person",
      objectId: record.id,
      label: fullName
    }),
    type: record.className === "org" ? "organization" : "person",
    fullName,
    profileStatus: profileStatus(record.status),
    legacyStatus: record.status as PeopleLegacyStatus,
    context: profile.context || record.body,
    profile,
    time: { ...record.time },
    areas: [...record.areas],
    subjects: [...record.subjects],
    projects: [...record.projects],
    externalSources: [...record.externalSources],
    relations: {
      north: [...record.relations.north],
      south: [...record.relations.south],
      east: [...record.relations.east],
      west: [...record.relations.west],
      stakeholders: [...record.relations.stakeholders],
      stakeholdings: [...record.relations.stakeholdings],
      internalSources: [...record.relations.internalSources],
      related: [...record.relations.related]
    },
    sourceUrl: record.url,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    source: {
      kind: "legacy_personal_record",
      recordId: record.id,
      domain: record.domain,
      className: record.className
    }
  };
}

export function legacyPersonalRecordsToPeople(records: PersonalRecord[]): PeopleRecord[] {
  return records.filter(isLegacyPeopleRecord).map(legacyPersonalRecordToPeopleRecord);
}

function mergedProfile(
  fullName: string | undefined,
  profile: Partial<PeopleContactProfile> | undefined
): Partial<PersonalContactProfile> | undefined {
  if (!fullName && !profile) {
    return undefined;
  }
  return {
    ...profile,
    fullName: fullName || profile?.fullName
  } as Partial<PersonalContactProfile>;
}

function mergedTime(
  time: PeopleCreateInput["time"] | PeopleUpdateInput["time"],
  profile: Partial<PeopleContactProfile> | undefined
) {
  const next = { ...time };
  if (profile && Object.prototype.hasOwnProperty.call(profile, "contactCadence") && next.reviewCadence === undefined) {
    next.reviewCadence = profile.contactCadence;
  }
  if (profile && Object.prototype.hasOwnProperty.call(profile, "lastContact") && next.lastReview === undefined) {
    next.lastReview = profile.lastContact;
  }
  if (profile && Object.prototype.hasOwnProperty.call(profile, "nextContact") && next.nextReview === undefined) {
    next.nextReview = profile.nextContact;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function peopleCreateInputToLegacy(input: PeopleCreateInput): PersonalRecordInput {
  const profile = mergedProfile(input.fullName, input.profile);
  return {
    domain: "notes-docs",
    title: input.fullName,
    className: input.type === "organization" ? "org" : "person",
    status: input.status || "active",
    body: input.context ?? input.profile?.context ?? "",
    privacy: "private",
    stage: "processed",
    areas: input.areas || ["Relationships"],
    subjects: input.subjects || [],
    projects: input.projects || [],
    intents: ["connect"],
    url: input.sourceUrl,
    externalSources: input.externalSources || (input.sourceUrl ? [input.sourceUrl] : []),
    time: mergedTime(input.time, input.profile),
    profile
  };
}

export function peopleUpdateInputToLegacy(input: PeopleUpdateInput): PersonalRecordPatch {
  const requestedName = input.fullName ?? input.profile?.fullName;
  const profile = mergedProfile(requestedName, input.profile);
  return {
    title: requestedName,
    status: input.status,
    action: input.markReviewed ? "review" : undefined,
    body: input.context ?? input.profile?.context,
    url: input.sourceUrl,
    areas: input.areas,
    subjects: input.subjects,
    projects: input.projects,
    externalSources: input.externalSources,
    time: mergedTime(input.time, input.profile),
    profile
  };
}
