export type ActionItem = {
  id: string;
  title: string;
  entity: "Unigentamos" | "pngwn" | "Ranosa Decor";
  due: string;
  status: "due_now" | "upcoming" | "blocked";
};

export type KpiCard = {
  id: string;
  entity: "Unigentamos" | "pngwn" | "Ranosa Decor";
  name: string;
  value: string;
  priority: "P1" | "P2" | "P3";
};

export const ACTION_ITEMS: ActionItem[] = [
  {
    id: "A-001",
    title: "Create projectfremen GitHub repo and add remote",
    entity: "Unigentamos",
    due: "Today",
    status: "due_now"
  },
  {
    id: "A-002",
    title: "Finalize KPI starter fields for weekly check-in",
    entity: "Unigentamos",
    due: "This week",
    status: "upcoming"
  },
  {
    id: "A-003",
    title: "Review waitlist conversion assumptions",
    entity: "pngwn",
    due: "This week",
    status: "upcoming"
  },
  {
    id: "A-004",
    title: "Confirm weekly operating packet flow",
    entity: "Ranosa Decor",
    due: "This week",
    status: "upcoming"
  }
];

export const KPI_CARDS: KpiCard[] = [
  {
    id: "K-001",
    entity: "Unigentamos",
    name: "Documentation Coverage",
    value: "0 / 12 areas complete",
    priority: "P1"
  },
  {
    id: "K-002",
    entity: "pngwn",
    name: "Waitlist Signups (Weekly)",
    value: "TBD",
    priority: "P1"
  },
  {
    id: "K-003",
    entity: "Ranosa Decor",
    name: "Content Shipped (Weekly)",
    value: "TBD",
    priority: "P1"
  },
  {
    id: "K-004",
    entity: "Unigentamos",
    name: "Open Blockers",
    value: "0",
    priority: "P1"
  }
];
