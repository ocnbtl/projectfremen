import { hasAdminSession } from "../../../../lib/admin-session";
import { readMentionSources } from "../../../../lib/writing/mention-sources";
import { findObjectMentions, mentionIdentity } from "../../../../lib/writing/mentions";

export const dynamic = "force-dynamic";
const headers = {"Cache-Control":"private, no-store", Vary:"Cookie"};

export async function GET(request: Request) {
  if (!await hasAdminSession()) return Response.json({error:"Sign in to view mentions."}, {status:401, headers});
  const target = mentionIdentity(new URL(request.url).searchParams.get("target") || "");
  if (!target) return Response.json({error:"Choose a workspace object."}, {status:400, headers});
  const snapshot = await readMentionSources();
  return Response.json({items:findObjectMentions(snapshot,target), unavailable:snapshot.unavailable}, {headers});
}
