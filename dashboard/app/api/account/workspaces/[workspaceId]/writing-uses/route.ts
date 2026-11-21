import {
  accountRpc,
  isAccountId,
  privateJson,
  requireWorkspaceAccess,
  workspaceAccessError,
} from "../../../../../../lib/workspace-access";
import { parseWriting, writingContext } from "../../../../../../lib/writing/tokens";
export async function GET(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await params,
      access = await requireWorkspaceAccess(req, workspaceId, "read");
    const query = new URL(req.url).searchParams,
      skill = query.get("skill") || "",
      cursor = query.get("cursor");
    if (!/^[\w-]{1,100}$/.test(skill) || (cursor && !isAccountId(cursor)))
      return privateJson({ error: "Invalid skill or cursor." }, 400);
    const rows: { object_key: string; title: string; body: string }[] = await accountRpc(
      "account_writing_sources",
      { w: workspaceId, actor: access.userId, skill_id: skill, after_key: cursor || null },
    );
    const items = rows.slice(0, 20).flatMap((r) =>
      parseWriting(r.body)
        .flatMap((p) =>
          p.kind === "skill" && p.id === skill
            ? [
                {
                  key: r.object_key,
                  title: r.title,
                  passage: writingContext(r.body, p.offset).slice(0, 2000),
                },
              ]
            : [],
        )
        .slice(0, 25),
    );
    return privateJson({ items, next: rows.length > 20 ? rows[19].object_key : null });
  } catch (e) {
    return workspaceAccessError(e);
  }
}
