import type { Metadata } from "next";
import AppTopNav from "../../components/admin-shell/AppTopNav";
import IconSystemProvider from "../../components/icons/IconSystemProvider";
import VaultWorkspace from "../../components/VaultWorkspace";
import { selectedIconMap } from "../../lib/icons/icon-registry";
import { defaultStyleGuideState, readStyleGuideState } from "../../lib/modules/style-guide/store";

export const metadata: Metadata = {
  title: "Your Vault · Unigentamos",
  description: "Private offline access, device sync, backups, and version history"
};

export default async function VaultPage({
  searchParams
}: {
  searchParams: Promise<{ search?: string; kind?: string; focus?: string }>;
}) {
  const params = await searchParams;
  const kinds = ["all", "note", "contact", "resource", "project", "personal_ops", "review", "finance", "media", "settings", "other"] as const;
  const initialKind = kinds.includes(params.kind as (typeof kinds)[number])
    ? params.kind as (typeof kinds)[number]
    : "all";
  const styleGuide = await readStyleGuideState().catch(() => defaultStyleGuideState());
  return (
    <IconSystemProvider selections={selectedIconMap(styleGuide.icons)}>
      <AppTopNav showCommandSearch={false} />
      <VaultWorkspace initialSearch={params.search?.slice(0, 500) || ""} initialKind={initialKind} focusSearch={params.focus === "search"} />
    </IconSystemProvider>
  );
}
