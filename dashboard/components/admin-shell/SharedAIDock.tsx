"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
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

  const contextSummary = [
    MODULE_LABELS[context.module],
    context.object?.label,
    context.activeTab ? `${context.activeTab} tab` : undefined,
    context.visibleScope
  ]
    .filter(Boolean)
    .join(" · ");

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

  return (
    <div className={["shared-ai-dock", open && "is-open", dragging && `is-dragging-${dragging}`, className].filter(Boolean).join(" ")} style={launcherStyle}>
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
          <svg viewBox="0 0 24 24" focusable="false"><path d="m12 3 1.3 4.1L17.5 8.5l-4.2 1.4L12 14l-1.3-4.1-4.2-1.4 4.2-1.4L12 3Z" /><path d="m18.5 14 .7 2.3 2.3.7-2.3.8-.7 2.2-.8-2.2-2.2-.8 2.2-.7.8-2.3Z" /></svg>
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
              <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
                <path d="m4 4 12 12M16 4 4 16" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </header>

          <div className="shared-ai-dock__body">
            <div className="shared-ai-dock__context" aria-label="Current AI context">
              <span>Viewing</span>
              <strong>{contextSummary}</strong>
            </div>
            <div className="shared-ai-dock__empty-state">
              <span className="shared-ai-dock__empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m12 3 1.3 4.1L17.5 8.5l-4.2 1.4L12 14l-1.3-4.1-4.2-1.4 4.2-1.4L12 3Z" /><path d="M5 15.5h7M5 19h10" /></svg></span>
              <div><h3>AI connection is off</h3><p id={descriptionId}>This panel can see the current workspace context, but chat and record changes remain unavailable.</p></div>
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
              <textarea id={promptId} rows={2} placeholder="Connect the assistant to begin" disabled />
              <button type="button" disabled title="AI assistant is disconnected" aria-label="Send message">
                <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m3 10 13-6-4.2 12-2.1-4.1L3 10Z" /><path d="m9.7 11.9 2.8-3" /></svg>
              </button>
            </div>
            {footer}
          </footer>
        </section>
      )}
    </div>
  );
}
