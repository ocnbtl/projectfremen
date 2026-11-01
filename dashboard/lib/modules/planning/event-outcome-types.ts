import type { EventFields } from "./types";
import type { NativeObjectRef } from "../../native-objects/types";
import type { PersonalInteractionKind } from "../../personal-records-store";
export type OutcomeSource = {family:"events"|"followUps"|"decisions";id:string;occurrenceKey:string;expectedUpdatedAt:string};
export type OutcomeInput = {
  interactionKind: PersonalInteractionKind | "none";
  note:string;
  decision?:string;
  nextSteps:{type:"follow_up"|"decision"|"goal";title:string;dueAt?:string}[];
};
export type OutcomeReceipt = {
  id:string; source:OutcomeSource; input:OutcomeInput; event:EventFields; sourceRef:NativeObjectRef;
  createdAt:string; completedAt?:string; refs?:NativeObjectRef[];
};
