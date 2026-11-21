import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { individualAccountsEnabled } from "../../../lib/account-mode";
import { AccountConfirmation } from "../../../components/account/AccountHome";

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  if (!individualAccountsEnabled()) notFound();
  const flow = (await cookies()).get("workspace_email_flow")?.value.split(".")[0];
  return <AccountConfirmation recovery={flow === "recover"} code={(await searchParams).code || ""} />;
}
