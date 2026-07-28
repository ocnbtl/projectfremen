export type ResourceReviewCadenceChoice =
  | "manual"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "annual"
  | "legacy";

export const RESOURCE_REVIEW_CADENCE_OPTIONS: readonly {
  value: Exclude<ResourceReviewCadenceChoice, "legacy">;
  label: string;
}[] = [
  { value: "manual", label: "Manual / one-time" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" }
];

const CADENCE_BY_CHOICE: Readonly<
  Record<Exclude<ResourceReviewCadenceChoice, "manual" | "legacy">, string>
> = {
  weekly: "P1W",
  monthly: "P1M",
  quarterly: "P3M",
  annual: "P1Y"
};

export function normalizeResourceReviewCadence(value?: string): string {
  return value?.trim().toUpperCase() || "";
}

export function resourceReviewCadenceChoiceFor(
  value?: string
): ResourceReviewCadenceChoice {
  const cadence = normalizeResourceReviewCadence(value);
  if (!cadence || cadence === "MANUAL") return "manual";
  const match = Object.entries(CADENCE_BY_CHOICE).find(([, code]) => code === cadence);
  return (match?.[0] as ResourceReviewCadenceChoice | undefined) || "legacy";
}

export function resourceReviewCadenceValue(
  choice: ResourceReviewCadenceChoice,
  legacyValue = ""
): string {
  if (choice === "manual") return "";
  if (choice === "legacy") return normalizeResourceReviewCadence(legacyValue);
  return CADENCE_BY_CHOICE[choice];
}

export function formatResourceReviewCadence(value?: string): string {
  const cadence = normalizeResourceReviewCadence(value);
  if (!cadence || cadence === "MANUAL") return "Manual / one-time";
  if (cadence === "P1W") return "Weekly";
  if (cadence === "P1M") return "Monthly";
  if (cadence === "P3M") return "Quarterly";
  if (cadence === "P1Y") return "Annual";
  return `Existing legacy interval · ${cadence}`;
}
