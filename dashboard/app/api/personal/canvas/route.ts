import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../../lib/csrf";
import { CanvasError, canvasMaxRequestBytes } from "../../../../lib/modules/canvas/model";
import { createBoard, getBoard, listBoardSummaries, updateBoard } from "../../../../lib/modules/canvas/store";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) => NextResponse.json(body, {status, headers: {"Cache-Control":"private, no-store", Vary:"Cookie"}});
const failure = (error: unknown) => error instanceof CanvasError
  ? json({ok:false, error:error.message}, error.status)
  : json({ok:false, error:"Canvas is temporarily unavailable. Please try again."}, 503);

async function readInput(request: Request) {
  if (Number(request.headers.get("Content-Length")) > canvasMaxRequestBytes) throw new CanvasError("This board is too large to save.",413);
  if (!request.body) throw new CanvasError("A canvas document is required.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const text: string[] = [];
  let size = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > canvasMaxRequestBytes) {
        await reader.cancel();
        throw new CanvasError("This board is too large to save.",413);
      }
      text.push(decoder.decode(value,{stream:true}));
    }
  } finally { reader.releaseLock(); }
  text.push(decoder.decode());
  let input: unknown;
  try { input = JSON.parse(text.join("")); }
  catch { throw new CanvasError("Choose a valid canvas document."); }
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new CanvasError("Choose a valid canvas document.");
  return input as Record<string, unknown>;
}

export async function GET(request: Request) {
  if (!(await hasAdminSession())) return json({ok:false, error:"Unauthorized"},401);
  try {
    const query = new URL(request.url).searchParams;
    if (query.has("id")) return json({ok:true, board:await getBoard(query.get("id"))});
    return json({ok:true, boards:await listBoardSummaries()});
  } catch (error) { return failure(error); }
}

async function save(request: Request) {
  if (!(await hasAdminSession())) return json({ok:false, error:"Unauthorized"},401);
  if (!isCsrfRequestValid(request)) return json({ok:false, error:"Invalid CSRF token"},403);
  try {
    const input = await readInput(request);
    if (request.method === "POST") return json({ok:true, board:await createBoard(input)});
    if (!input.board || typeof input.board !== "object") throw new CanvasError("Choose a board to save.");
    return json({ok:true, board:await updateBoard(input.board as Record<string, unknown>,input.expectedRevision)});
  } catch (error) { return failure(error); }
}
export const POST = save;
export const PUT = save;
