"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ADMIN_NAV_ITEMS } from "../lib/admin-navigation";

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
};

const SIDEBAR_STORAGE_KEY = "admin-sidebar-collapsed";
const AI_ENDPOINT_STORAGE_KEY = "local-ai-endpoint";
const AI_MODEL_STORAGE_KEY = "local-ai-model";

function AdminTopNav() {
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
    setCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1");
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
              placeholder="Ask about this page, find a record, or plan a change..."
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
  sidebarChildren
}: AdminChromeProps) {
  return (
    <>
      <AdminTopNav />
      <AdminPageSidebar
        title={sidebarTitle}
        summary={sidebarSummary}
        items={sidebarItems}
        actions={sidebarActions}
      >
        {sidebarChildren}
      </AdminPageSidebar>
      <LocalAiLauncher />
    </>
  );
}
