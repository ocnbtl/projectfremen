import type { Metadata } from "next";
import VaultWorkspace from "../../components/VaultWorkspace";

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
  return <VaultWorkspace initialSearch={params.search?.slice(0, 500) || ""} initialKind={initialKind} focusSearch={params.focus === "search"} />;
}
