import {
  accountInput,
  accountRpc,
  isAccountId,
  privateJson,
  randomSecret,
  requireAccountOrigin,
  requireWorkspaceAccess,
  secretHash,
  workspaceAccessError,
  WorkspaceAccessError,
  workspaceDatabase,
} from "../../../../../lib/workspace-access";

type Context = { params: Promise<{ workspaceId: string }> };
export async function GET(request: Request, { params }: Context) {
  try {
    const access = await requireWorkspaceAccess(request, (await params).workspaceId, "manage");
    const query = new URLSearchParams({
      select: "id,email,role,expires_at,member_expires_at",
      workspace_id: "eq." + access.workspaceId,
      expires_at: "gt." + new Date().toISOString(),
      order: "email",
    });
    const [members, invites] = await Promise.all([
      accountRpc("account_member_directory", { p_actor: access.userId, p_workspace: access.workspaceId }),
      workspaceDatabase("account_workspace_invites?" + query),
    ]);
    if (!invites.ok) throw new WorkspaceAccessError(503, "Could not load invitations.");
    return privateJson({ ok: true, members, invites: await invites.json() });
  } catch (error) {
    return workspaceAccessError(error);
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    const access = await requireWorkspaceAccess(request, (await params).workspaceId, "manage");
    const body = await accountInput(request);
    const { action, targetId, role } = body;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (action !== "invite" && action !== "cancel" && action !== "update" && action !== "remove")
      throw new WorkspaceAccessError(400, "Invalid member action.");
    if (action !== "invite" && !isAccountId(targetId))
      throw new WorkspaceAccessError(400, "Choose a member or invitation.");
    if ((action === "invite" || action === "update") && role !== "viewer" && role !== "editor")
      throw new WorkspaceAccessError(400, "Choose a role.");
    if (action === "invite" && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254))
      throw new WorkspaceAccessError(400, "Enter a valid email address.");
    if (
      body.expiresAt != null &&
      (typeof body.expiresAt !== "string" || !(Date.parse(body.expiresAt) > Date.now()))
    )
      throw new WorkspaceAccessError(400, "Choose a future expiration.");
    const token = action === "invite" ? randomSecret() : null;
    await accountRpc("manage_account_member", {
      p_actor: access.userId,
      p_workspace: access.workspaceId,
      p_action: action,
      p_target: targetId ?? null,
      p_role: role ?? null,
      p_until: body.expiresAt ?? null,
      p_email: email || null,
      p_hash: token && secretHash(token),
    });
    // Fragments stay in the browser and out of access logs and referrer headers.
    return privateJson({
      ok: true,
      ...(token
        ? { inviteUrl: new URL("/account#invite=" + token, requireAccountOrigin(request)).href }
        : {}),
    });
  } catch (error) {
    return workspaceAccessError(error);
  }
}
