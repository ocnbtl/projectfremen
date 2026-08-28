import { mutateJsonFile, readJsonFile } from "../../file-store";
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
      { id: "eucalyptus", label: "Eucalyptus", value: "#2F6F64", usage: "Brand and selected state" },
      { id: "paper", label: "Paper", value: "#FBFCFB", usage: "Primary surface" },
      { id: "slate", label: "Slate", value: "#64777E", usage: "Supporting text" },
      { id: "amber", label: "Amber", value: "#C47B19", usage: "Attention and upcoming work" },
      { id: "crimson", label: "Crimson", value: "#B73343", usage: "Destructive and urgent" }
    ],
    modules: [
      { id: "people", module: "People", accent: "#2F6F64", surface: "#F1F6F4" },
      { id: "projects", module: "Projects", accent: "#516B83", surface: "#F1F4F7" },
      { id: "personal-ops", module: "Personal Ops", accent: "#102026", surface: "#F4F7F6" },
      { id: "finance", module: "Finance", accent: "#7B6441", surface: "#F7F4EE" }
    ],
    icons: [],
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

function colors(value: unknown): StyleGuideColorToken[] {
  if (!Array.isArray(value)) return defaultStyleGuideState().colors;
  return value.slice(0, 40).map((candidate, index) => {
    const item = isRecord(candidate) ? candidate : {};
    return {
      id: id(item.id, `color-${index + 1}`),
      label: text(item.label, `Color ${index + 1} label`, 80, true),
      value: color(item.value, `Color ${index + 1}`, "#102026"),
      usage: text(item.usage, `Color ${index + 1} usage`, 240)
    };
  });
}

function modules(value: unknown): StyleGuideModulePalette[] {
  if (!Array.isArray(value)) return defaultStyleGuideState().modules;
  return value.slice(0, 40).map((candidate, index) => {
    const item = isRecord(candidate) ? candidate : {};
    return {
      id: id(item.id, `module-${index + 1}`),
      module: text(item.module, `Module ${index + 1}`, 80, true),
      accent: color(item.accent, `Module ${index + 1} accent`, "#2F6F64"),
      surface: color(item.surface, `Module ${index + 1} surface`, "#F4F7F6")
    };
  });
}

function icons(value: unknown): StyleGuideIconAssignment[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 80).map((candidate, index) => {
    const item = isRecord(candidate) ? candidate : {};
    return {
      id: id(item.id, `icon-${index + 1}`),
      icon: text(item.icon, `Icon ${index + 1}`, 80, true),
      usage: text(item.usage, `Icon ${index + 1} usage`, 240)
    };
  });
}

function normalize(value: unknown): StyleGuideState {
  const fallback = defaultStyleGuideState();
  if (!isRecord(value)) return fallback;
  return {
    schemaVersion: STYLE_GUIDE_SCHEMA_VERSION,
    id: "personal-style-guide",
    title: text(value.title, "Style guide title", 120) || fallback.title,
    description: text(value.description, "Style guide description", 500),
    typography: typography(value.typography),
    colors: colors(value.colors),
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
      ...input,
      createdAt: current.createdAt || now,
      updatedAt: now
    });
    return { value: next, result: next };
  });
}
