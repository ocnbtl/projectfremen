import type { PersonalInteractionKind } from "../../personal-records-store";

export const INTERACTION_KINDS: {value:PersonalInteractionKind;label:string}[] = [
  {value:"meeting",label:"Meeting"},{value:"call",label:"Call"},{value:"catch-up",label:"Catch-up"},
  {value:"ran-into",label:"Ran into"},{value:"message",label:"Message"},{value:"email",label:"Email"},
  {value:"hired",label:"Hired someone"},{value:"service",label:"Service / appointment"},
  {value:"introduction",label:"Introduction"},{value:"interview",label:"Interview"},
  {value:"memory",label:"Shared experience"},{value:"milestone",label:"Milestone"},{value:"note",label:"Other"}
];
export function interactionKind(value:unknown): PersonalInteractionKind | "none" {
  if(value === "none" || INTERACTION_KINDS.some(kind=>kind.value===value))return value as PersonalInteractionKind | "none";
  throw new Error("Choose a valid interaction type");
}
