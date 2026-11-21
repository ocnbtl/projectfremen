import "server-only";
import { workspaceDatabase, isAccountId as validUuid, type WorkspaceAccess } from "../../workspace-access";
export { validUuid };

export type MediaActor = WorkspaceAccess;
export type WorkspaceMedia = {
  workspace_id: string;
  media_id: string;
  record_id: string;
  object_id: string;
  owner_id: string;
  source_file_id: string;
  audience: "private" | "workspace";
  state: "uploading" | "ready" | "discarding" | "discarded";
  backend: "supabase" | "r2-standard";
  file_name: string;
  mime_type: string;
  byte_length: number;
  chunk_size: number;
  sha256: string;
  write_deadline: string | null;
  created_at: string;
};
export class MediaError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function defaultIncludedBytes() {
  const raw = process.env.WORKSPACE_INCLUDED_STORAGE_BYTES || "0";
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))
    throw new Error("Workspace allowance needs configuration");
  return Number(raw);
}
async function db<T>(path: string, data?: unknown): Promise<T> {
  const response = await workspaceDatabase(path, {
    method: data ? "POST" : "GET",
    body: data ? JSON.stringify(data) : undefined,
    headers:
      path === "rpc/workspace_media_action" ? { Accept: "application/vnd.pgrst.object+json" } : undefined,
  });
  if (!response.ok) {
    const message = (await response.json().catch(() => null))?.message;
    if (message === "Storage quota exceeded")
      throw new MediaError(409, "The workspace has insufficient storage for this file.");
    if (message === "Access denied" || message === "Media unavailable")
      throw new MediaError(404, "File unavailable");
    if (message === "Upload details changed" || message === "Upload state changed")
      throw new MediaError(409, message);
    throw new Error("Workspace media catalog unavailable");
  }
  return response.json() as Promise<T>;
}
export function mediaAction(
  actor: MediaActor,
  id: string,
  action: string,
  data: Record<string, unknown> = {},
) {
  return db<WorkspaceMedia>("rpc/workspace_media_action", {
    p_workspace: actor.workspaceId,
    p_actor: actor.userId,
    p_media: id,
    p_action: action,
    p_data: data,
  });
}
export function canReadFile(actor: MediaActor, item: WorkspaceMedia) {
  return (
    item.workspace_id === actor.workspaceId &&
    item.state === "ready" &&
    (item.owner_id === actor.userId || item.audience === "workspace")
  );
}
async function findOne(actor: MediaActor, id: string, aliases = false) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9_:-]{1,260}$/.test(id) || (!aliases && !validUuid(id)))
    throw new MediaError(404, "File unavailable");
  const query = new URLSearchParams({ workspace_id: "eq." + actor.workspaceId, limit: "2" });
  if (aliases) {
    const fields = ["record_id", "object_id", ...(validUuid(id) ? ["media_id"] : [])];
    query.set("or", "(" + fields.map((field) => field + ".eq." + id).join(",") + ")");
  } else query.set("media_id", "eq." + id);
  const rows = await db<WorkspaceMedia[]>("account_workspace_media?" + query);
  if (rows.length !== 1) throw new MediaError(404, "File unavailable");
  const item = rows[0];
  return item;
}
export async function workspaceMediaById(actor: MediaActor, id: string) {
  const item = await findOne(actor, id, true);
  if (!canReadFile(actor, item)) throw new MediaError(404, "File unavailable");
  return item;
}
export async function ownUpload(actor: MediaActor, id: string) {
  const item = await findOne(actor, id);
  if (
    item.owner_id !== actor.userId ||
    item.workspace_id !== actor.workspaceId ||
    !["ready", "uploading"].includes(item.state)
  )
    throw new MediaError(404, "File unavailable");
  return item;
}
export async function setUploadPrivacy(actor: MediaActor, metadataFree: boolean) {
  const response = await workspaceDatabase("account_media_preferences", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      workspace_id: actor.workspaceId,
      user_id: actor.userId,
      metadata_free_uploads: metadataFree,
    }),
  });
  if (!response.ok) throw new Error("Could not save photo privacy");
}
export async function workspaceMediaDirectory(actor: MediaActor, offset: number) {
  const query = new URLSearchParams({
    workspace_id: "eq." + actor.workspaceId,
    state: "neq.discarded",
    or: `(owner_id.eq.${actor.userId},and(audience.eq.workspace,state.eq.ready))`,
    order: "created_at.desc,media_id",
    offset: String(offset),
    limit: "51",
  });
  const [rows, privacy, usage] = await Promise.all([
    db<WorkspaceMedia[]>("account_workspace_media?" + query),
    db<{ metadata_free_uploads: boolean }[]>(
      "account_media_preferences?" +
        new URLSearchParams({
          select: "metadata_free_uploads",
          workspace_id: "eq." + actor.workspaceId,
          user_id: "eq." + actor.userId,
        }),
    ),
    db<
      Array<{
        included_bytes: number;
        pooled_addon_bytes: number;
        used_bytes: number;
        reserved_bytes: number;
      }>
    >("rpc/workspace_media_usage", { p_workspace: actor.workspaceId, p_actor: actor.userId }),
  ]);
  return {
    files: rows
      .slice(0, 50)
      .filter(
        (item) =>
          canReadFile(actor, item) ||
          (item.owner_id === actor.userId && item.workspace_id === actor.workspaceId),
      )
      .map((item) => ({
        id: item.media_id,
        recordId: item.record_id,
        name: item.file_name,
        mime: item.mime_type,
        bytes: item.byte_length,
        audience: item.audience,
        state: item.state,
        own: item.owner_id === actor.userId,
        digest: item.owner_id === actor.userId ? item.sha256 : undefined,
      })),
    more: rows.length > 50,
    usage: usage[0] || {
      included_bytes: defaultIncludedBytes(),
      pooled_addon_bytes: 0,
      used_bytes: 0,
      reserved_bytes: 0,
    },
    canUpload: actor.role !== "viewer",
    cleanUploads: privacy[0]?.metadata_free_uploads ?? false,
  };
}
