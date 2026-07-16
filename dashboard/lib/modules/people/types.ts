import type { MutationError, MutationResult } from "../../native-objects/mutation-result";
import type { CadenceState, NativeObjectRef } from "../../native-objects/types";

export type PeopleRecordType = "person" | "organization";

export type PeopleLegacyStatus =
  | "idea"
  | "draft"
  | "active"
  | "completed"
  | "blocked"
  | "inactive"
  | "next";

export type PeopleProfileStatus = "active" | "dormant" | "archived";

export type PeopleCadenceState = CadenceState | "unknown";

export type PeopleContactProfile = {
  fullName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  nickname?: string;
  context?: string;
  birthday?: string;
  phoneNumber?: string;
  primaryEmail?: string;
  workEmail?: string;
  universityEmail?: string;
  primaryOccupation?: string;
  primaryEmployer?: string;
  secondaryOccupation?: string;
  secondaryEmployer?: string;
  pastOccupation?: string;
  pastEmployer?: string;
  universityAffiliation?: string;
  livesIn?: string;
  comesFrom?: string;
  associatedPeople: string[];
  lastContact?: string;
  nextContact?: string;
  contactCadence?: string;
  interestingFact?: string;
  lifeDream?: string;
  notes?: string;
  linkedin?: string;
  website?: string;
  partner?: string;
  children: string[];
  interactions: string[];
  memories: string[];
};

export type PeopleTime = {
  startDate?: string;
  startTime?: string;
  dueDate?: string;
  dueTime?: string;
  reviewCadence?: string;
  nextReview?: string;
  lastReview?: string;
  processedOn?: string;
};

export type PeopleRelations = {
  north: string[];
  south: string[];
  east: string[];
  west: string[];
  stakeholders: string[];
  stakeholdings: string[];
  internalSources: string[];
  related: string[];
};

export type PeopleRecord = {
  id: string;
  nativeRef: NativeObjectRef;
  type: PeopleRecordType;
  fullName: string;
  profileStatus: PeopleProfileStatus;
  legacyStatus: PeopleLegacyStatus;
  context: string;
  profile: PeopleContactProfile;
  time: PeopleTime;
  areas: string[];
  subjects: string[];
  projects: string[];
  externalSources: string[];
  relations: PeopleRelations;
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
  source: {
    kind: "legacy_personal_record";
    recordId: string;
    domain: string;
    className: "person" | "org";
  };
};

export type PeopleCreateInput = {
  fullName: string;
  type?: PeopleRecordType;
  status?: PeopleLegacyStatus;
  context?: string;
  profile?: Partial<PeopleContactProfile>;
  time?: Partial<PeopleTime>;
  areas?: string[];
  subjects?: string[];
  projects?: string[];
  externalSources?: string[];
  sourceUrl?: string;
};

export type PeopleUpdateInput = {
  fullName?: string;
  status?: PeopleLegacyStatus;
  context?: string;
  profile?: Partial<PeopleContactProfile>;
  time?: Partial<PeopleTime>;
  areas?: string[];
  subjects?: string[];
  projects?: string[];
  externalSources?: string[];
  sourceUrl?: string;
  markReviewed?: boolean;
};

export type PeopleMutationError = MutationError;
export type PeopleMutationResult<T> = MutationResult<T>;

export type PeopleDirectoryItem = {
  id: string;
  fullName: string;
  type: PeopleRecordType;
  profileStatus: PeopleProfileStatus;
  legacyStatus: PeopleLegacyStatus;
  cadenceState: PeopleCadenceState;
  relationshipLabel: string;
  primaryEmail?: string;
  phoneNumber?: string;
  location?: string;
  occupation?: string;
  employer?: string;
  lastContactAt?: string;
  nextFollowUpAt?: string;
  projects: string[];
  updatedAt: string;
};

export type PeopleViewModel = {
  total: number;
  filteredTotal: number;
  items: PeopleDirectoryItem[];
  selected: PeopleRecord | null;
};
