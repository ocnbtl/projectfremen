import { redirect } from "next/navigation";
import { hasAdminSession } from "./admin-session";

export async function requireAdminSession(): Promise<void> {
  const isAuthed = await hasAdminSession();
  if (!isAuthed) {
    redirect("/admin/login");
  }
}
