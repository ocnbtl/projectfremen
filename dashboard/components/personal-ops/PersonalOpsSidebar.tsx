"use client";

import ModuleSidebar, {
  type ModuleSidebarItem,
  type ModuleSidebarSection
} from "../admin-shell/ModuleSidebar";
import styles from "./PersonalOpsWorkspace.module.css";
import PersonalOpsIcon, { type PersonalOpsIconName } from "./PersonalOpsIcon";

export type PersonalOpsSidebarView =
  | "command"
  | "goals"
  | "decisions"
  | "obligations"
  | "follow-ups"
  | "routines"
  | "passwords"
  | "lists"
  | "travel"
  | "personal-build"
  | "car"
  | "style-guide"
  | "dog"
  | "inbox"
  | "templates";

export type PersonalOpsSidebarCounts = {
  command: number;
  goals: number;
  decisions: number;
  obligations: number;
  followUps: number;
  routines: number;
  captures: number;
  templates: number;
  archived: number;
  passwords?: number;
  lists?: number;
  travel?: number;
  personalBuild?: number;
  car?: number;
  styleGuide?: number;
  dog?: number;
};

export const PERSONAL_OPS_DOMAIN_LABELS = [
  "Personal Admin",
  "Health",
  "Home",
  "Career",
  "Finance",
  "Relationships",
  "Learning"
] as const;

const VIEW_ROUTES: Record<PersonalOpsSidebarView, string> = {
  command: "/admin/personal",
  goals: "/admin/personal/goals",
  decisions: "/admin/personal/decisions",
  obligations: "/admin/personal/obligations",
  "follow-ups": "/admin/personal/follow-ups",
  routines: "/admin/personal/routines",
  passwords: "/admin/personal/passwords",
  lists: "/admin/personal/lists",
  travel: "/admin/personal/travel",
  "personal-build": "/admin/personal/personal-build",
  car: "/admin/personal/car",
  "style-guide": "/admin/personal/style-guide",
  dog: "/admin/personal/dog",
  inbox: "/admin/personal/inbox",
  templates: "/admin/personal/templates"
};

const SMART_VIEWS = [
  ["due-soon", "Due Soon"],
  ["needs-review", "Needs Review"],
  ["blocked", "Blocked"],
  ["recurring", "Recurring"],
  ["linked-people", "Linked to People"],
  ["linked-finance", "Linked to Finance"],
  ["linked-reviews", "Linked to Reviews"]
] as const;

function viewItem({
  id,
  label,
  view,
  activeView,
  count,
  icon,
  unavailableReason
}: {
  id: string;
  label: string;
  view: PersonalOpsSidebarView;
  activeView: PersonalOpsSidebarView;
  count: number;
  icon?: PersonalOpsIconName;
  unavailableReason?: string;
}): ModuleSidebarItem {
  return {
    id,
    label,
    href: VIEW_ROUTES[view],
    active: activeView === view,
    count,
    icon: icon ? <PersonalOpsIcon name={icon} /> : undefined,
    disabled: Boolean(unavailableReason),
    disabledReason: unavailableReason
  };
}

export default function PersonalOpsSidebar({
  activeView,
  filter,
  pathname,
  counts,
  unavailableViews,
  mobileOpen,
  onClose
}: {
  activeView: PersonalOpsSidebarView;
  filter: string;
  pathname: string;
  counts: PersonalOpsSidebarCounts;
  unavailableViews?: Partial<Record<PersonalOpsSidebarView, string>>;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const isPersonalSystemView = ["passwords", "lists", "travel", "personal-build", "car", "style-guide", "dog"].includes(activeView);
  const domainItems: ModuleSidebarItem[] = PERSONAL_OPS_DOMAIN_LABELS.map((domain) => {
    const id = `domain-${domain.toLowerCase().replace(/\s+/g, "-")}`;
    return {
      id,
      label: domain,
      href: `${pathname}?filter=${id}`,
      active: filter === id
    };
  });

  const smartItems: ModuleSidebarItem[] = SMART_VIEWS
    .filter(([id]) => activeView !== "decisions" || (id !== "recurring" && id !== "blocked"))
    .map(([id, label]) => ({
    id,
    label,
    href: `${pathname}?filter=${id}`,
    active: filter === id
    }));

  const commandSection: ModuleSidebarSection =
    {
      id: "command",
      label: "Command",
      items: [
        {
          id: "today",
          label: "Today",
          href: VIEW_ROUTES.command,
          active: activeView === "command" && filter !== "week",
          count: counts.command,
          icon: <PersonalOpsIcon name="today" />
        },
        {
          id: "week",
          label: "This Week",
          href: `${VIEW_ROUTES.command}?filter=week`,
          active: activeView === "command" && filter === "week",
          icon: <PersonalOpsIcon name="week" />
        },
        viewItem({
          id: "goals",
          label: "Current Goals",
          view: "goals",
          activeView,
          count: counts.goals,
          icon: "goal",
          unavailableReason: unavailableViews?.goals
        }),
        viewItem({
          id: "follow-ups",
          label: "Follow-ups",
          view: "follow-ups",
          activeView,
          count: counts.followUps,
          icon: "follow-up",
          unavailableReason: unavailableViews?.["follow-ups"]
        }),
        viewItem({
          id: "decisions",
          label: "Decisions",
          view: "decisions",
          activeView,
          count: counts.decisions,
          icon: "decision",
          unavailableReason: unavailableViews?.decisions
        }),
        viewItem({
          id: "routines",
          label: "Routines",
          view: "routines",
          activeView,
          count: counts.routines,
          icon: "routine",
          unavailableReason: unavailableViews?.routines
        })
      ]
    };
  const dataSection: ModuleSidebarSection =
    {
      id: "data",
      label: "Data",
      items: [
        viewItem({
          id: "inbox",
          label: "Capture Inbox",
          view: "inbox",
          activeView,
          count: counts.captures,
          unavailableReason: unavailableViews?.inbox
        }),
        viewItem({
          id: "templates",
          label: "Templates",
          view: "templates",
          activeView,
          count: counts.templates,
          unavailableReason: unavailableViews?.templates
        }),
        ...(!isPersonalSystemView ? [{
          id: "archived",
          label: "Archived",
          href: `${pathname}?filter=archived`,
          active: filter === "archived",
          count: counts.archived
        }, {
          id: "settings",
          label: "Settings",
          disabled: true,
          disabledReason: "Personal Ops settings are not connected yet."
        }] : [])
      ]
    };
  const sections: ModuleSidebarSection[] = isPersonalSystemView
    ? [commandSection, dataSection]
    : [commandSection, { id: "domains", label: "Domains", items: domainItems }, { id: "smart", label: "Smart Views", items: smartItems }, dataSection];

  return (
    <ModuleSidebar
      title="Personal Ops"
      description="Daily command, durable records, and personal systems."
      sections={sections}
      className={styles.sidebar}
      mobileOpen={mobileOpen}
      onClose={onClose}
    />
  );
}
