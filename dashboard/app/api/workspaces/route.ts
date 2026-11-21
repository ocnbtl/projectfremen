import {
  accountInput,
  accountRpc,
  privateJson,
  requireAccount,
  workspaceAccessError,
  WorkspaceAccessError,
  workspaceDatabase,
} from "../../../lib/workspace-access";

export async function GET(request: Request) {
  try {
    const { userId } = await requireAccount(request);
    const query = new URLSearchParams({
      select: "workspace_id,role,expires_at,account_workspaces(name)",
      user_id: "eq." + userId,
      or: "(expires_at.is.null,expires_at.gt." + new Date().toISOString() + ")",
      order: "workspace_id",
    });
    const response = await workspaceDatabase("account_workspace_members?" + query);
    if (!response.ok) throw new WorkspaceAccessError(503, "Could not load workspaces.");
    return privateJson({ ok: true, workspaces: await response.json() });
  } catch (error) {
    return workspaceAccessError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { userId } = await requireAccount(request);
    const { name } = await accountInput(request);
    if (typeof name !== "string" || !name.trim() || name.trim().length > 100)
      throw new WorkspaceAccessError(400, "Enter a workspace name of up to 100 characters.");
    const workspaceId = await accountRpc("create_account_workspace", { p_user: userId, p_name: name.trim() });
    return privateJson({ ok: true, workspaceId }, 201);
  } catch (error) {
    return workspaceAccessError(error);
  }
}
