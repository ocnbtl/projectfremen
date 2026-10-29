import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { readProjectsState } from "../../../../lib/modules/projects/store";
import { projectLinkPreview } from "../../../../lib/modules/projects/link-preview";
import { readPersonalRecords } from "../../../../lib/personal-records-store";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(request: Request) {
  if (!(await hasAdminSession())) return NextResponse.json({ ok: false }, { status: 401, headers });
  const ids = new URL(request.url).searchParams.getAll("id");
  if (ids.length > 120 || ids.some(id => id.length > 150)) return NextResponse.json({ ok: false }, { status: 400, headers });
  const selected = new Set(ids);
  const items = (await readPersonalRecords()).filter(record => selected.has(record.id) && !record.archivedAt).map(record => {
    const image = record.profile?.photoUrl || record.resourceProfile?.metadata.imageUrl;
    const imageUrl = image && (/^\/api\/people\/photos\//.test(image) || /^https:\/\//.test(image)) ? image : undefined;
    return { id: record.id, imageUrl, updatedAt: record.profile?.photoUpdatedAt, gradient: record.resourceProfile?.gradient,
      mediaType: record.mediaProfile?.manifest.mimeType };
  });
  if (ids.some(id => !id.startsWith("personal-"))) {
    const projects = await readProjectsState().catch(() => ({projects:[]}));
    for (const project of projects.projects.filter(project => selected.has(project.id) && !project.archivedAt && project.lifecycle !== "archived")) {
      const preview = projectLinkPreview(project);
      items.push({ id:project.id, imageUrl:preview.imageUrl, updatedAt:preview.imageUpdatedAt, gradient:undefined, mediaType:undefined });
    }
  }
  return NextResponse.json({ ok: true, items }, { headers });
}
