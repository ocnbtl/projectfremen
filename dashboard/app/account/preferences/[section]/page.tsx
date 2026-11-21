import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  isAccountId,
  individualAccountsEnabled,
  requireWorkspaceAccess,
  WorkspaceAccessError,
} from "../../../../lib/workspace-access";
import AccountPreferences from "../../../../components/settings/AccountPreferences";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ workspace?: string }>;
}) {
  const { section } = await params,
    { workspace } = await searchParams;
  if (
    !individualAccountsEnabled() ||
    !isAccountId(workspace) ||
    ![
      "home",
      "writing",
      "regional",
      "appearance",
      "notifications",
      "search",
      "navigation",
      "account",
      "sharing",
      "backup",
      "device-data",
    ].includes(section)
  )
    notFound();
  try {
    await requireWorkspaceAccess(
      new Request("https://workspace.invalid", { headers: await headers() }),
      workspace,
      "read",
    );
  } catch (error) {
    if (error instanceof WorkspaceAccessError && error.status === 401) redirect("/account");
    if (error instanceof WorkspaceAccessError && [403, 404].includes(error.status)) notFound();
    throw error;
  }
  return (
    <AccountPreferences
      key={workspace}
      workspaceId={workspace}
      section={
        section as
          | "home"
          | "writing"
          | "regional"
          | "appearance"
          | "notifications"
          | "search"
          | "navigation"
          | "account"
          | "sharing"
          | "backup"
          | "device-data"
      }
    />
  );
}
