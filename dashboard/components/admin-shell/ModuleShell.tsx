import type { ReactNode } from "react";
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
};

export default function ModuleShell({
  module,
  sidebar,
  children,
  inspector,
  aiDock,
  mode = "directory",
  ariaLabel,
  className
}: ModuleShellProps) {
  return (
    <div
      className={["module-shell", className].filter(Boolean).join(" ")}
      data-module={module}
      data-mode={mode}
      data-has-sidebar={Boolean(sidebar) || undefined}
      data-has-inspector={Boolean(inspector) || undefined}
    >
      {sidebar}
      <main className="module-shell__main" aria-label={ariaLabel}>
        {children}
      </main>
      {inspector}
      {aiDock}
    </div>
  );
}

