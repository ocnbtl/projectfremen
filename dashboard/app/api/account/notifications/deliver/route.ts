import { createHash, timingSafeEqual } from "node:crypto";
import {
  accountRpc,
  privateJson,
  requireAccountMode,
  workspaceAccessError,
} from "../../../../../lib/workspace-access";
import { noticeTransports, sendNotice } from "../../../../../lib/settings/notification-transport";
import { preferenceZone, silenced, validateDaily } from "../../../../../lib/settings/preferences";

export async function POST(request: Request) {
  try {
    requireAccountMode();
    const secret = process.env.WORKSPACE_NOTIFICATION_WORKER_TOKEN;
    const digest = (value: string) => createHash("sha256").update(value).digest();
    if (
      !secret ||
      secret.length < 32 ||
      !timingSafeEqual(digest(request.headers.get("authorization") || ""), digest("Bearer " + secret))
    )
      return privateJson({ error: "Unavailable." }, 403);
    const transports = noticeTransports();
    if (!transports.email && !transports.pushKey)
      return privateJson({ error: "Configure a delivery channel." }, 503);
    let processed = 0;
    for (let i = 0; i < 10; i++) {
      const job = await accountRpc("claim_account_notice", {});
      if (!job) break;
      if (job.skip) continue;
      const prefs = validateDaily(job.preferences),
        zone = preferenceZone(prefs, prefs.deliveryZone);
      const available = job.channel === "email" ? transports.email : !!transports.pushKey;
      let result = "defer";
      if (available && !silenced(prefs, Date.now(), zone)) {
        try {
          result = await sendNotice(job.channel, job.destination, job.id);
        } catch {
          result = "retry";
        }
      }
      await accountRpc("finish_account_notice", { job: job.id, token: job.lease, result });
      processed++;
    }
    return privateJson({ processed });
  } catch (error) {
    return workspaceAccessError(error);
  }
}
