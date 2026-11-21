import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { getBoard, listBoardSummaries } from "../../../../lib/modules/canvas/store";
import { readPersonalRecords } from "../../../../lib/personal-records-store";
import { boardWritingSources } from "../../../../lib/writing/board-sources";
import { readExtraWritingSources } from "../../../../lib/writing/extra-sources";
import { recordWritingSources } from "../../../../lib/writing/record-sources";
import { findSkillUsages, type WritingUsage } from "../../../../lib/writing/usage";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, {status, headers:{"Cache-Control":"private, no-store", Vary:"Cookie"}});

export async function GET(request: Request) {
  if (!await hasAdminSession()) return json({error:"Sign in to view saved skill uses."}, 401);
  const query = new URL(request.url).searchParams;
  const skill = query.get("skill") || "";
  const collections = query.has("collection") ? query.getAll("collection") : ["prompt"];
  if (![skill, ...collections].every(id => /^[\w-]{1,128}$/.test(id))) return json({error:"Choose a valid skill."}, 400);

  const unavailable = new Set<string>();
  const [records, boards, extra] = await Promise.allSettled([readPersonalRecords(), listBoardSummaries(), readExtraWritingSources(unavailable)]);
  const media = new Map<string, Awaited<ReturnType<typeof readPersonalRecords>>[number]>();
  const items: WritingUsage[] = [];
  if (records.status === "fulfilled") {
    for (const file of records.value) {
      if (file.className !== "file") continue;
      media.set(file.id, file);
      if (file.mediaProfile?.manifest.objectId) media.set(file.mediaProfile.manifest.objectId, file);
    }
    items.push(...findSkillUsages(recordWritingSources(records.value), skill, collections));
  } else unavailable.add("Notes, Media, People and Resources");
  if (boards.status === "fulfilled") {
    // Boards can be large. Only keep matches after each bounded batch.
    for (let start = 0; start < boards.value.length; start += 4) {
      const batch = await Promise.allSettled(boards.value.slice(start, start + 4).map(board => getBoard(board.id)));
      for (const result of batch) {
        if (result.status === "fulfilled") items.push(...findSkillUsages(boardWritingSources(result.value, media), skill, collections));
        else unavailable.add("some Canvas boards");
      }
    }
  } else unavailable.add("Canvas");
  if (extra.status === "fulfilled") items.push(...findSkillUsages(extra.value, skill, collections));
  else unavailable.add("other workspaces");
  items.sort((a,b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || a.title.localeCompare(b.title) || a.key.localeCompare(b.key));
  return json({items, unavailable:[...unavailable]});
}
