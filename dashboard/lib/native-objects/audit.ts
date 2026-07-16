import type { ModuleId, NativeObjectRef } from "./types";

export type AuditSource = "user" | "system" | "import" | "migration" | "ai_proposal";

export type AuditSnapshot = Readonly<Record<string, unknown>> | null;

export type AuditEvent = {
  id: string;
  module: ModuleId;
  object: NativeObjectRef;
  action: string;
  actorId: string;
  occurredAt: string;
  before: AuditSnapshot;
  after: AuditSnapshot;
  source: AuditSource;
  correlationId?: string;
};

export type CreateAuditEventInput = Omit<AuditEvent, "module">;

export function createAuditEvent(input: CreateAuditEventInput): AuditEvent {
  return { ...input, module: input.object.module };
}

export function isAuditEventForObject(event: AuditEvent, object: NativeObjectRef): boolean {
  return (
    event.object.module === object.module &&
    event.object.objectType === object.objectType &&
    event.object.objectId === object.objectId
  );
}

export function appendAuditEvent(events: readonly AuditEvent[], event: AuditEvent): AuditEvent[] {
  return [...events, event];
}
