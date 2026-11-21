import type { ReactNode } from "react";
import ExperienceProvider from "../../components/admin-shell/ExperienceProvider";
import ReadingDisplay from "../../components/settings/ReadingDisplay";
import WritingComposer from "../../components/writing/WritingComposer";
import IconSystemProvider from "../../components/icons/IconSystemProvider";
import { selectedIconMap } from "../../lib/icons/icon-registry";
import { defaultStyleGuideState, readStyleGuideState } from "../../lib/modules/style-guide/store";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const styleGuide = await readStyleGuideState().catch(() => defaultStyleGuideState());
  return (
    <IconSystemProvider selections={selectedIconMap(styleGuide.icons)}>
      <ExperienceProvider><ReadingDisplay />{children}<WritingComposer /></ExperienceProvider>
    </IconSystemProvider>
  );
}
