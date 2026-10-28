import { redirect } from "next/navigation";
import { requireAdminSession } from "../../../../lib/require-admin";
export const dynamic = "force-dynamic";
export default async function ReviewCadencePage({searchParams}:{searchParams:Promise<{scheduledFor?:string}>}){await requireAdminSession();const params=await searchParams;const query=new URLSearchParams({cadence:"weekly"});if(params.scheduledFor && /^\d{4}-\d{2}-\d{2}$/.test(params.scheduledFor))query.set("scheduledFor",params.scheduledFor);redirect("/admin/reviews?"+query.toString());}
