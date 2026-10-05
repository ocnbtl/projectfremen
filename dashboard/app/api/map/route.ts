import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../lib/csrf";
import { privateJsonStream } from "../../../lib/modules/planning/json-stream";
import { worldRegions } from "../../../lib/modules/planning/world-regions";
import {
  demographics,
  routeStops,
  searchPlaces,
} from "../../../lib/modules/planning/map-providers";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET(request: Request) {
  if (!(await hasAdminSession()))
    return json({ ok: false, error: "Unauthorized" }, 401);
  try {
    const params = new URL(request.url).searchParams;
    const data =
      params.get("operation") === "demographics"
        ? params.get("metric")?.startsWith("regional-")
          ? await worldRegions(params.get("metric")!, params.get("level") || "state", params.get("country") || "")
          : await demographics(
            params.get("metric") || "world-population",
            params.get("level") || "state",
            params.get("state") || "",
          )
        : await searchPlaces(params.get("q") || "");
    return privateJsonStream({ ok: true, data });
  } catch (e) {
    return json(
      {
        ok: false,
        error:
          e instanceof Error ? e.message : "Map information is unavailable",
      },
      400,
    );
  }
}
export async function POST(request: Request) {
  if (!(await hasAdminSession()))
    return json({ ok: false, error: "Unauthorized" }, 401);
  if (!isCsrfRequestValid(request))
    return json({ ok: false, error: "Invalid CSRF token" }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 20000) throw new Error("Route request is too large");
    const body = JSON.parse(raw);
    if (body.operation === "geocode") return json({ ok: true, data: await searchPlaces(typeof body.address === "string" ? body.address : "") });
    return json({
      ok: true,
      data: await routeStops(body.coordinates, body.mode),
    });
  } catch (e) {
    return json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Routing is unavailable",
      },
      400,
    );
  }
}
