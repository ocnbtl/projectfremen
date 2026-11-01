/** Presentation only: persisted status values and workflow rules stay unchanged. */
export const PERSONAL_STATUS_LABELS: Record<string, string> = {
  considering: "Considering", paused: "On hold", cancelled: "Cancelled",
  draft: "Draft", planned: "Planned", active: "In progress", open: "Open",
  scheduled: "Scheduled", waiting: "Waiting", blocked: "Blocked",
  deferred: "On hold", complete: "Complete", decided: "Decided",
  superseded: "Replaced", carried_forward: "Carried over", archived: "Archived"
};
export const PERSONAL_STATUS_OPTIONS = {
  goal: ["draft", "planned", "active", "waiting", "blocked", "paused", "complete", "cancelled", "archived"],
  decision: ["open", "considering", "waiting", "deferred", "decided", "cancelled", "superseded", "archived"],
  obligation: ["open", "waiting", "blocked", "complete", "archived"],
  follow_up: ["open", "scheduled", "waiting", "deferred", "complete", "carried_forward", "archived"]
} as const;
export function personalStatusLabel(value: string) {
  return PERSONAL_STATUS_LABELS[value] || value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
