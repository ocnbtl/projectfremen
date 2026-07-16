"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { ModuleId } from "../lib/native-objects/types";
import AppTopNav from "./admin-shell/AppTopNav";
import SharedAIDock from "./admin-shell/SharedAIDock";

type SidebarItem = {
  label: string;
  value?: string;
  href?: string;
};

export type AdminChromeProps = {
  sidebarTitle: string;
  sidebarSummary?: string;
  sidebarItems?: SidebarItem[];
  sidebarActions?: SidebarItem[];
  sidebarChildren?: ReactNode;
  showCommandSearch?: boolean;
  showPageSidebar?: boolean;
  showLocalAi?: boolean;
};

const SIDEBAR_STORAGE_KEY = "admin-sidebar-collapsed";

function isMobilePreviewMode() {
  return (
    document.documentElement.dataset.adminPreview === "mobile" ||
    window.localStorage.getItem("admin-preview-mode") === "mobile" ||
    window.matchMedia("(max-width: 760px)").matches
  );
}

function AdminPageSidebar({
  title,
  summary,
  items = [],
  actions = [],
  children
}: {
  title: string;
  summary?: string;
  items?: SidebarItem[];
  actions?: SidebarItem[];
  children?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    setCollapsed(isMobilePreviewMode() ? true : stored === "1");

    function handlePreviewChange(event: Event) {
      const mode = (event as CustomEvent<"desktop" | "mobile">).detail;
      if (mode === "mobile") {
        setCollapsed(true);
      } else {
        setCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1");
      }
    }

    window.addEventListener("admin-preview-mode-change", handlePreviewChange);
    return () => window.removeEventListener("admin-preview-mode-change", handlePreviewChange);
  }, []);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <aside className={`admin-page-sidebar ${collapsed ? "is-collapsed" : ""}`} aria-label="Page sidebar">
      <button
        type="button"
        className="admin-sidebar-toggle"
        onClick={toggleSidebar}
        aria-label={collapsed ? "Expand page sidebar" : "Collapse page sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <span />
      </button>
      {!collapsed && (
        <div className="admin-page-sidebar-inner">
          <p>Page</p>
          <h2>{title}</h2>
          {summary && <span className="admin-page-sidebar-summary">{summary}</span>}
          {items.length > 0 && (
            <dl className="admin-page-sidebar-list">
              {items.map((item) => (
                <div key={`${item.label}-${item.value || item.href || ""}`}>
                  <dt>{item.label}</dt>
                  <dd>{item.value || "-"}</dd>
                </div>
              ))}
            </dl>
          )}
          {children && <div className="admin-page-sidebar-content">{children}</div>}
          {actions.length > 0 && (
            <div className="admin-page-sidebar-actions">
              {actions.map((action) =>
                action.href ? (
                  <Link href={action.href} key={action.label}>
                    {action.label}
                  </Link>
                ) : (
                  <span key={action.label}>{action.label}</span>
                )
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

function moduleFromTitle(title: string): ModuleId {
  const normalized = title.trim().toLowerCase();
  if (normalized === "personal ops" || normalized === "personal") return "personal_ops";
  if (normalized === "people") return "people";
  if (normalized === "media") return "media";
  if (normalized === "projects") return "projects";
  if (normalized === "notes") return "notes";
  if (normalized === "reviews") return "reviews";
  if (normalized === "resources") return "resources";
  if (normalized === "finance") return "finance";
  return "personal_ops";
}

export default function AdminChrome({
  sidebarTitle,
  sidebarSummary,
  sidebarItems,
  sidebarActions,
  sidebarChildren,
  showCommandSearch,
  showPageSidebar = true,
  showLocalAi = true
}: AdminChromeProps) {
  const [aiOpen, setAiOpen] = useState(false);

  return (
    <>
      <AppTopNav showCommandSearch={showCommandSearch} />
      {showPageSidebar && (
        <AdminPageSidebar
          title={sidebarTitle}
          summary={sidebarSummary}
          items={sidebarItems}
          actions={sidebarActions}
        >
          {sidebarChildren}
        </AdminPageSidebar>
      )}
      <style>{`
        .admin-global-topnav {
          width: min(1220px, calc(100vw - 32px));
        }

        .admin-command-search {
          position: absolute;
          top: calc(100% + 16px);
          right: clamp(12px, 4vw, 44px);
          display: flex;
          align-items: center;
          gap: 10px;
          width: min(420px, calc(100vw - 360px));
          min-height: 44px;
          padding: 0 14px;
          border: 1px solid #bfd2db;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.94);
          box-shadow: 0 12px 26px rgba(16, 32, 38, 0.1);
        }

        .admin-command-search span {
          color: #60747c;
          font-size: 18px;
        }

        .admin-command-search input {
          min-width: 0;
          flex: 1;
          border: 0;
          outline: 0;
          background: transparent;
          color: #102026;
          font: inherit;
          font-size: 14px;
        }

        .admin-command-search input::placeholder {
          color: #60747c;
        }

        .admin-command-search kbd {
          color: #60747c;
          font: inherit;
          font-size: 11px;
          font-weight: 850;
          white-space: nowrap;
        }

        .admin-chrome-main {
          padding-top: 132px !important;
        }

        .people-module-shell.admin-chrome-main {
          max-width: none;
          width: 100vw;
          min-height: 100dvh;
          margin-left: calc(50% - 50vw);
          margin-right: calc(50% - 50vw);
          padding: 56px 0 0 !important;
          overflow: hidden;
        }

        .native-module-shell.admin-chrome-main {
          max-width: none;
          width: 100vw;
          min-height: 100dvh;
          margin-left: calc(50% - 50vw);
          margin-right: calc(50% - 50vw);
          padding: 68px 0 0 !important;
          overflow: hidden;
        }

        .grid-4 {
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        }

        .module-stat-grid {
          margin-bottom: 16px;
        }

        .module-stat {
          display: grid;
          gap: 8px;
          min-height: 118px;
          padding: 16px;
          border: 1px solid #d5e2e7;
          border-radius: 8px;
          background: #ffffff;
        }

        .module-stat > span {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: currentColor;
        }

        .module-stat p {
          margin: 0;
          color: #60747c;
          font-size: 13px;
          font-weight: 850;
        }

        .module-stat strong {
          color: #102026;
          font-size: 26px;
          line-height: 1;
        }

        .module-stat-green,
        .module-amount-green {
          color: #1f7a52;
        }

        .module-stat-crimson,
        .module-amount-crimson {
          color: #c9264e;
        }

        .module-stat-blue,
        .module-amount-blue {
          color: #1976a3;
        }

        .module-stat-cyan,
        .module-amount-cyan {
          color: #1396ad;
        }

        .module-stat-orange {
          color: #d78428;
        }

        .module-stat-pink {
          color: #c62c86;
        }

        .module-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
          gap: 16px;
          align-items: start;
        }

        .module-main-panel,
        .module-side-panel {
          border-radius: 8px;
        }

        .module-table {
          display: grid;
          gap: 10px;
        }

        .module-table > div {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          gap: 14px;
          align-items: center;
          min-height: 44px;
          padding: 0 12px;
          border-radius: 8px;
          background: #f5f8f7;
        }

        .finance-module-shell .module-table > div {
          grid-template-columns: minmax(0, 1fr) auto;
        }

        .module-table strong,
        .module-table span {
          min-width: 0;
          overflow-wrap: anywhere;
        }

        html[data-admin-preview="mobile"] .admin-command-search {
          display: none;
        }

        html[data-admin-preview="mobile"] .grid-2,
        html[data-admin-preview="mobile"] .grid-3,
        html[data-admin-preview="mobile"] .grid-4,
        html[data-admin-preview="mobile"] .module-layout,
        html[data-admin-preview="mobile"] .module-table > div {
          grid-template-columns: 1fr;
        }

        html[data-admin-preview="mobile"] .module-table > div {
          align-items: start;
        }

        @media (max-width: 900px) {
          .admin-global-topnav {
            align-items: flex-start;
            border-radius: 24px;
          }

          .admin-global-links {
            overflow-x: auto;
          }

          .admin-command-search {
            display: none;
          }

          .admin-chrome-main {
            padding-top: 88px !important;
          }

          .people-module-shell.admin-chrome-main {
            padding-top: 72px !important;
            overflow: visible;
          }

          .native-module-shell.admin-chrome-main {
            padding-top: 68px !important;
            overflow: hidden;
          }

          .module-layout {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      {showLocalAi && (
        <SharedAIDock
          className="admin-chrome-ai-dock"
          open={aiOpen}
          onOpenChange={setAiOpen}
          context={{
            module: moduleFromTitle(sidebarTitle),
            visibleScope: sidebarTitle,
            allowedActions: ["Draft a proposal", "Summarize visible context"]
          }}
        />
      )}
    </>
  );
}
