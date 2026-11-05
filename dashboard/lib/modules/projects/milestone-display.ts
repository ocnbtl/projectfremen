import type { ProjectMilestoneState } from "./types";

// Milestones record progress, not overdue tasks. Keep persisted legacy states.
export function milestoneLabel(state: ProjectMilestoneState) {
  return ({planned:"Upcoming",open:"Upcoming",active:"In progress",due:"Upcoming",blocked:"Blocked",complete:"Reached",archived:"Archived"})[state];
}
