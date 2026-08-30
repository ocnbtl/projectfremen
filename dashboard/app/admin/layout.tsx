import type { ReactNode } from "react";
import { PersistentSharedAIDockProvider } from "../../components/admin-shell/SharedAIDock";
import IconSystemProvider from "../../components/icons/IconSystemProvider";
import { selectedIconMap } from "../../lib/icons/icon-registry";
import { defaultStyleGuideState, readStyleGuideState } from "../../lib/modules/style-guide/store";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const styleGuide = await readStyleGuideState().catch(() => defaultStyleGuideState());
  return (
    <IconSystemProvider selections={selectedIconMap(styleGuide.icons)}>
      <PersistentSharedAIDockProvider>{children}</PersistentSharedAIDockProvider>
    </IconSystemProvider>
  );
}
