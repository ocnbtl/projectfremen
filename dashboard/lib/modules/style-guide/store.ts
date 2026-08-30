import { mutateJsonFile, readJsonFile } from "../../file-store";
import { ICON_REGISTRY, getIconEntry, isIconCandidate } from "../../icons/icon-registry";
import {
  STYLE_GUIDE_SCHEMA_VERSION,
  type StyleGuideColorToken,
  type StyleGuideIconAssignment,
  type StyleGuideInput,
  type StyleGuideModulePalette,
  type StyleGuideState,
  type StyleGuideTypographyRole
} from "./types";

const FILE_NAME = "personal-style-guide.json";
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function defaultStyleGuideState(): StyleGuideState {
  return {
    schemaVersion: STYLE_GUIDE_SCHEMA_VERSION,
    id: "personal-style-guide",
    title: "Unigentamos",
    description: "Calm operations desk",
    typography: [
      { id: "display", label: "Display", family: "Plus Jakarta Sans", size: 36, weight: 800, lineHeight: 1.08, letterSpacing: -0.03 },
      { id: "page-title", label: "Page title", family: "Plus Jakarta Sans", size: 28, weight: 800, lineHeight: 1.15, letterSpacing: -0.02 },
      { id: "section", label: "Section", family: "Plus Jakarta Sans", size: 20, weight: 750, lineHeight: 1.25, letterSpacing: -0.01 },
      { id: "body", label: "Body", family: "Inter", size: 14, weight: 500, lineHeight: 1.5, letterSpacing: 0 },
      { id: "label", label: "Label", family: "Inter", size: 11, weight: 750, lineHeight: 1.25, letterSpacing: 0.04 },
      { id: "data", label: "Data", family: "Inconsolata", size: 12, weight: 650, lineHeight: 1.35, letterSpacing: 0.01 }
    ],
    colors: [
      { id: "ink", label: "Ink", value: "#102026", usage: "Primary text and actions" },
      { id: "text", label: "Text", value: "#23383F", usage: "Default body text" },
      { id: "muted", label: "Muted", value: "#60747C", usage: "Secondary labels and supporting text" },
      { id: "faint", label: "Faint", value: "#7C8E95", usage: "Placeholder and unavailable states" },
      { id: "canvas", label: "Canvas", value: "#F4F7F5", usage: "Application background" },
      { id: "canvas-alt", label: "Canvas alternate", value: "#F6F8F7", usage: "Directory and secondary workspace background" },
      { id: "panel", label: "Panel", value: "#FFFFFF", usage: "Cards, sheets, and controls" },
      { id: "paper", label: "Paper", value: "#FBFCFB", usage: "Quiet inset surface" },
      { id: "border", label: "Border", value: "#D5E2E7", usage: "Default dividers and outlines" },
      { id: "border-strong", label: "Border strong", value: "#BFD2DB", usage: "Interactive control outlines" },
      { id: "selected", label: "Selected", value: "#F7FBFF", usage: "Selected rows and focused navigation" },
      { id: "navy", label: "Navy", value: "#0D252D", usage: "Primary actions" },
      { id: "eucalyptus", label: "Eucalyptus", value: "#2F6F64", usage: "People and positive relationship accents" },
      { id: "blue", label: "Blue", value: "#347998", usage: "Links, resources, and information" },
      { id: "amber", label: "Amber", value: "#C47B19", usage: "Attention and upcoming work" },
      { id: "crimson", label: "Crimson", value: "#B73343", usage: "Destructive and urgent" },
      { id: "violet", label: "Violet", value: "#76566B", usage: "Notes and authored knowledge" },
      { id: "clay", label: "Clay", value: "#8A5C4A", usage: "Media and physical assets" }
    ],
    modules: [
      { id: "projects", module: "Projects", accent: "#516B83", secondary: "#C47B19", surface: "#F1F4F7", status: "working" },
      { id: "notes", module: "Notes", accent: "#76566B", secondary: "#347998", surface: "#F7F3F6", status: "working" },
      { id: "people", module: "People", accent: "#2F6F64", secondary: "#76566B", surface: "#F1F6F4", status: "working" },
      { id: "media", module: "Media", accent: "#8A5C4A", secondary: "#347998", surface: "#F8F3F0", status: "working" },
      { id: "personal", module: "Personal", accent: "#102026", secondary: "#2F6F64", surface: "#F4F7F6", status: "working" },
      { id: "reviews", module: "Reviews", accent: "#665A82", secondary: "#C47B19", surface: "#F5F3F8", status: "working" },
      { id: "resources", module: "Resources", accent: "#2F6B78", secondary: "#2F6F64", surface: "#F0F6F7", status: "working" },
      { id: "finance", module: "Finance", accent: "#7B6441", secondary: "#347998", surface: "#F7F4EE", status: "working" },
      { id: "vault", module: "Vault", accent: "#1F5A49", secondary: "#173B35", surface: "#E6F2ED", status: "working" }
    ],
    icons: ICON_REGISTRY.map((entry) => ({
      id: `icon-${entry.id}`,
      icon: entry.id,
      usage: entry.usages.map((item) => `${item.module} › ${item.breadcrumb}`).join(" · ")
    })),
    createdAt: "",
    updatedAt: ""
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown, field: string, maximum: number, required = false): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (required && !normalized) throw new Error(`${field} is required`);
  if (normalized.length > maximum) throw new Error(`${field} is too long`);
  return normalized;
}

