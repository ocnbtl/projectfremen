import type { ReactNode } from "react";
import { PersistentSharedAIDockProvider } from "../../components/admin-shell/SharedAIDock";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <PersistentSharedAIDockProvider>{children}</PersistentSharedAIDockProvider>;
}
