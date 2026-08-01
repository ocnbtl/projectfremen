import { getModuleRoute, getNativeObjectRoute } from "../../native-objects/routes";
import type { NativeObjectRef } from "../../native-objects/types";
import type { PersonalOpsFollowUp } from "./types";

export type FollowUpSourceModule =
  | "media"
  | "notes"
  | "people"
  | "projects"
  | "resources"
  | "reviews";

export type FollowUpSourceRef = NativeObjectRef & {
  module: FollowUpSourceModule;
};

export function sameNativeObjectIdentity(
  left: Pick<NativeObjectRef, "module" | "objectType" | "objectId" | "containerObjectId">,
  right: Pick<NativeObjectRef, "module" | "objectType" | "objectId" | "containerObjectId">
): boolean {
  return (
    left.module === right.module &&
    left.objectType === right.objectType &&
    left.objectId === right.objectId &&
    (left.containerObjectId || "") === (right.containerObjectId || "")
  );
}

export function isActiveFollowUp(followUp: PersonalOpsFollowUp): boolean {
  return (
    followUp.lifecycle !== "archived" &&
    followUp.lifecycle !== "complete" &&
    followUp.followUpState !== "complete"
  );
}

export function isAvailableFollowUp(followUp: PersonalOpsFollowUp): boolean {
  return followUp.lifecycle !== "archived";
}

function compareFollowUps(left: PersonalOpsFollowUp, right: PersonalOpsFollowUp): number {
  const leftActive = isActiveFollowUp(left);
  const rightActive = isActiveFollowUp(right);
  if (leftActive !== rightActive) return leftActive ? -1 : 1;

  if (leftActive && rightActive) {
    const leftDueAt = left.dueAt || "9999-12-31";
    const rightDueAt = right.dueAt || "9999-12-31";
    const byDueAt = leftDueAt.localeCompare(rightDueAt);
    if (byDueAt !== 0) return byDueAt;
  }

  const byUpdatedAt = right.updatedAt.localeCompare(left.updatedAt);
  if (byUpdatedAt !== 0) return byUpdatedAt;
  return left.id.localeCompare(right.id);
}

export function getLinkedFollowUps(
  followUps: readonly PersonalOpsFollowUp[],
  source?: Pick<NativeObjectRef, "module" | "objectType" | "objectId" | "containerObjectId">
): PersonalOpsFollowUp[] {
  if (!source) return [];
  return followUps
    .filter((followUp) =>
      followUp.sourceRefs.some((reference) => sameNativeObjectIdentity(reference, source))
    )
    .sort(compareFollowUps);
}

export function getActiveFollowUpsForSource(
  followUps: readonly PersonalOpsFollowUp[],
  source?: Pick<NativeObjectRef, "module" | "objectType" | "objectId" | "containerObjectId">
): PersonalOpsFollowUp[] {
  return getLinkedFollowUps(followUps, source).filter(isActiveFollowUp);
}

export function followUpOwnerRoute(followUp: PersonalOpsFollowUp): string {
  return getNativeObjectRoute({
    module: "personal_ops",
    objectType: "follow_up",
    objectId: followUp.id
  });
}

export function buildFollowUpCreationRoute(
  source: FollowUpSourceRef,
  options: { dueAt?: string } = {}
): string {
  const params = new URLSearchParams({
    create: "follow-up",
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
  return `${getModuleRoute("personal_ops")}/follow-ups?${params.toString()}`;
}
