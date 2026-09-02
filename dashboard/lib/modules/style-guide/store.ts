import { mutateJsonFile, readJsonFile } from "../../file-store";
import {
  MODULE_COLOR_SYSTEM,
  NAVY_SCALE,
  PRIMARY_SCALE_STEPS,
  SECONDARY_SCALE_STEPS,
  SYSTEM_COLOR_TOKENS,
  type ModuleColorId
} from "../../design-system/color-system";
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

function approvedModulePalettes(): StyleGuideModulePalette[] {
  return (Object.keys(MODULE_COLOR_SYSTEM) as ModuleColorId[]).map((moduleId) => {
    const definition = MODULE_COLOR_SYSTEM[moduleId];
    return {
      id: moduleId === "personal_ops" ? "personal" : moduleId,
      module: definition.label,
      primaryName: definition.primaryName,
      hue: definition.hue,
      secondaryName: definition.secondaryName,
      accent: definition.tokens.action,
      secondary: definition.tokens.accent,
      surface: definition.tokens.quiet,
      primaryScale: PRIMARY_SCALE_STEPS.map((step) => ({ step, value: definition.primary[step] })),
      secondaryScale: SECONDARY_SCALE_STEPS.map((step) => ({ step, value: definition.secondary[step] })),
      tokens: { ...definition.tokens },
      status: "approved" as const
    };
  });
}

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
      ...SYSTEM_COLOR_TOKENS.map((token) => ({ ...token })),
      ...PRIMARY_SCALE_STEPS.map((step) => ({
        id: `navy-${step}`,
        label: `Navy ${step}`,
        value: NAVY_SCALE[step],
        usage: step === 600
          ? "Shared primary action and high-emphasis interface color"
          : step === 500
            ? "Shared links and informational icon color"
            : step === 700
              ? "Shared primary action hover"
              : step === 800
                ? "Shared primary action pressed"
                : step === 50
                  ? "Shared Navy selected and quiet surface"
                  : "Shared Navy scale"
      }))
    ],
    modules: approvedModulePalettes(),
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

function colors(value: unknown, useApprovedDefaults = false): StyleGuideColorToken[] {
  if (useApprovedDefaults) return defaultStyleGuideState().colors;
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
  return normalized;
}

