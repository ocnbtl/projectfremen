import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../../../lib/csrf";
import { EmailTestError, sendBookingEmailTest } from "../../../../../lib/modules/planning/booking-email-test";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const json = (body: unknown, status = 200) => NextResponse.json(body, {status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(request: Request) {
  if (!(await hasAdminSession())) return json({error:"Unauthorized"},401);
  if (!isCsrfRequestValid(request)) return json({error:"Refresh the page and try again."},403);
  if (!request.headers.get("content-type")?.includes("application/json")) return json({error:"Expected email settings."},415);
  // Stream with a hard cap rather than trusting Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return json({error:"Expected email settings."},400);
  let text = "", bytes = 0; const decoder = new TextDecoder();
  try {
    while (true) { const {done,value} = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 20000) { await reader.cancel(); return json({error:"Email settings are too large."},413); } text += decoder.decode(value,{stream:true}); }
    text += decoder.decode();
    return json(await sendBookingEmailTest(JSON.parse(text)));
  } catch (error) {
    return json({error:error instanceof EmailTestError ? error.message : error instanceof SyntaxError ? "Invalid email settings." : "Test emails could not be sent. Try again."},error instanceof EmailTestError ? error.status : error instanceof SyntaxError ? 400 : 503);
  } finally { reader.releaseLock(); }
}
