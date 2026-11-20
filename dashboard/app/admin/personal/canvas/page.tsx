import type { CSSProperties } from "react";
import AdminChrome from "../../../../components/AdminChrome";
import CanvasWorkspace from "../../../../components/canvas/CanvasWorkspace";
import { moduleThemeVariables } from "../../../../lib/design-system/color-system";
import { requireAdminSession } from "../../../../lib/require-admin";

export const dynamic = "force-dynamic";

export default async function CanvasPage() {
  await requireAdminSession();
  return (
    <div className="shell admin-chrome-main module-ref-shell personal-ops-module-shell native-module-shell" data-module="personal_ops" style={moduleThemeVariables("personal_ops") as CSSProperties}>
      <AdminChrome sidebarTitle="Personal" showCommandSearch={false} showPageSidebar={false} />
      <CanvasWorkspace />
    </div>
  );
}
