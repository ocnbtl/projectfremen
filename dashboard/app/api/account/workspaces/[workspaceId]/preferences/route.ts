import { NextResponse } from "next/server";
import {
  accountInput,
  accountRpc,
  requireWorkspaceAccess,
  workspaceAccessError,
  workspaceDatabase,
} from "../../../../../../lib/workspace-access";
import { validateDaily } from "../../../../../../lib/settings/preferences";
import { validateWriting, type WritingPreferences } from "../../../../../../lib/writing/model";
import { noticeTransports } from "../../../../../../lib/settings/notification-transport";
type Context = { params: Promise<{ workspaceId: string }> };
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const message = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
async function run(request: Request, context: Context, write: boolean) {
  try {
    const { workspaceId } = await context.params;
    const access = await requireWorkspaceAccess(request, workspaceId, "read");
    let changes: Record<string, unknown> = {},
      expected = null;
    if (write) {
      const body = await accountInput(request, 256 * 1024);
      try {
        if (
          typeof body.revision !== "number" || !Number.isSafeInteger(body.revision) ||
          body.revision < 0 ||
          (body.group !== "daily" && body.group !== "writing")
        )
          throw new Error("Invalid settings change.");
        changes =
          body.group === "daily"
            ? { daily: validateDaily(body.value) }
            : { writing: validateWriting(body.value as WritingPreferences) };
        expected = body.revision;
      } catch (error) {
        return message(error instanceof Error ? error.message : "Invalid preferences.", 400);
      }
    }
    const result = await workspaceDatabase("rpc/account_preferences_action", {
      method: "POST",
      body: JSON.stringify({ w: access.workspaceId, actor: access.userId, expected, changes }),
    });
    if (!result.ok)
      return message(
        result.status === 409
          ? "Another device changed these settings. Reload to review the latest version."
          : "Workspace preferences are unavailable.",
        result.status === 403 ? 403 : result.status === 409 ? 409 : 503,
      );
    const data = await result.json();
    const notices = await accountRpc("account_notice_inbox", { w: access.workspaceId, actor: access.userId });
    return NextResponse.json(
      {
        ...data,
        inbox: [
          ...(data.inbox || []).map((item: Record<string, unknown>) => ({ ...item, category: "share" })),
          ...notices,
        ]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 100),
        transports: noticeTransports(),
      },
      { headers },
    );
  } catch (error) {
    return workspaceAccessError(error);
  }
}
export const GET = (request: Request, context: Context) => run(request, context, false);
export const PATCH = (request: Request, context: Context) => run(request, context, true);
