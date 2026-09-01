export type AdminProjectNavItem = {
  label: string;
  shortLabel: string;
  slug: string;
  href: string;
  status: "active" | "planned";
};

export type AdminNavItem = {
  label: string;
  iconRole: string;
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
    iconRole: "module-projects",
    href: "/admin/projects",
    description: "Project command centers"
  },
  {
    label: "Notes",
    iconRole: "module-notes",
    href: "/admin/notes",
    description: "Dashboard-native notes"
  },
  {
    label: "People",
    iconRole: "module-people",
    href: "/admin/people",
    description: "Personal CRM"
  },
  {
    label: "Media",
    iconRole: "module-media",
    href: "/admin/media",
    description: "Files, images, attachments"
  },
  {
    label: "Personal",
    iconRole: "module-personal",
    href: "/admin/personal",
    description: "Life systems"
  },
  {
    label: "Reviews",
    iconRole: "module-reviews",
    href: "/admin/reviews",
    description: "Weekly and monthly cadence"
  },
  {
    label: "Resources",
    iconRole: "module-resources",
    href: "/admin/resources",
    description: "Articles, podcasts, posts, references"
  },
  {
    label: "Finance",
    iconRole: "module-finance",
    href: "/admin/finance",
    description: "Cash flow and review prep"
  },
  {
    label: "Vault",
    iconRole: "module-vault",
    href: "/vault",
    description: "Encrypted local-first storage and sync"
  }
];

export function getProjectBySlug(slug: string) {
  return ADMIN_PROJECTS.find((project) => project.slug === slug) || null;
}
