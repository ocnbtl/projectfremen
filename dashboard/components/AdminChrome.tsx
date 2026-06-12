"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ADMIN_NAV_ITEMS } from "../lib/admin-navigation";
import PersonalViewportToggle from "./PersonalViewportToggle";

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
};

const SIDEBAR_STORAGE_KEY = "admin-sidebar-collapsed";
const AI_ENDPOINT_STORAGE_KEY = "local-ai-endpoint";
const AI_MODEL_STORAGE_KEY = "local-ai-model";

function isMobilePreviewMode() {
  return (
    document.documentElement.dataset.adminPreview === "mobile" ||
    window.localStorage.getItem("admin-preview-mode") === "mobile" ||
    window.matchMedia("(max-width: 760px)").matches
  );
}

function AdminTopNav({ showCommandSearch = true }: { showCommandSearch?: boolean }) {
  const [projectsOpen, setProjectsOpen] = useState(false);
  const closeProjects = () => setProjectsOpen(false);

  return (
    <header className="admin-global-topnav">
      <Link href="/admin" className="admin-global-brand" aria-label="Unigentamos home">
        <span>U</span>
        <strong>Unigentamos</strong>
      </Link>
      <nav className="admin-global-links" aria-label="Primary navigation">
        {ADMIN_NAV_ITEMS.map((item) =>
          item.children ? (
            <div className="admin-global-nav-group" key={item.label}>
              <button
                type="button"
                className="admin-global-nav-button"
                onClick={() => setProjectsOpen((current) => !current)}
                aria-expanded={projectsOpen}
              >
                {item.label}
                <span aria-hidden="true">v</span>
              </button>
              <div className="admin-project-menu" hidden={!projectsOpen}>
                <Link href={item.href || "/admin/projects"} className="admin-project-menu-overview" onClick={closeProjects}>
                  All projects
                </Link>
                {item.children.map((project) => (
                  <Link href={project.href} className="admin-project-menu-item" key={project.slug} onClick={closeProjects}>
                    <span>{project.shortLabel}</span>
                    <small>{project.status === "active" ? "Active" : "Planned"}</small>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <Link href={item.href || "/admin"} className="admin-global-nav-link" key={item.label}>
              {item.label}
            </Link>
          )
        )}
      </nav>
      <PersonalViewportToggle />
      {showCommandSearch && (
        <div className="admin-command-search" role="search" aria-label="Admin command search">
          <span aria-hidden="true">/</span>
          <input aria-label="Search notes, files, people, reviews" placeholder="Search notes, files, people, reviews" />
          <kbd>cmd k</kbd>
        </div>
      )}
    </header>
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

function getVisiblePageContext() {
  const main = document.querySelector("main");
  return (main?.textContent || document.body.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);
}

function isLocalEndpoint(value: string) {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function LocalAiLauncher() {
  const [open, setOpen] = useState(false);
  const [endpoint, setEndpoint] = useState("http://127.0.0.1:11434");
  const [model, setModel] = useState("gemma");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([
    {
      role: "assistant",
      text: "Local AI is designed to talk only to a model running on this computer. Start Ollama or another localhost-compatible server, then ask from here."
    }
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setEndpoint(window.localStorage.getItem(AI_ENDPOINT_STORAGE_KEY) || "http://127.0.0.1:11434");
    setModel(window.localStorage.getItem(AI_MODEL_STORAGE_KEY) || "gemma");
  }, []);

  const canSend = useMemo(() => prompt.trim().length > 0 && isLocalEndpoint(endpoint), [endpoint, prompt]);

  function updateEndpoint(value: string) {
    setEndpoint(value);
    window.localStorage.setItem(AI_ENDPOINT_STORAGE_KEY, value);
  }

  function updateModel(value: string) {
    setModel(value);
    window.localStorage.setItem(AI_MODEL_STORAGE_KEY, value);
  }

  async function submitPrompt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || !isLocalEndpoint(endpoint)) {
      setError("Local AI endpoint must be localhost, 127.0.0.1, or ::1.");
      return;
    }

    setBusy(true);
    setError("");
    setPrompt("");
    setMessages((current) => [...current, { role: "user", text: cleanPrompt }]);

    try {
      const response = await fetch(`${endpoint.replace(/\/$/, "")}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          prompt: [
            "You are the user's local Unigentamos assistant. Use the visible page context, stay concise, and do not claim access to private data not shown here.",
            `Visible page context: ${getVisiblePageContext()}`,
            `User: ${cleanPrompt}`
          ].join("\n\n")
        })
      });
      if (!response.ok) {
        throw new Error(`Local model returned ${response.status}`);
      }
      const payload = (await response.json()) as { response?: string };
      setMessages((current) => [
        ...current,
        { role: "assistant", text: payload.response?.trim() || "The local model returned an empty response." }
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Local AI request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`local-ai-widget ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="local-ai-toggle"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? "Close local AI" : "Open local AI"}
      >
        AI
      </button>
      {open && (
        <section className="local-ai-panel" aria-label="Local AI assistant">
          <div className="local-ai-panel-header">
            <div>
              <p>Local AI</p>
              <h2>Private assistant</h2>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close local AI">
              x
            </button>
          </div>
          <div className="local-ai-settings">
            <label>
              Endpoint
              <input value={endpoint} onChange={(event) => updateEndpoint(event.target.value)} />
            </label>
            <label>
              Model
              <input value={model} onChange={(event) => updateModel(event.target.value)} placeholder="gemma" />
            </label>
          </div>
          <div className="local-ai-messages">
            {messages.map((message, index) => (
              <article className={`local-ai-message local-ai-message-${message.role}`} key={`${message.role}-${index}`}>
                {message.text}
              </article>
            ))}
            {error && <p className="local-ai-error">{error}</p>}
          </div>
          <form className="local-ai-form" onSubmit={submitPrompt}>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Ask about this page, find a note, or plan a change..."
              rows={3}
            />
            <button type="submit" disabled={!canSend || busy}>
              {busy ? "Thinking..." : "Send"}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

export default function AdminChrome({
  sidebarTitle,
  sidebarSummary,
  sidebarItems,
  sidebarActions,
  sidebarChildren,
  showCommandSearch
}: AdminChromeProps) {
  return (
    <>
      <AdminTopNav showCommandSearch={showCommandSearch} />
      <AdminPageSidebar
        title={sidebarTitle}
        summary={sidebarSummary}
        items={sidebarItems}
        actions={sidebarActions}
      >
        {sidebarChildren}
      </AdminPageSidebar>
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

          .module-layout {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      <LocalAiLauncher />
    </>
  );
}
