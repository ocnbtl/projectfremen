import { requireWorkspaceAccess, workspaceAccessError, workspaceDatabase } from "../../../../../lib/workspace-access";

export const dynamic = "force-dynamic";
const privacy = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie" };
type Context = { params: Promise<{workspaceId: string}> };
const readActions = new Set(["list","get","export","inventory","workspaceShares","recoveryStatus"]);
const writeActions = new Set(["create","edit","share","revoke","restrictAudience","link","unlink","attach","detach","policy","previewRestore","restore"]);

async function handle(request: Request, context: Context) {
  try {
    const {workspaceId} = await context.params;
    const read = request.method === "GET";
    const identity = await requireWorkspaceAccess(request, workspaceId, read ? "read" : "write");
    const params = new URL(request.url).searchParams;
    let args: Record<string,unknown>;
    if (read) args = Object.fromEntries(params);
    else {
      const limit=8*1024*1024;
      const reader=request.body?.getReader();
      const chunks:Uint8Array[]=[];
      let size=0;
      if(reader)try {
        while(true){
          const {value,done}=await reader.read();
          if(done)break;
          size+=value.byteLength;
          if(size>limit){
            await reader.cancel();
            return Response.json({error:"This file exceeds the 8 MiB import limit."},{status:413,headers:privacy});
          }
          chunks.push(value);
        }
      }finally{reader.releaseLock();}
      try { args = JSON.parse(Buffer.concat(chunks,size).toString("utf8")); } catch { return Response.json({error:"Invalid record."},{status:400,headers:privacy}); }
    }
    const action = args?.action ?? (read ? "list" : "");
    if (typeof action !== "string" || !(read ? readActions : writeActions).has(action)) {
      return Response.json({error:"Unknown record action."},{status:400,headers:privacy});
    }
    const response = await workspaceDatabase("rpc/account_record_action", {
      method:"POST",body:JSON.stringify({w:identity.workspaceId,actor:identity.userId,action,args})
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const code = String(error.code || "");
      const status = code === "42501" ? 403 : code === "P0002" ? 404 : code === "40001" ? 409 :
        code.startsWith("22") || code.startsWith("23") ? 400 : 503;
      const message = status===409 ? "This record changed. Reopen it before saving." : status===400 ? "Check the record, recipient, and dates." :
        status===503 ? "Workspace storage is unavailable." : "This record or action is unavailable.";
      return Response.json({error:message},{status,headers:privacy});
    }
    const headers = new Headers(privacy);
    headers.set("Content-Type","application/json");
    if (action === "export") headers.set("Content-Disposition",'attachment; filename="workspace-records.json"');
    return new Response(response.body,{headers});
  } catch (error) { return workspaceAccessError(error); }
}
export const GET = handle;
export const POST = handle;
