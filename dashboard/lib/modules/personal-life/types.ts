import type { NativeObjectRef } from "../../native-objects/types";

export const PERSONAL_LIFE_SCHEMA_VERSION = 1 as const;

export const PERSONAL_LIFE_COLLECTIONS = ["lists", "trips", "buildItems", "vehicles"] as const;

export type PersonalLifeCollection = (typeof PERSONAL_LIFE_COLLECTIONS)[number];

export type PersonalLifeBase = {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type PersonalListKind = "shopping" | "watchlist" | "favorites" | "packing" | "custom";

export type PersonalListItem = {
  id: string;
  text: string;
  note: string;
  completed: boolean;
};

export const PERSONAL_LIST_COLUMN_TYPES = ["text", "date", "price", "place", "time", "rating", "person", "object"] as const;

export type PersonalListColumnType = (typeof PERSONAL_LIST_COLUMN_TYPES)[number];

export type PersonalListColumn = {
  id: string;
  label: string;
  type: PersonalListColumnType;
};

export type PersonalListCell = {
  value: string;
  ref?: NativeObjectRef;
};

export type PersonalListRow = {
  id: string;
  completed: boolean;
  cells: Record<string, PersonalListCell>;
};

export type PersonalList = PersonalLifeBase & {
  title: string;
  description: string;
  kind: PersonalListKind;
  /** Compatibility projection retained for legacy consumers. */
  items: PersonalListItem[];
  columns: PersonalListColumn[];
  rows: PersonalListRow[];
};

export type TripStatus = "been" | "want" | "lived" | "planned";
export type TravelMode = "car" | "plane" | "train" | "boat" | "bus" | "bike" | "walk" | "other";

export type PersonalTrip = PersonalLifeBase & {
  name: string;
  place: string;
  region: string;
  status: TripStatus;
  travelMode: TravelMode;
  latitude: number;
  longitude: number;
  startDate: string;
  endDate: string;
  notes: string;
};

export type BuildItemStatus = "wanted" | "researching" | "acquired" | "retired";

export type PersonalBuildItem = PersonalLifeBase & {
  name: string;
  category: string;
  status: BuildItemStatus;
  targetDate: string;
  budget: string;
  notes: string;
};

export type VehicleStatus = "current" | "future" | "previous";
export type VehicleModificationStatus = "idea" | "researching" | "planned" | "installed" | "skipped";

export type VehicleModification = {
  id: string;
  name: string;
  category: string;
  status: VehicleModificationStatus;
  estimate: string;
  notes: string;
};

export type PersonalVehicle = PersonalLifeBase & {
  name: string;
  year: string;
  make: string;
  model: string;
  trim: string;
  status: VehicleStatus;
  vinNote: string;
  notes: string;
  modifications: VehicleModification[];
};

export type PersonalLifeState = {
  schemaVersion: typeof PERSONAL_LIFE_SCHEMA_VERSION;
  lists: PersonalList[];
  trips: PersonalTrip[];
  buildItems: PersonalBuildItem[];
  vehicles: PersonalVehicle[];
};

export type PersonalLifeObjectByCollection = {
  lists: PersonalList;
  trips: PersonalTrip;
  buildItems: PersonalBuildItem;
  vehicles: PersonalVehicle;
};

export type PersonalLifeInputByCollection = {
  lists: Omit<PersonalList, keyof PersonalLifeBase>;
  trips: Omit<PersonalTrip, keyof PersonalLifeBase>;
  buildItems: Omit<PersonalBuildItem, keyof PersonalLifeBase>;
  vehicles: Omit<PersonalVehicle, keyof PersonalLifeBase>;
};
