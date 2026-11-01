import type { NativeObjectRef } from "../../native-objects/types";
import type { PersonalInteractionDetails, StoredNoteType } from "../../personal-records-store";
import type { GoalKeyResult } from "../personal-ops/types";

export function editableCalendarRef(ref: NativeObjectRef) {
  return (ref.module === "notes" && ref.objectType === "note") ||
    (ref.module === "people" && ref.objectType === "interaction") ||
    (ref.module === "personal_ops" && ["goal", "decision", "follow_up"].includes(ref.objectType));
}
export type CalendarWorkItem = {
  id: string; kind: "note" | "interaction" | "goal" | "decision" | "follow_up";
  title: string; updatedAt: string; body: string; status: string; readOnly?: boolean;
  archiveReason?: string; dueAt?: string; noteType?: StoredNoteType; interaction?: PersonalInteractionDetails;
  outcome?: string; question?: string; finalDecision?: string; deferReason?: string;
  revisitAt?: string; replacementId?: string; keyResults?: GoalKeyResult[];
};
export type CalendarWorkResult = {
  items: CalendarWorkItem[];
  replacements: { id: string; title: string }[];
};
