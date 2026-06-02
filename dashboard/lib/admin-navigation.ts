export type AdminProjectNavItem = {
  label: string;
  shortLabel: string;
  slug: string;
  href: string;
  status: "active" | "planned";
};

export type AdminNavItem = {
  label: string;
  href?: string;
  description?: string;
  children?: AdminProjectNavItem[];
};

export const ADMIN_PROJECTS: AdminProjectNavItem[] = [
  {
    label: "Project Blacktube",
    shortLabel: "Blacktube",
    slug: "blacktube",
    href: "/admin/projects/blacktube",
    status: "planned"
  },
  {
    label: "Project Fremen",
    shortLabel: "Fremen",
    slug: "fremen",
    href: "/admin/entities/unigentamos",
    status: "active"
  },
  {
    label: "Project Iceflake",
    shortLabel: "Iceflake",
    slug: "iceflake",
    href: "/admin/entities/pngwn",
    status: "active"
  },
  {
    label: "Project Pacific",
    shortLabel: "Pacific",
    slug: "pacific",
    href: "/admin/projects/pacific",
    status: "planned"
  },
  {
    label: "Project Pint",
    shortLabel: "Pint",
    slug: "pint",
    href: "/admin/entities/diyesu-decor",
    status: "active"
  }
];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    label: "Projects",
    href: "/admin/projects",
    description: "Project command centers",
    children: ADMIN_PROJECTS
  },
  {
    label: "Notes",
    href: "/admin/notes",
    description: "Dashboard-native notes"
  },
  {
    label: "People",
    href: "/admin/people",
    description: "Personal CRM"
  },
  {
    label: "Media",
    href: "/admin/media",
    description: "Files, images, attachments"
  },
  {
    label: "Personal Ops",
    href: "/admin/personal",
    description: "Life systems"
  },
  {
    label: "Reviews",
    href: "/admin/reviews/weekly",
    description: "Weekly and monthly cadence"
  },
  {
    label: "Resources",
    href: "/admin/resources",
    description: "Articles, podcasts, posts, references"
  },
  {
    label: "Finance",
    href: "/admin/finance",
    description: "Cash flow and review prep"
  }
];

export function getProjectBySlug(slug: string) {
  return ADMIN_PROJECTS.find((project) => project.slug === slug) || null;
}
