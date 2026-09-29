"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import UnigentamosIcon from "../icons/UnigentamosIcon";

export function WorkspaceButton({
  children,
  icon,
  intent = "secondary",
  busy,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: string;
  intent?: "primary" | "secondary" | "quiet" | "danger";
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      className={["work-button", `work-button--${intent}`, className]
        .filter(Boolean)
        .join(" ")}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
    >
      {icon && <UnigentamosIcon role={icon} size={20} />}
      <span>{children}</span>
      {busy && <span className="work-progress" aria-hidden="true" />}
    </button>
  );
}
export function WorkspaceHeader({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children?: ReactNode;
}) {
  return (
    <header className="work-header">
      <div className="work-title">
        <h1>{title}</h1>
        {count !== undefined && <span className="work-count">{count}</span>}
      </div>
      <div className="work-actions">{children}</div>
    </header>
  );
}
export function WorkspaceToolbar({
  query,
  onQuery,
  placeholder = "Search records",
  children,
  filters,
  activeFilters = 0,
}: {
  query: string;
  onQuery: (value: string) => void;
  placeholder?: string;
  children?: ReactNode;
  filters?: ReactNode;
  activeFilters?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <div className="work-toolbar">
        <label className="work-search">
          <UnigentamosIcon role="search" size={20} />
          <input
            type="search"
            aria-label={placeholder}
            placeholder={placeholder}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
        </label>
        {filters && (
          <WorkspaceButton
            icon="filter"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            Filter{activeFilters ? ` (${activeFilters})` : ""}
          </WorkspaceButton>
        )}
        {children}
      </div>
      {expanded && <div className="work-filters">{filters}</div>}
    </>
  );
}
export function WorkspaceFeedback({
  error,
  message,
  onRetry,
}: {
  error?: string;
  message?: string;
  onRetry?: () => void;
}) {
  if (!error && !message) return null;
  return (
    <div
      className={`work-feedback${error ? " is-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      <UnigentamosIcon role={error ? "warning" : "check"} size={18} />
      <span>{error || message}</span>
      {onRetry && (
        <WorkspaceButton onClick={onRetry}>Try again</WorkspaceButton>
      )}
    </div>
  );
}
export function WorkspaceEmpty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="work-empty">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function WorkspaceSheet({
  open,
  onClose,
  title,
  children,
  description,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  description?: string;
}) {
  const descriptionId = useId();
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const remember = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && !target.closest('[role="dialog"]'))
        opener.current = target;
    };
    document.addEventListener("focusin", remember, true);
    return () => document.removeEventListener("focusin", remember, true);
  }, []);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="work-scrim" />
        <Dialog.Content
          onOpenAutoFocus={() => {
            const active = document.activeElement;
            if (
              active instanceof HTMLElement &&
              !active.closest('[role="dialog"]')
            )
              opener.current = active;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // A replacement dialog owns focus before this sheet finishes exiting.
            // Do not let the old sheet restore focus behind the new modal.
            if (document.querySelector('[role="dialog"][data-state="open"]'))
              return;
            const target = opener.current;
            if (target?.isConnected) target.focus({ preventScroll: true });
          }}
          className="work-sheet"
          aria-describedby={description ? descriptionId : undefined}
        >
          <div className="work-sheet-header">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <WorkspaceButton aria-label="Close details" icon="close">
                Close
              </WorkspaceButton>
            </Dialog.Close>
          </div>
          {description && (
            <Dialog.Description id={descriptionId}>
              {description}
            </Dialog.Description>
          )}
          <div className="work-sheet-body">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function useLatestRequest() {
  const sequence = useRef(0);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  return () => {
    const id = ++sequence.current;
    return () => id === sequence.current;
  };
}
