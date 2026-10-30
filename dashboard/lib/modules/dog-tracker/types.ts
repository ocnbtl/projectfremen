export const DOG_TRACKER_SCHEMA_VERSION = 1 as const;

export const PET_CARE_KINDS = [
  { id: "feed", label: "Food", icon: "meals" }, { id: "water", label: "Water", icon: "droplet" },
  { id: "walk", label: "Walk", icon: "walk" }, { id: "activity", label: "Activity", icon: "fitness" },
  { id: "medication", label: "Medication", icon: "health" }, { id: "vet", label: "Vet visit", icon: "health" },
  { id: "vaccination", label: "Vaccination", icon: "health" }, { id: "grooming", label: "Grooming", icon: "dog" },
  { id: "habitat", label: "Habitat care", icon: "place-tag-house" }, { id: "bathroom", label: "Bathroom", icon: "droplet" },
  { id: "measurement", label: "Weight / measurement", icon: "calendar-group-scale" }, { id: "other", label: "Other care", icon: "notes" }
] as const;
export type DogCareKind = typeof PET_CARE_KINDS[number]["id"];
export const LEGACY_PET_ID = "legacy-dog";
export const PET_PROFILE_FIELDS = [
  { id: "breed", label: "Breed / variety" }, { id: "sex", label: "Sex" },
  { id: "birthday", label: "Birthday", type: "date" }, { id: "adopted", label: "Adoption date", type: "date" },
  { id: "microchip", label: "Microchip / identification" }, { id: "weight", label: "Weight & unit" },
  { id: "diet", label: "Food & feeding instructions", long: true }, { id: "water", label: "Water instructions", long: true },
  { id: "habitat", label: "Habitat & environment", long: true }, { id: "activity", label: "Activity & enrichment", long: true },
  { id: "allergies", label: "Allergies & medical conditions", long: true }, { id: "medications", label: "Medication instructions", long: true },
  { id: "vet", label: "Vet / clinic" }, { id: "vetPhone", label: "Vet phone" },
  { id: "emergency", label: "Emergency / caregiver contact", long: true }, { id: "insurance", label: "Insurance / policy" },
  { id: "notes", label: "Care notes", long: true }
] as const;
export type PetProfile = { id: string; name: string; species: string; fields: Record<string,string>; archived: boolean; createdAt: string; updatedAt: string };
export type PetInput = Pick<PetProfile,"name"|"species"|"fields"|"archived">;

export type DogCareEvent = {
  id: string;
  kind: DogCareKind;
  occurredAt: string;
  peed: boolean;
  pooped: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
  petId?: string;
  title?: string;
  status?: "planned" | "completed";
  amount?: string;
  instructions?: string;
  nextDue?: string;
  archived?: boolean;
};

export type DogTrackerState = {
  schemaVersion: typeof DOG_TRACKER_SCHEMA_VERSION;
  events: DogCareEvent[];
  pets?: PetProfile[];
};

export type DogCareInput = Pick<DogCareEvent, "kind" | "occurredAt" | "peed" | "pooped" | "notes" | "petId" | "title" | "status" | "amount" | "instructions" | "nextDue" | "archived">;