function modules(value: unknown, useApprovedDefaults = false): StyleGuideModulePalette[] {
  if (useApprovedDefaults) return defaultStyleGuideState().modules;
  if (!Array.isArray(value)) return defaultStyleGuideState().modules;
  const defaults = defaultStyleGuideState().modules;
  const normalized = value.slice(0, 40).map((candidate, index) => {
    const item = isRecord(candidate) ? candidate : {};
    const rawId = id(item.id, `module-${index + 1}`);
    const moduleId = rawId === "personal-ops" ? "personal" : rawId;
    const fallback = defaults.find((entry) => entry.id === moduleId) || defaults[0];
    const rawPrimaryScale = Array.isArray(item.primaryScale) ? item.primaryScale : fallback.primaryScale;
    const rawSecondaryScale = Array.isArray(item.secondaryScale) ? item.secondaryScale : fallback.secondaryScale;
    const rawTokens = isRecord(item.tokens) ? item.tokens : fallback.tokens;
    return {
      id: moduleId,
      module: moduleId === "personal" ? "Personal" : text(item.module, `Module ${index + 1}`, 80, true),
      primaryName: text(item.primaryName, `Module ${index + 1} primary name`, 80) || fallback.primaryName,
      hue: text(item.hue, `Module ${index + 1} hue`, 80) || fallback.hue,
      secondaryName: text(item.secondaryName, `Module ${index + 1} secondary name`, 80) || fallback.secondaryName,
      accent: color(item.accent, `Module ${index + 1} primary`, fallback.accent),
      secondary: color(item.secondary, `Module ${index + 1} secondary`, fallback.secondary),
      surface: color(item.surface, `Module ${index + 1} surface`, fallback.surface),
      primaryScale: rawPrimaryScale.slice(0, 10).map((candidate, scaleIndex) => {
        const stop = isRecord(candidate) ? candidate : {};
        const fallbackStop = fallback.primaryScale[scaleIndex] || fallback.primaryScale[0];
        return {
          step: number(stop.step, `Module ${index + 1} primary step`, 0, 1000, fallbackStop.step),
          value: color(stop.value, `Module ${index + 1} primary scale`, fallbackStop.value)
        };
      }),
      secondaryScale: rawSecondaryScale.slice(0, 3).map((candidate, scaleIndex) => {
        const stop = isRecord(candidate) ? candidate : {};
        const fallbackStop = fallback.secondaryScale[scaleIndex] || fallback.secondaryScale[0];
        return {
          step: number(stop.step, `Module ${index + 1} secondary step`, 0, 1000, fallbackStop.step),
          value: color(stop.value, `Module ${index + 1} secondary scale`, fallbackStop.value)
        };
      }),
      tokens: {
        action: color(rawTokens.action, `Module ${index + 1} action`, fallback.tokens.action),
        actionHover: color(rawTokens.actionHover, `Module ${index + 1} action hover`, fallback.tokens.actionHover),
        actionPressed: color(rawTokens.actionPressed, `Module ${index + 1} action pressed`, fallback.tokens.actionPressed),
        selected: color(rawTokens.selected, `Module ${index + 1} selected`, fallback.tokens.selected),
        quiet: color(rawTokens.quiet, `Module ${index + 1} quiet`, fallback.tokens.quiet),
        border: color(rawTokens.border, `Module ${index + 1} border`, fallback.tokens.border),
        icon: color(rawTokens.icon, `Module ${index + 1} icon`, fallback.tokens.icon),
        textOnPrimary: color(rawTokens.textOnPrimary, `Module ${index + 1} text on primary`, fallback.tokens.textOnPrimary),
        focus: color(rawTokens.focus, `Module ${index + 1} focus`, fallback.tokens.focus),
        accent: color(rawTokens.accent, `Module ${index + 1} accent`, fallback.tokens.accent)
      },
      status: "approved" as const
    };
  });
  const byId = new Map(normalized.map((item) => [item.id, item]));
  return defaults.map((fallback) => byId.get(fallback.id) || fallback);
}

function icons(value: unknown, refreshUsage = false): StyleGuideIconAssignment[] {
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
  return ICON_REGISTRY.map((entry) => {
    const existing = byIcon.get(entry.id);
    return {
      ...(existing || { id: `icon-${entry.id}`, icon: entry.id }),
      usage: refreshUsage || !existing
        ? getIconEntry(entry.id).usages.map((item) => `${item.module} › ${item.breadcrumb}`).join(" · ")
        : existing.usage
    };
  });
}

function normalize(value: unknown): StyleGuideState {
  const fallback = defaultStyleGuideState();
  if (!isRecord(value)) return fallback;
  const storedModules = Array.isArray(value.modules) ? value.modules : [];
  const hasApprovedColorSystem = storedModules.length === 9
    && storedModules.every((candidate) => isRecord(candidate)
      && candidate.status === "approved"
      && Array.isArray(candidate.primaryScale)
      && candidate.primaryScale.length === 10
      && Array.isArray(candidate.secondaryScale)
      && candidate.secondaryScale.length === 3
      && isRecord(candidate.tokens));
  const backfillDefaults = value.schemaVersion !== STYLE_GUIDE_SCHEMA_VERSION || !hasApprovedColorSystem;
  return {
    schemaVersion: STYLE_GUIDE_SCHEMA_VERSION,
    id: "personal-style-guide",
    title: text(value.title, "Style guide title", 120) || fallback.title,
    description: text(value.description, "Style guide description", 500),
    typography: typography(value.typography),
    colors: colors(value.colors, backfillDefaults),
    modules: modules(value.modules, backfillDefaults),
    icons: icons(value.icons, value.schemaVersion !== STYLE_GUIDE_SCHEMA_VERSION),
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
