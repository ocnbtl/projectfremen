"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import UnigentamosIcon from "../icons/UnigentamosIcon";
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
  hidden?: boolean;
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

type DockPoint = { x: number; y: number };
type DockRect = DockPoint & { width: number; height: number };
type DockDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
};

const DOCK_VIEWPORT_GAP = 12;
const AI_DOCK_OPEN_STORAGE_KEY = "unigentamos:assistant:open";

type SharedAIDockRegistration = SharedAIDockProps & { ownerId: string };
type SharedAIDockHost = {
  register: (registration: SharedAIDockRegistration) => void;
  unregister: (ownerId: string, ownerPathname: string) => void;
};

const SharedAIDockHostContext = createContext<SharedAIDockHost | null>(null);

function titleCaseContext(value: string) {
  return value
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function clampLauncher(point: DockPoint, width: number, height: number): DockPoint {
  return {
    x: Math.min(Math.max(DOCK_VIEWPORT_GAP, point.x), Math.max(DOCK_VIEWPORT_GAP, window.innerWidth - width - DOCK_VIEWPORT_GAP)),
    y: Math.min(Math.max(DOCK_VIEWPORT_GAP, point.y), Math.max(DOCK_VIEWPORT_GAP, window.innerHeight - height - DOCK_VIEWPORT_GAP))
  };
}

function clampPanel(rect: DockRect): DockRect {
  const width = Math.min(Math.max(320, rect.width), Math.max(320, window.innerWidth - (DOCK_VIEWPORT_GAP * 2)));
  const height = Math.min(Math.max(360, rect.height), Math.max(360, window.innerHeight - (DOCK_VIEWPORT_GAP * 2)));
  return {
    width,
    height,
    x: Math.min(Math.max(DOCK_VIEWPORT_GAP, rect.x), Math.max(DOCK_VIEWPORT_GAP, window.innerWidth - width - DOCK_VIEWPORT_GAP)),
    y: Math.min(Math.max(DOCK_VIEWPORT_GAP, rect.y), Math.max(DOCK_VIEWPORT_GAP, window.innerHeight - height - DOCK_VIEWPORT_GAP))
  };
}

function SharedAIDockSurface({
  open,
  onOpenChange,
  context,
  title = "Unigentamos AI",
  footer,
  className,
  hidden = false
}: SharedAIDockProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelId = useId();
  const promptId = useId();
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);
  const launcherDrag = useRef<DockDrag | null>(null);
  const panelDrag = useRef<DockDrag | null>(null);
  const suppressLauncherClick = useRef(false);
  const [compactViewport, setCompactViewport] = useState(false);
  const [launcherPosition, setLauncherPosition] = useState<DockPoint | null>(null);
  const [panelRect, setPanelRect] = useState<DockRect | null>(null);
  const [dragging, setDragging] = useState<"launcher" | "panel" | null>(null);
  const [draft, setDraft] = useState("");

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

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const syncViewport = () => {
      const compact = media.matches || document.documentElement.dataset.adminPreview === "mobile";
      setCompactViewport(compact);
      if (!compact) {
        const launcherBounds = launcherRef.current?.getBoundingClientRect();
        if (launcherBounds) {
          setLauncherPosition((current) => current ? clampLauncher(current, launcherBounds.width, launcherBounds.height) : current);
        }
        setPanelRect((current) => current ? clampPanel(current) : current);
      }
    };
    syncViewport();
    const previewObserver = new MutationObserver(syncViewport);
    previewObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-admin-preview"] });
    media.addEventListener("change", syncViewport);
    window.addEventListener("resize", syncViewport);
    return () => {
      previewObserver.disconnect();
      media.removeEventListener("change", syncViewport);
      window.removeEventListener("resize", syncViewport);
    };
  }, []);

  useEffect(() => {
    if (!open || compactViewport || panelRect || !panelRef.current) return;
    const bounds = panelRef.current.getBoundingClientRect();
    setPanelRect(clampPanel({ x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height }));
  }, [compactViewport, open, panelRect]);

  const contextSegments = [
    MODULE_LABELS[context.module],
    context.object?.label,
    context.activeTab ? titleCaseContext(context.activeTab) : undefined,
    context.visibleScope ? titleCaseContext(context.visibleScope) : undefined
  ].filter((value): value is string => Boolean(value));

  const launcherStyle: CSSProperties | undefined = !compactViewport && launcherPosition
    ? { left: launcherPosition.x, top: launcherPosition.y, right: "auto", bottom: "auto" }
    : undefined;
  const panelStyle: CSSProperties | undefined = !compactViewport
    ? panelRect
      ? { position: "fixed", left: panelRect.x, top: panelRect.y, right: "auto", bottom: "auto", width: panelRect.width, height: panelRect.height, maxHeight: "none" }
      : { position: "fixed", right: 22, bottom: 86 }
    : undefined;

  function beginLauncherDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (compactViewport || event.button !== 0 || !launcherRef.current) return;
    const bounds = launcherRef.current.getBoundingClientRect();
    launcherDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: bounds.left,
      originY: bounds.top,
      moved: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveLauncher(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = launcherDrag.current;
    if (!drag || drag.pointerId !== event.pointerId || !launcherRef.current) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) return;
    drag.moved = true;
    setDragging("launcher");
    const bounds = launcherRef.current.getBoundingClientRect();
    setLauncherPosition(clampLauncher({ x: drag.originX + deltaX, y: drag.originY + deltaY }, bounds.width, bounds.height));
  }

  function endLauncherDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = launcherDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressLauncherClick.current = drag.moved;
    launcherDrag.current = null;
    setDragging(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function beginPanelDrag(event: ReactPointerEvent<HTMLElement>) {
    if (compactViewport || event.button !== 0 || !panelRef.current || (event.target as HTMLElement).closest("button")) return;
    const bounds = panelRef.current.getBoundingClientRect();
    panelDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: bounds.left,
      originY: bounds.top,
      moved: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePanel(event: ReactPointerEvent<HTMLElement>) {
    const drag = panelDrag.current;
    if (!drag || drag.pointerId !== event.pointerId || !panelRef.current) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) return;
    drag.moved = true;
    setDragging("panel");
    const bounds = panelRef.current.getBoundingClientRect();
    setPanelRect(clampPanel({ x: drag.originX + deltaX, y: drag.originY + deltaY, width: bounds.width, height: bounds.height }));
  }

  function endPanelDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = panelDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    panelDrag.current = null;
    setDragging(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function capturePanelRect() {
    if (compactViewport || dragging === "panel" || !panelRef.current) return;
    const bounds = panelRef.current.getBoundingClientRect();
    setPanelRect(clampPanel({ x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height }));
  }

  if (hidden) return null;

  return (
    <div className={["shared-ai-dock", `shared-ai-dock--${context.module.replace(/_/g, "-")}`, open && "is-open", dragging && `is-dragging-${dragging}`, className].filter(Boolean).join(" ")} style={launcherStyle}>
      <button
        ref={launcherRef}
        type="button"
        className="shared-ai-dock__launcher"
        onClick={() => {
          if (suppressLauncherClick.current) {
            suppressLauncherClick.current = false;
            return;
          }
          onOpenChange(!open);
        }}
        onPointerDown={beginLauncherDrag}
        onPointerMove={moveLauncher}
        onPointerUp={endLauncherDrag}
        onPointerCancel={endLauncherDrag}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close AI assistant" : "Open AI assistant"}
        title={compactViewport ? "Open assistant" : "Open assistant · drag to reposition"}
      >
        <span className="shared-ai-dock__launcher-mark" aria-hidden="true">
          <UnigentamosIcon role="message" />
        </span>
        <span className="shared-ai-dock__launcher-label">Assistant</span>
      </button>

      {open && (
        <section
          ref={panelRef}
          id={panelId}
          className="shared-ai-dock__panel"
          style={panelStyle}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          onPointerUpCapture={capturePanelRect}
        >
          <header
            className="shared-ai-dock__header"
            onPointerDown={beginPanelDrag}
            onPointerMove={movePanel}
            onPointerUp={endPanelDrag}
            onPointerCancel={endPanelDrag}
          >
            <span className="shared-ai-dock__drag-handle" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
            <div className="shared-ai-dock__heading">
              <span>Workspace assistant</span>
              <div>
                <h2 id={titleId}>{title}</h2>
                <span className="shared-ai-dock__connection-state"><i aria-hidden="true" />Not connected</span>
              </div>
            </div>
            <button ref={closeRef} type="button" onClick={() => onOpenChange(false)} aria-label="Close AI assistant">
              <UnigentamosIcon role="close" size={20} />
            </button>
          </header>

          <div className="shared-ai-dock__body">
            <div className="shared-ai-dock__context" aria-label="Current AI context">
              <span className="shared-ai-dock__context-eye" aria-label="Viewing">
                <UnigentamosIcon role="show" />
              </span>
              <strong>{contextSegments.map((segment, index) => (
                <span key={`${segment}-${index}`}>
                  {index > 0 && <UnigentamosIcon className="shared-ai-dock__context-arrow" role="chevron-right" size={16} />}
                  <span>{segment}</span>
                </span>
              ))}</strong>
            </div>
            <div className="shared-ai-dock__empty-state">
              <span className="shared-ai-dock__empty-icon" aria-hidden="true"><UnigentamosIcon role="message" /></span>
              <div><h3>Connect a local model</h3><p id={descriptionId}>This panel is ready to hold context, but a model connector has not been configured.</p></div>
            </div>
            <div className="shared-ai-dock__local-setup" aria-label="Local AI connection brief">
              <ol>
                <li><strong>Run Ollama locally.</strong><span>Install Ollama, download a model, and confirm it responds on your device.</span></li>
                <li><strong>Add a server-side bridge.</strong><span>Connect the app server to the private Ollama endpoint, normally <code>127.0.0.1:11434</code>. This connector is not included yet.</span></li>
                <li><strong>Keep access private.</strong><span>For the hosted site, use an authenticated local relay or private network. Do not expose Ollama directly to the public internet.</span></li>
              </ol>
              <p>Until that bridge is implemented and authorized, the assistant cannot read records, send prompts, or write changes.</p>
            </div>
            {context.allowedActions && context.allowedActions.length > 0 && (
              <div className="shared-ai-dock__permissions">
                <span>When connected</span>
                <ul>
                  {context.allowedActions.map((action) => <li key={action}>{action}</li>)}
                </ul>
              </div>
            )}
          </div>

          <footer className="shared-ai-dock__footer">
            <label htmlFor={promptId}>Ask about this workspace</label>
            <div>
              <textarea id={promptId} rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Draft a prompt while disconnected…" />
              <button type="button" disabled title="AI assistant is disconnected" aria-label="Send message">
                <UnigentamosIcon role="send" size={20} />
              </button>
            </div>
            {footer}
          </footer>
        </section>
      )}
    </div>
  );
}

export function PersistentSharedAIDockProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [registration, setRegistration] = useState<SharedAIDockRegistration | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(AI_DOCK_OPEN_STORAGE_KEY) === "true") setOpen(true);
    } catch {
      // Persistence is an enhancement; the dock remains usable without storage access.
    }
  }, []);

  const register = useCallback((nextRegistration: SharedAIDockRegistration) => {
    setRegistration(nextRegistration);
    if (nextRegistration.open) setOpen(true);
  }, []);

  const unregister = useCallback((ownerId: string, ownerPathname: string) => {
    setRegistration((current) => {
      if (!current || current.ownerId !== ownerId) return current;
      return window.location.pathname === ownerPathname ? { ...current, hidden: true } : current;
    });
  }, []);

  const host = useMemo<SharedAIDockHost>(() => ({ register, unregister }), [register, unregister]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    registration?.onOpenChange(nextOpen);
    try {
      window.localStorage.setItem(AI_DOCK_OPEN_STORAGE_KEY, String(nextOpen));
    } catch {
      // Keep the session behavior even if storage is unavailable.
    }
  }, [registration]);

  const hideForRoute = pathname === "/admin/login";

  return (
    <SharedAIDockHostContext.Provider value={host}>
      {children}
      {registration && !hideForRoute && (
        <SharedAIDockSurface
          {...registration}
          open={open}
          onOpenChange={handleOpenChange}
        />
      )}
    </SharedAIDockHostContext.Provider>
  );
}

export default function SharedAIDock(props: SharedAIDockProps) {
  const host = useContext(SharedAIDockHostContext);
  const ownerId = useId();
  const ownerPathname = usePathname();
  const allowedActionsKey = props.context.allowedActions?.join("\u0000") || "";
  const registration = useMemo<SharedAIDockRegistration>(() => ({ ...props, ownerId }), [
    ownerId,
    props.className,
    props.context.activeTab,
    props.context.module,
    props.context.object?.label,
    props.context.object?.module,
    props.context.object?.objectId,
    props.context.visibleScope,
    props.footer,
    props.hidden,
    props.onOpenChange,
    props.open,
    props.title,
    allowedActionsKey
  ]);

  useEffect(() => {
    if (!host) return;
    host.register(registration);
    return () => host.unregister(ownerId, ownerPathname);
  }, [host, ownerId, ownerPathname, registration]);

  if (host) return null;
  return <SharedAIDockSurface {...props} />;
}
