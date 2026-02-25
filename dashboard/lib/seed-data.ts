export type ActionItem = {
  id: string;
  title: string;
  entity: "Unigentamos" | "pngwn" | "Diyesu Decor";
  due: string;
  status: "due_now" | "upcoming" | "blocked";
};

export type KpiCard = {
  id: string;
  entity: "Unigentamos" | "pngwn" | "Diyesu Decor";
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
    entity: "Diyesu Decor",
    due: "This week",
    status: "upcoming"
  }
];

export const KPI_CARDS: KpiCard[] = [
  {
    id: "K-001",
    entity: "Unigentamos",
    name: "Documentation Coverage",
    value: "0 / 12",
    priority: "P1"
  },
  {
    id: "K-002",
    entity: "Unigentamos",
    name: "Open Blockers",
    value: "0",
    priority: "P1"
  },
  {
    id: "K-003",
    entity: "pngwn",
    name: "Waitlist Signups (Total)",
    value: "0",
    priority: "P1"
  },
  {
    id: "K-004",
    entity: "Diyesu Decor",
    name: "Pins Published This Week",
    value: "0 / 25",
    priority: "P1"
  }
];
