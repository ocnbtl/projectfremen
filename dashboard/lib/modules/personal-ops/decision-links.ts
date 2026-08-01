import { getModuleRoute, getNativeObjectRoute } from "../../native-objects/routes";
import type { NativeObjectRef } from "../../native-objects/types";
import { sameNativeObjectIdentity } from "./follow-up-links";
import type { PersonalOpsDecision } from "./types";

export type DecisionSourceRef = NativeObjectRef & {
  module: Exclude<NativeObjectRef["module"], "personal_ops">;
};

export function isUnresolvedDecision(decision: PersonalOpsDecision): boolean {
  return (
    decision.lifecycle !== "archived" &&
    decision.decisionState !== "decided" &&
    decision.decisionState !== "superseded"
  );
}

function compareDecisions(left: PersonalOpsDecision, right: PersonalOpsDecision): number {
  const leftUnresolved = isUnresolvedDecision(left);
  const rightUnresolved = isUnresolvedDecision(right);
  if (leftUnresolved !== rightUnresolved) return leftUnresolved ? -1 : 1;

  const byUpdatedAt = right.updatedAt.localeCompare(left.updatedAt);
  if (byUpdatedAt !== 0) return byUpdatedAt;
  return left.id.localeCompare(right.id);
}

export function getLinkedDecisions(
  decisions: readonly PersonalOpsDecision[],
  source?: Pick<NativeObjectRef, "module" | "objectType" | "objectId" | "containerObjectId">
): PersonalOpsDecision[] {
  if (!source) return [];
  return decisions
    .filter((decision) =>
      decision.sourceRefs.some((reference) => sameNativeObjectIdentity(reference, source))
    )
    .sort(compareDecisions);
}

export function decisionOwnerRoute(decision: PersonalOpsDecision): string {
  return getNativeObjectRoute({
    module: "personal_ops",
    objectType: "decision",
    objectId: decision.id
  });
}

export function buildDecisionCreationRoute(
  source: DecisionSourceRef,
  options: { dueAt?: string } = {}
): string {
  const params = new URLSearchParams({
    create: "decision",
    sourceModule: source.module,
    sourceObjectType: source.objectType,
    sourceObjectId: source.objectId,
    sourceLabel: source.label,
    sourceRoute: source.route
  });
  if (source.containerObjectId) {
    params.set("sourceContainerObjectId", source.containerObjectId);
  }
  if (options.dueAt) params.set("dueAt", options.dueAt);
  return `${getModuleRoute("personal_ops")}/decisions?${params.toString()}`;
}
