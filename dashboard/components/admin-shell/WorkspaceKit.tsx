"use client";

import ViewCycleButton, { type DirectoryViewMode } from "../ui/ViewCycleButton";
import SearchField from "../ui/SearchField";
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useLayoutEffect,
  type CSSProperties,
  useId,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import SelectField from "../ui/SelectField";
import { WorkspaceNavSlot, WorkspaceTopbarContext } from "./WorkspaceTopbar";

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
  const toolbarAction = typeof children === "string" && /^(filter|sort)$/i.test(children.trim());
  if (toolbarAction && typeof children === "string") { icon = children.trim().toLowerCase(); props["aria-label"] ||= children; props.title ||= children; children = undefined; }
  const childIsIcon = isValidElement(children) && children.type === UnigentamosIcon;
  const iconOnly = (Boolean(icon) && children == null) || childIsIcon;
  return (
    <button
      type="button"
      {...props}
      className={["work-button", `work-button--${intent}`, className]
        .filter(Boolean)
        .join(" ")}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
      data-icon-button={iconOnly ? "standard" : undefined}
      data-toolbar-action={iconOnly && (icon === "filter" || icon === "sort") ? icon : undefined}
    >
      {icon && <UnigentamosIcon role={icon} size={20} />}
      {childIsIcon ? children : children != null && <span>{children}</span>}
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
  const bar = useContext(WorkspaceTopbarContext);
  if (bar) return <WorkspaceNavSlot kind="actions"><div className="work-actions">{count !== undefined && <span className="work-count" aria-label={`${count} items`}>{count}</span>}{children}</div></WorkspaceNavSlot>;
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
  actions,
}: {
  query: string;
  onQuery: (value: string) => void;
  placeholder?: string;
  children?: ReactNode;
  filters?: ReactNode;
  activeFilters?: number;
  actions?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const bar = useContext(WorkspaceTopbarContext);
  const choices = Children.toArray(children);
  const sortChoices = choices.filter(child => isValidElement<{"aria-label"?: string}>(child) && /^sort\b/i.test(child.props["aria-label"] || ""));
  const viewChoices = choices.filter(child => isValidElement<{"data-toolbar-view"?: boolean}>(child) && child.props["data-toolbar-view"]);
  const otherChoices = choices.filter(child => !sortChoices.includes(child) && !viewChoices.includes(child));
  return (
    <>
      <WorkspaceNavSlot kind="search"><div className="work-toolbar">
        <SearchField aria-label={placeholder} value={query} onChange={(e) => onQuery(e.target.value)} className="work-search" />
        {filters && (
          <Popover.Root open={expanded} onOpenChange={setExpanded}><Popover.Trigger asChild><WorkspaceButton
            icon="filter"
            title="Filter"
            aria-label={activeFilters ? `Filter (${activeFilters} active)` : "Filter"}
            aria-expanded={expanded}
          /></Popover.Trigger><Popover.Portal><Popover.Content className="app-select-menu workspace-filter-menu" sideOffset={8} collisionPadding={12} aria-label="Filters">{filters}</Popover.Content></Popover.Portal></Popover.Root>
        )}
        {sortChoices.map((child, index) => isValidElement<React.ComponentProps<typeof SelectField>>(child) ? cloneElement(child, { key: index, className: "toolbar-icon-select", title: "Sort", triggerContent: <UnigentamosIcon role="sort" size={20}/> }) : child)}
        {viewChoices.map((child, index) => isValidElement<React.ComponentProps<typeof SelectField>>(child) && child.type === SelectField ? <ViewCycleButton key={index} options={Children.toArray(child.props.children).filter(isValidElement).map(option => (option as React.ReactElement<{value: DirectoryViewMode}>).props.value)} value={child.props.value as DirectoryViewMode} onChange={value => child.props.onChange?.({target:{value},currentTarget:{value}} as React.ChangeEvent<HTMLSelectElement>)} /> : child)}
        {actions}
        {bar && otherChoices.length ? <Popover.Root><Popover.Trigger className="workspace-nav-trigger" aria-label="View options"><UnigentamosIcon role="sliders" size={18} /></Popover.Trigger><Popover.Portal><Popover.Content className="workspace-nav-menu workspace-view-options" align="end" sideOffset={8} collisionPadding={12}>{otherChoices}</Popover.Content></Popover.Portal></Popover.Root> : otherChoices}
      </div></WorkspaceNavSlot>
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
  anchorSelector,
  presentation,
  className,
  titleIcon,
  anchorWidth = 620,
  headerActions,
  focusInput = true,
  returnFocusSelector,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  description?: string;
  anchorSelector?: string;
  presentation?: "center" | "page";
  className?: string;
  titleIcon?: string;
  anchorWidth?: number;
  headerActions?: ReactNode;
  focusInput?: boolean;
  returnFocusSelector?: string;
}) {
  const [anchorStyle, setAnchorStyle] = useState<CSSProperties>();
  useLayoutEffect(() => {
    if (!open || !anchorSelector) return;
    const place = () => {
      const trigger = [...document.querySelectorAll<HTMLElement>(anchorSelector)].find(node => node.getBoundingClientRect().width > 0);
      const box = trigger?.getBoundingClientRect();
      const top = Math.min(box ? box.bottom + 8 : 100, innerHeight * .3);
      const width = Math.min(anchorWidth, innerWidth - 24);
      const left = Math.max(12, Math.min((box?.right || innerWidth - 12) - width, innerWidth - width - 12));
      setAnchorStyle({ top, left, width, maxHeight: `calc(100dvh - ${top + 12}px)`, transformOrigin: `${Math.max(0, (box?.left || left) - left)}px top` });
    };
    place(); window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, anchorSelector, anchorWidth]);
  const descriptionId = useId();
  const sheetContent = useRef<HTMLDivElement>(null);
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
        <Dialog.Content ref={sheetContent}
          onOpenAutoFocus={(event) => {
            if (!focusInput) { event.preventDefault(); requestAnimationFrame(() => sheetContent.current?.querySelector<HTMLElement>('[aria-label="Close details"]')?.focus({preventScroll:true})); }
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
            const target = (returnFocusSelector ? document.querySelector<HTMLElement>(returnFocusSelector) : null) || opener.current;
            if (target?.isConnected) target.focus({ preventScroll: true });
          }}
          className={`work-sheet${anchorSelector ? " work-sheet--anchored" : ""}${presentation ? ` work-sheet--${presentation}` : ""}${className ? ` ${className}` : ""}`}
          style={anchorSelector ? anchorStyle : undefined}
          aria-describedby={description ? descriptionId : undefined}
        >
          <div className="work-sheet-header">
            <Dialog.Title>{titleIcon && <UnigentamosIcon role={titleIcon} candidate={titleIcon === "sliders" ? "settings" : undefined} size={22} />}{title}</Dialog.Title>
            <div className="work-sheet-header-actions">
            {headerActions}
            <Dialog.Close asChild>
              <WorkspaceButton aria-label="Close details" icon="close">
                Close
              </WorkspaceButton>
            </Dialog.Close>
            </div>
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
