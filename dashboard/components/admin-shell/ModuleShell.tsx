"use client";

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { WorkspacePageContext } from "./WorkspacePageContext";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { WorkspaceTopbarProvider } from "./WorkspaceTopbar";
import { moduleThemeVariables } from "../../lib/design-system/color-system";
import type { ModuleId } from "../../lib/native-objects/types";

export type ModuleShellMode = "directory" | "detail" | "editor" | "review";

export type ModuleShellProps = {
  module: ModuleId;
  sidebar?: ReactNode;
  children: ReactNode;
  inspector?: ReactNode;
  aiDock?: ReactNode;
  mode?: ModuleShellMode;
  ariaLabel?: string;
  className?: string;
  detailOpen?: boolean;
  onBack?: () => void;
};

export default function ModuleShell({
  module,
  sidebar,
  children,
  inspector,
  aiDock,
  mode = "directory",
  ariaLabel,
  className,
  detailOpen = false,
  onBack
}: ModuleShellProps) {
  const backRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!detailOpen) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    backRef.current?.focus({ preventScroll: true });
    return () => { requestAnimationFrame(() => returnFocus.current?.focus({ preventScroll: true })); };
  }, [detailOpen]);
  return (
    <WorkspaceTopbarProvider>
    <div
      className={["module-shell", "workspace-pages", className].filter(Boolean).join(" ")}
      data-detail-open={detailOpen || undefined}
      data-module={module}
      data-mode={mode}
      data-has-sidebar={Boolean(sidebar) || undefined}
      data-has-inspector={Boolean(inspector) || undefined}
      style={moduleThemeVariables(module) as CSSProperties}
    >
      {sidebar}
      <main className="module-shell__main" aria-label={ariaLabel} hidden={detailOpen}>
        {children}
      </main>
      <section className="workspace-detail-page" hidden={!detailOpen} aria-label="Details">
        <button ref={backRef} type="button" className="workspace-back work-button" onClick={onBack}>
          <UnigentamosIcon role="chevron-right" size={18} style={{ transform: "rotate(180deg)" }} /><span>Back</span>
        </button>
        <WorkspacePageContext.Provider value={true}>{inspector}</WorkspacePageContext.Provider>
      </section>
      {aiDock}
    </div>
    </WorkspaceTopbarProvider>
  );
}
