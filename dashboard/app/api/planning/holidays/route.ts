import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { holidayCatalog } from "../../../../lib/modules/planning/holiday-catalog";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
export async function GET(request: Request) {
  if (!(await hasAdminSession())) return json({ ok: false, error: "Unauthorized" }, 401);
  const params = new URL(request.url).searchParams;
  const countries = [...new Set((params.get("countries") || "").split(",").filter(Boolean))];
  const years = [...new Set((params.get("years") || "").split(",").map(Number))];
  if (countries.length > 250 || countries.some(x => !/^[A-Z]{2}$/.test(x)) || !years.length || years.length > 3 || years.some(x => !Number.isInteger(x) || x < 1900 || x > 2200)) return json({ ok: false, error: "Choose a supported holiday year (1900–2200) and country." }, 400);
  try { return json({ ok: true, ...holidayCatalog(countries, years) }); }
  catch { return json({ ok: false, error: "Holiday dates could not be loaded. Your events remain available." }, 503); }
}
