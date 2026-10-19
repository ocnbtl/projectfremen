import { redirect } from "next/navigation";

export default async function AdminLoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.error === "1") query.set("error", "1");
  if (params.next === "/vault") query.set("next", "/vault");
  redirect(query.size ? `/?${query}` : "/");
}
