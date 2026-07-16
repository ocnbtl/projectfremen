"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useRef } from "react";

export type DetailTab = {
  id: string;
  label: string;
  count?: number;
  disabled?: boolean;
  disabledReason?: string;
};

export type DetailTabsProps = {
  id: string;
  tabs: readonly DetailTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  ariaLabel?: string;
  className?: string;
};

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export default function DetailTabs({
  id,
  tabs,
  activeTab,
  onTabChange,
  ariaLabel = "Object details",
  className
}: DetailTabsProps) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentId: string) {
    const enabledTabs = tabs.filter((tab) => !tab.disabled);
    const currentIndex = enabledTabs.findIndex((tab) => tab.id === currentId);
    if (currentIndex === -1) {
      return;
    }

    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % enabledTabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = enabledTabs.length - 1;
    }

    if (nextIndex === undefined) {
      return;
    }
    event.preventDefault();
    const nextTab = enabledTabs[nextIndex];
    onTabChange(nextTab.id);
    tabRefs.current.get(nextTab.id)?.focus();
  }

  return (
    <div className={["detail-tabs", className].filter(Boolean).join(" ")} role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => {
        const selected = tab.id === activeTab;
        const tabId = `${safeId(id)}-tab-${safeId(tab.id)}`;
        const panelId = `${safeId(id)}-panel-${safeId(tab.id)}`;
        return (
          <button
            ref={(node) => {
              if (node) {
                tabRefs.current.set(tab.id, node);
              } else {
                tabRefs.current.delete(tab.id);
              }
            }}
            type="button"
            role="tab"
            id={tabId}
            aria-controls={panelId}
            aria-selected={selected}
            aria-describedby={tab.disabledReason ? `${tabId}-reason` : undefined}
            tabIndex={selected ? 0 : -1}
            disabled={tab.disabled}
            title={tab.disabledReason}
            className={selected ? "is-active" : undefined}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, tab.id)}
            key={tab.id}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && <span aria-label={`${tab.count} items`}>{tab.count}</span>}
            {tab.disabledReason && (
              <span id={`${tabId}-reason`} className="sr-only">
                {tab.disabledReason}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export type DetailTabPanelProps = {
  tabsId: string;
  tabId: string;
  active: boolean;
  children: ReactNode;
  className?: string;
};

export function DetailTabPanel({ tabsId, tabId, active, children, className }: DetailTabPanelProps) {
  const safeTabsId = safeId(tabsId);
  const safeTabId = safeId(tabId);
  return (
    <section
      id={`${safeTabsId}-panel-${safeTabId}`}
      role="tabpanel"
      aria-labelledby={`${safeTabsId}-tab-${safeTabId}`}
      tabIndex={0}
      hidden={!active}
      className={["detail-tab-panel", className].filter(Boolean).join(" ")}
    >
      {children}
    </section>
  );
}

