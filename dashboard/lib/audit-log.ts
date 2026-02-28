import { readJsonFile, writeJsonFile } from "./file-store";

const FILE_NAME = "audit-log.json";
const MAX_AUDIT_EVENTS = 500;

export type AuditEvent = {
  at: string;
  action: string;
  path: string;
  method: string;
  ip: string;
  status: "ok" | "denied" | "error";
  detail?: string;
};

type AuditState = {
  items: AuditEvent[];
};

function cleanText(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function getRequestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim() || "";
    if (first) {
      return cleanText(first, 120);
    }
  }

  const realIp = request.headers.get("x-real-ip") || "";
  if (realIp.trim()) {
    return cleanText(realIp, 120);
  }

  return "unknown";
}

export async function appendAuditEvent(event: AuditEvent): Promise<void> {
  try {
    const state = await readJsonFile<AuditState>(FILE_NAME, { items: [] });
    state.items.push({
      ...event,
      action: cleanText(event.action, 120),
      path: cleanText(event.path, 240),
      method: cleanText(event.method, 16),
      ip: cleanText(event.ip, 120),
      detail: event.detail ? cleanText(event.detail, 300) : undefined
    });

    if (state.items.length > MAX_AUDIT_EVENTS) {
      state.items.splice(0, state.items.length - MAX_AUDIT_EVENTS);
    }

    await writeJsonFile(FILE_NAME, state);
  } catch {
    // Audit logging must never break primary request behavior.
  }
}

