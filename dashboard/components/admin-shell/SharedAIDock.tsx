"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import type { ModuleId, NativeObjectRef } from "../../lib/native-objects/types";

export type SharedAIContext = {
  module: ModuleId;
  object?: NativeObjectRef | null;
  activeTab?: string;
  visibleScope?: string;
  allowedActions?: readonly string[];
};

export type SharedAIDockProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: SharedAIContext;
  title?: string;
  footer?: ReactNode;
  className?: string;
};

const MODULE_LABELS: Readonly<Record<ModuleId, string>> = {
  people: "People",
  media: "Media",
  projects: "Projects",
  notes: "Notes",
  personal_ops: "Personal Ops",
  reviews: "Reviews",
  resources: "Resources",
  finance: "Finance"
};

export default function SharedAIDock({
  open,
  onOpenChange,
  context,
  title = "Unigentamos AI",
  footer,
  className
}: SharedAIDockProps) {
  const titleId = useId();
  const descriptionId = useId();
  const launcherRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
    } else if (wasOpen.current) {
      launcherRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange, open]);

  useEffect(() => {
    const handleMobileNavigation = () => onOpenChange(false);
    window.addEventListener("app-mobile-navigation-open", handleMobileNavigation);
    return () => window.removeEventListener("app-mobile-navigation-open", handleMobileNavigation);
  }, [onOpenChange]);

  const contextSummary = [
    MODULE_LABELS[context.module],
    context.object?.label,
    context.activeTab ? `${context.activeTab} tab` : undefined,
    context.visibleScope
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={["shared-ai-dock", open && "is-open", className].filter(Boolean).join(" ")}>
      <button
        ref={launcherRef}
        type="button"
        className="shared-ai-dock__launcher"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-controls="shared-ai-dock-panel"
        aria-label={open ? "Close AI assistant" : "Open AI assistant"}
      >
        <span aria-hidden="true">AI</span>
        <span className="shared-ai-dock__launcher-label">Assistant</span>
      </button>

      {open && (
        <section
          id="shared-ai-dock-panel"
          className="shared-ai-dock__panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
        >
          <header className="shared-ai-dock__header">
            <div>
              <span className="shared-ai-dock__connection-state">
                <span aria-hidden="true" />
                Disconnected
              </span>
              <h2 id={titleId}>{title}</h2>
            </div>
            <button ref={closeRef} type="button" onClick={() => onOpenChange(false)} aria-label="Close AI assistant">
              <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
                <path d="m4 4 12 12M16 4 4 16" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </header>

          <div className="shared-ai-dock__body">
            <div className="shared-ai-dock__context" aria-label="Current AI context">
              <span>Current context</span>
              <strong>{contextSummary}</strong>
            </div>
            <div className="shared-ai-dock__empty-state">
              <span className="shared-ai-dock__empty-icon" aria-hidden="true">AI</span>
              <h3>Assistant is not connected</h3>
              <p id={descriptionId}>
                The shared AI backend has not been enabled. Context is visible here, but chat and mutations stay unavailable.
              </p>
            </div>
            {context.allowedActions && context.allowedActions.length > 0 && (
              <div className="shared-ai-dock__permissions">
                <span>Potential actions require review</span>
                <ul>
                  {context.allowedActions.map((action) => <li key={action}>{action}</li>)}
                </ul>
              </div>
            )}
          </div>

          <footer className="shared-ai-dock__footer">
            <label htmlFor="shared-ai-disconnected-prompt">Ask about this workspace</label>
            <textarea
              id="shared-ai-disconnected-prompt"
              rows={2}
              placeholder="Connect the shared assistant to begin"
              disabled
            />
            <button type="button" disabled title="AI assistant is disconnected">
              Send
            </button>
            {footer}
          </footer>
        </section>
      )}
    </div>
  );
}
