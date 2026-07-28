export type MediaReviewCadenceChoice =
  | "manual"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "annual"
  | "legacy";

export const MEDIA_REVIEW_CADENCE_OPTIONS: readonly {
  value: Exclude<MediaReviewCadenceChoice, "legacy">;
  label: string;
}[] = [
  { value: "manual", label: "Manual / one-time" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" }
];

const CADENCE_BY_CHOICE: Readonly<
  Record<Exclude<MediaReviewCadenceChoice, "manual" | "legacy">, string>
> = {
  weekly: "P1W",
  monthly: "P1M",
  quarterly: "P3M",
  annual: "P1Y"
};

export function normalizeMediaReviewCadence(value?: string): string {
  return value?.trim().toUpperCase() || "";
}

export function mediaReviewCadenceChoiceFor(
  value?: string
): MediaReviewCadenceChoice {
  const cadence = normalizeMediaReviewCadence(value);
  if (!cadence || cadence === "MANUAL") return "manual";
  const match = Object.entries(CADENCE_BY_CHOICE).find(([, code]) => code === cadence);
  return (match?.[0] as MediaReviewCadenceChoice | undefined) || "legacy";
}

export function mediaReviewCadenceValue(
  choice: MediaReviewCadenceChoice,
  legacyValue = ""
): string {
  if (choice === "manual") return "";
  if (choice === "legacy") return normalizeMediaReviewCadence(legacyValue);
  return CADENCE_BY_CHOICE[choice];
}

export function formatMediaReviewCadence(value?: string): string {
  const cadence = normalizeMediaReviewCadence(value);
  if (!cadence || cadence === "MANUAL") return "Manual / one-time";
  if (cadence === "P1W") return "Weekly";
  if (cadence === "P1M") return "Monthly";
  if (cadence === "P3M") return "Quarterly";
  if (cadence === "P1Y") return "Annual";
  return `Existing legacy interval · ${cadence}`;
}
