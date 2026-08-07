import type { Metadata } from "next";
import VaultWorkspace from "../../components/VaultWorkspace";

export const metadata: Metadata = {
  title: "Your Vault · Unigentamos",
  description: "Private offline access, device sync, backups, and version history"
};

export default function VaultPage() {
  return <VaultWorkspace />;
}
