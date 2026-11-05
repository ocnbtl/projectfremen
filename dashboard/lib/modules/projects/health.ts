import type { HealthState } from "../../native-objects/types";
import type { Project, ProjectsState } from "./types";

export function deriveProjectHealth(project: Pick<Project, "id" | "lifecycle" | "objectives">, state: Pick<ProjectsState, "blockers" | "milestones">, now: string): HealthState {
  if (project.lifecycle === "archived") return "unknown";
  if (project.lifecycle === "complete") return "healthy";

  const blockers = state.blockers.filter(
    (blocker) => blocker.projectId === project.id && blocker.state === "open"
  );
  if (blockers.some((blocker) => blocker.severity === "high" || blocker.severity === "critical")) {
    return "blocked";
  }

  const milestones = state.milestones.filter(
    (milestone) => milestone.projectId === project.id && milestone.state !== "complete" && milestone.state !== "archived"
  );
  const hasOverdueObjective = project.objectives.some(
    (objective) => !objective.completedAt && objective.targetAt && Date.parse(objective.targetAt) < Date.parse(now)
  );
  if (
    blockers.length > 0 ||
    hasOverdueObjective ||
    milestones.some((milestone) => milestone.state === "blocked") ||
    project.objectives.length === 0
  ) {
    return "attention";
  }
  return "healthy";
}
