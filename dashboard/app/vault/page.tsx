import type { Metadata } from "next";
import VaultWorkspace from "../../components/VaultWorkspace";

export const metadata: Metadata = {
  title: "Encrypted Vault · Unigentamos",
  description: "Local-first encrypted storage, history, and synchronization"
};

export default function VaultPage() {
  return <VaultWorkspace />;
}