function id(value: unknown, fallback: string): string {
  return text(value, "Token id", 80) || fallback;
}

function number(value: unknown, field: string, minimum: number, maximum: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < minimum || parsed > maximum) throw new Error(`${field} must be between ${minimum} and ${maximum}`);
  return parsed;
}

function color(value: unknown, field: string, fallback: string): string {
  const normalized = text(value, field, 7) || fallback;
  if (!HEX_COLOR.test(normalized)) throw new Error(`${field} must use a six-digit hex color`);
  return normalized.toUpperCase();
}

function typography(value: unknown): StyleGuideTypographyRole[] {
  if (!Array.isArray(value)) return defaultStyleGuideState().typography;
  return value.slice(0, 24).map((candidate, index) => {
    const item = isRecord(candidate) ? candidate : {};
    return {
      id: id(item.id, `type-${index + 1}`),
      label: text(item.label, `Typography ${index + 1} label`, 80, true),
      family: text(item.family, `Typography ${index + 1} family`, 120, true),
      size: number(item.size, `Typography ${index + 1} size`, 8, 96, 14),
      weight: number(item.weight, `Typography ${index + 1} weight`, 100, 900, 500),
      lineHeight: number(item.lineHeight, `Typography ${index + 1} line height`, 0.8, 2.4, 1.4),
      letterSpacing: number(item.letterSpacing, `Typography ${index + 1} tracking`, -0.1, 0.2, 0)
    };
  });
}

function colors(value: unknown, backfillDefaults = false): StyleGuideColorToken[] {
  if (!Array.isArray(value)) return defaultStyleGuideState().colors;
  const normalized = value.slice(0, 40).map((candidate, index) => {
    const item = isRecord(candidate) ? candidate : {};
    return {
      id: id(item.id, `color-${index + 1}`),
      label: text(item.label, `Color ${index + 1} label`, 80, true),
      value: color(item.value, `Color ${index + 1}`, "#102026"),
      usage: text(item.usage, `Color ${index + 1} usage`, 240)
    };
  });
  if (!backfillDefaults) return normalized;
  const existingIds = new Set(normalized.map((item) => item.id));
  return [...normalized, ...defaultStyleGuideState().colors.filter((item) => !existingIds.has(item.id))].slice(0, 40);
}

function modules(value: unknown): StyleGuideModulePalette[] {
  if (!Array.isArray(value)) return defaultStyleGuideState().modules;
  const defaults = defaultStyleGuideState().modules;
  const normalized = value.slice(0, 40).map((candidate, index) => {
    const item = isRecord(candidate) ? candidate : {};
    const rawId = id(item.id, `module-${index + 1}`);
    const moduleId = rawId === "personal-ops" ? "personal" : rawId;
    const fallback = defaults.find((entry) => entry.id === moduleId) || defaults[0];
    return {
      id: moduleId,
      module: moduleId === "personal" ? "Personal" : text(item.module, `Module ${index + 1}`, 80, true),
      accent: color(item.accent, `Module ${index + 1} primary`, fallback.accent),
      secondary: color(item.secondary, `Module ${index + 1} secondary`, fallback.secondary),
      surface: color(item.surface, `Module ${index + 1} surface`, fallback.surface),
      status: item.status === "figma_ready" ? "figma_ready" as const : "working" as const
    };
  });
  const byId = new Map(normalized.map((item) => [item.id, item]));
  return defaults.map((fallback) => byId.get(fallback.id) || fallback);
}

