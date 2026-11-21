import { notFound } from "next/navigation";
import { individualAccountsEnabled } from "../../lib/account-mode";
import AccountHome from "../../components/account/AccountHome";

export const dynamic = "force-dynamic";
export default function AccountPage() {
  if (!individualAccountsEnabled()) notFound();
  return <AccountHome />;
}
