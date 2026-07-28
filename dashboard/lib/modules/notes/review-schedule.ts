export type NoteReviewCadenceChoice =
  | "once"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "annual"
  | "custom";

export const NOTE_REVIEW_CADENCE_OPTIONS: readonly {
  value: NoteReviewCadenceChoice;
  label: string;
}[] = [
  { value: "once", label: "One-time review" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "custom", label: "Custom interval" }
];

const CADENCE_BY_CHOICE: Readonly<
  Record<Exclude<NoteReviewCadenceChoice, "once" | "custom">, string>
> = {
  weekly: "P1W",
  monthly: "P1M",
  quarterly: "P3M",
  annual: "P1Y"
};

export function normalizeNoteReviewCadence(value?: string): string {
  return value?.trim().toUpperCase() || "";
}

export function noteReviewCadenceChoiceFor(
  value?: string
): NoteReviewCadenceChoice {
  const cadence = normalizeNoteReviewCadence(value);
  if (!cadence) return "once";
  const match = Object.entries(CADENCE_BY_CHOICE).find(([, code]) => code === cadence);
  return (match?.[0] as NoteReviewCadenceChoice | undefined) || "custom";
}

export function noteReviewCadenceValue(
  choice: NoteReviewCadenceChoice,
  customValue: string
): string {
  if (choice === "once") return "";
  if (choice === "custom") return normalizeNoteReviewCadence(customValue);
  return CADENCE_BY_CHOICE[choice];
}

export function isValidNoteReviewCadence(value: string): boolean {
  return /^P[1-9]\d*[DWMY]$/.test(normalizeNoteReviewCadence(value));
}

export function formatNoteReviewCadence(value?: string): string {
  const cadence = normalizeNoteReviewCadence(value);
  if (!cadence) return "One-time";
  if (cadence === "P1W") return "Weekly";
  if (cadence === "P1M") return "Monthly";
  if (cadence === "P3M") return "Quarterly";
  if (cadence === "P1Y") return "Annual";

  const match = cadence.match(/^P(\d+)([DWMY])$/);
  if (!match) return `Custom · ${cadence}`;
  const amount = Number(match[1]);
  const unit = {
    D: "day",
    W: "week",
    M: "month",
    Y: "year"
  }[match[2]];
  return `Every ${amount} ${unit}${amount === 1 ? "" : "s"}`;
}