function icons(value: unknown): StyleGuideIconAssignment[] {
  const normalized = (Array.isArray(value) ? value : []).slice(0, 160).map((candidate, index) => {
    const item = isRecord(candidate) ? candidate : {};
    const rawIcon = text(item.icon, `Icon ${index + 1}`, 80, true);
    const icon = rawIcon === "username" ? "person" : rawIcon;
    const selection = text(item.selection, `Icon ${index + 1} selection`, 80);
    const resourceId = text(item.resourceId, `Icon ${index + 1} Resource`, 80);
    return {
      id: id(item.id, `icon-${icon || index + 1}`),
      icon,
      usage: text(item.usage, `Icon ${index + 1} usage`, 1000),
      ...(selection && isIconCandidate(icon, selection) ? { selection } : {}),
      ...(resourceId ? { resourceId } : {})
    };
  });
  const byIcon = new Map(normalized.map((item) => [item.icon, item]));
  return ICON_REGISTRY.map((entry) => byIcon.get(entry.id) || {
    id: `icon-${entry.id}`,
    icon: entry.id,
    usage: getIconEntry(entry.id).usages.map((item) => `${item.module} › ${item.breadcrumb}`).join(" · ")
  });
}

function normalize(value: unknown): StyleGuideState {
  const fallback = defaultStyleGuideState();
  if (!isRecord(value)) return fallback;
  const backfillDefaults = value.schemaVersion !== STYLE_GUIDE_SCHEMA_VERSION;
  return {
    schemaVersion: STYLE_GUIDE_SCHEMA_VERSION,
    id: "personal-style-guide",
    title: text(value.title, "Style guide title", 120) || fallback.title,
    description: text(value.description, "Style guide description", 500),
    typography: typography(value.typography),
    colors: colors(value.colors, backfillDefaults),
    modules: modules(value.modules),
    icons: icons(value.icons),
    createdAt: text(value.createdAt, "createdAt", 40),
    updatedAt: text(value.updatedAt, "updatedAt", 40)
  };
}

export async function readStyleGuideState(): Promise<StyleGuideState> {
  return normalize(await readJsonFile<unknown>(FILE_NAME, defaultStyleGuideState()));
}

export async function saveStyleGuideState(input: StyleGuideInput, expectedUpdatedAt: string): Promise<StyleGuideState> {
  return mutateJsonFile<unknown, StyleGuideState>(FILE_NAME, defaultStyleGuideState(), (raw) => {
    const current = normalize(raw);
    if (current.updatedAt && current.updatedAt !== expectedUpdatedAt) {
      throw new Error("This style guide changed after it was opened. Refresh and try again.");
    }
    const now = new Date().toISOString();
    const next = normalize({
      schemaVersion: STYLE_GUIDE_SCHEMA_VERSION,
      ...input,
      createdAt: current.createdAt || now,
      updatedAt: now
    });
    return { value: next, result: next };
  });
}

export async function selectStyleGuideIcon(role: string, selection: string, resourceId: string, expectedUpdatedAt: string): Promise<StyleGuideState> {
  return mutateJsonFile<unknown, StyleGuideState>(FILE_NAME, defaultStyleGuideState(), (raw) => {
    const current = normalize(raw);
    const currentAssignment = current.icons.find((item) => item.icon === role);
    if (currentAssignment?.selection === selection && currentAssignment.resourceId === resourceId) {
      return { value: current, result: current, changed: false };
    }
    if (current.updatedAt && current.updatedAt !== expectedUpdatedAt) {
      throw new Error("This style guide changed after it was opened. Refresh and try again.");
    }
    const now = new Date().toISOString();
    const next = normalize({
      ...current,
      icons: current.icons.map((item) => item.icon === role ? { ...item, selection, resourceId } : item),
      createdAt: current.createdAt || now,
      updatedAt: now
    });
    return { value: next, result: next };
  });
}
