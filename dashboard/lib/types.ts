export type EntityName = "Unigentamos" | "pngwn" | "Diyesu Decor";
export type ReviewKind = "weekly" | "monthly";

export type KpiEntry = {
  id: string;
  entity: EntityName;
  name: string;
  value: string;
  priority: "P1" | "P2" | "P3";
  link?: string;
  updatedAt: string;
};

export type DocsIndexItem = {
  id: string;
  repo: string;
  path: string;
  url: string;
  title: string;
  class: string;
  status: string;
  projects: string[];
  subjects: string[];
  dueDate: string;
  nextReview: string;
  updatedAt: string;
};

export type DocsIndexState = {
  lastSynced: string | null;
  items: DocsIndexItem[];
};

export type ReviewEntry = {
  id: string;
  kind: ReviewKind;
  scheduledFor: string; // YYYY-MM-DD local date
  createdAt: string;
  updatedAt: string;
  values: Record<string, string>;
};
