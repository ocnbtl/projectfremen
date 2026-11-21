import {
  accountInput,
  isAccountId,
  privateJson,
  requireAccount,
  requireWorkspaceAccess,
  workspaceAccessError,
  accountRpc,
} from "../../../../../../lib/workspace-access";
import { approvedPushEndpoint } from "../../../../../../lib/settings/notification-transport";
export async function POST(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await params;
    const body = await accountInput(req);
    const access = await requireWorkspaceAccess(
      req,
      workspaceId,
      body.action === "subscribe" || body.action === "unsubscribe" ? "read" : "write",
    );
    if (body.action === "subscribe" || body.action === "unsubscribe") {
      const { sessionId } = await requireAccount(req);
      const endpoint = body.action === "subscribe" ? approvedPushEndpoint(body.endpoint) : null;
      if (body.action === "subscribe" && !endpoint)
        return privateJson({ error: "This browser push service is unavailable." }, 400);
      await accountRpc("account_notice_device", {
        w: workspaceId,
        actor: access.userId,
        s: sessionId,
        endpoint_value: endpoint,
      });
      return privateJson({ ok: true });
    }
    if (
      !isAccountId(body.key) ||
      !isAccountId(body.eventId) ||
      typeof body.email !== "string" ||
      body.email.length > 254 ||
      !["mention", "assignment", "reminder"].includes(String(body.kind))
    )
      return privateJson({ error: "Choose a record, member, and update." }, 400);
    if (
      body.kind === "reminder" &&
      (typeof body.due !== "string" ||
        !Number.isFinite(Date.parse(body.due)) ||
        Date.parse(body.due) <= Date.now() ||
        Date.parse(body.due) > Date.now() + 366 * 86400000)
    )
      return privateJson({ error: "Choose a reminder within the next year." }, 400);
    await accountRpc("account_create_notice", {
      w: access.workspaceId,
      actor: access.userId,
      k: body.key,
      recipient_email: body.email,
      notice_kind: body.kind,
      due: body.kind === "reminder" ? body.due : null,
      event_id: body.eventId,
    });
    return privateJson({ ok: true });
  } catch (error) {
    return workspaceAccessError(error);
  }
}
