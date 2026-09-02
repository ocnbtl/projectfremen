import type { ModuleId } from "../native-objects/types";

export const SYSTEM_COLOR_TOKENS = [
  { id: "ink", label: "Ink", value: "#102026", usage: "Primary text and high-emphasis interface copy" },
  { id: "text", label: "Text", value: "#23383F", usage: "Default body text" },
  { id: "muted", label: "Muted", value: "#60747C", usage: "Secondary labels and supporting text" },
  { id: "faint", label: "Faint", value: "#7C8E95", usage: "Placeholder and unavailable states" },
  { id: "canvas", label: "Canvas", value: "#F4F7F5", usage: "Application background" },
  { id: "canvas-alt", label: "Canvas alternate", value: "#F6F8F7", usage: "Directory and secondary workspace background" },
  { id: "panel", label: "Panel", value: "#FFFFFF", usage: "Cards, sheets, and controls" },
  { id: "paper", label: "Paper", value: "#FBFCFB", usage: "Quiet inset surface" },
  { id: "border", label: "Border", value: "#D5E2E7", usage: "Default dividers and outlines" },
  { id: "border-strong", label: "Border strong", value: "#BFD2DB", usage: "Interactive control outlines" },
  { id: "selected", label: "Selected", value: "#F7FBFF", usage: "System-level selected rows and focused navigation" }
] as const;

export const NAVY_SCALE = {
  50: "#EBF2F9",
  100: "#C4D9EE",
  200: "#90BCE0",
  300: "#5E9FD2",
  400: "#3482C4",
  500: "#1D65A0",
  600: "#133C5E",
  700: "#0C2B44",
  800: "#071A2C",
  900: "#030D16"
} as const;

export const PRIMARY_SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export const SECONDARY_SCALE_STEPS = [100, 500, 700] as const;

export type PrimaryScaleStep = (typeof PRIMARY_SCALE_STEPS)[number];
export type SecondaryScaleStep = (typeof SECONDARY_SCALE_STEPS)[number];
export type ModuleColorId = ModuleId | "vault";

export type ModuleColorDefinition = {
  id: ModuleColorId;
  label: string;
  primaryName: string;
  hue: string;
  secondaryName: string;
  primary: Record<PrimaryScaleStep, string>;
  secondary: Record<SecondaryScaleStep, string>;
  tokens: {
    action: string;
    actionHover: string;
    actionPressed: string;
    selected: string;
    quiet: string;
    border: string;
    icon: string;
    textOnPrimary: string;
    focus: string;
    accent: string;
  };
};

export const MODULE_COLOR_SYSTEM: Record<ModuleColorId, ModuleColorDefinition> = {
  projects: {
    id: "projects", label: "Projects", primaryName: "Chestnut Brown", hue: "H22°", secondaryName: "Warm Slate",
    primary: { 50: "#F8F4F0", 100: "#EFE0CE", 200: "#DFBF9E", 300: "#CE9D6E", 400: "#BC7D48", 500: "#9A5E28", 600: "#754420", 700: "#533012", 800: "#321D08", 900: "#190E04" },
    secondary: { 100: "#EAE6E0", 500: "#8A7F70", 700: "#5E5650" },
    tokens: { action: "#754420", actionHover: "#533012", actionPressed: "#321D08", selected: "#F8F4F0", quiet: "#F8F4F0", border: "#DFBF9E", icon: "#9A5E28", textOnPrimary: "#FFFFFF", focus: "#BC7D48", accent: "#8A7F70" }
  },
  notes: {
    id: "notes", label: "Notes", primaryName: "Thoughtful Purple", hue: "H275°", secondaryName: "Warm Gold",
    primary: { 50: "#F6F0FC", 100: "#E8D5F8", 200: "#D0AAF0", 300: "#B880E8", 400: "#A058D8", 500: "#7C32B4", 600: "#5E2288", 700: "#43186A", 800: "#2A1042", 900: "#160820" },
    secondary: { 100: "#F5EDD0", 500: "#C4A050", 700: "#8A6C30" },
    tokens: { action: "#5E2288", actionHover: "#43186A", actionPressed: "#2A1042", selected: "#F6F0FC", quiet: "#F6F0FC", border: "#D0AAF0", icon: "#7C32B4", textOnPrimary: "#FFFFFF", focus: "#A058D8", accent: "#C4A050" }
  },
  people: {
    id: "people", label: "People", primaryName: "Warm Orange", hue: "H32°", secondaryName: "Warm Olive",
    primary: { 50: "#FFF5ED", 100: "#FFE0C0", 200: "#FFBB80", 300: "#FF9040", 400: "#E87020", 500: "#C45010", 600: "#963A08", 700: "#6E2804", 800: "#441802", 900: "#220C01" },
    secondary: { 100: "#E4E8D8", 500: "#8A9060", 700: "#5A6040" },
    tokens: { action: "#963A08", actionHover: "#6E2804", actionPressed: "#441802", selected: "#FFF5ED", quiet: "#FFF5ED", border: "#FFBB80", icon: "#963A08", textOnPrimary: "#FFFFFF", focus: "#E87020", accent: "#8A9060" }
  },
  media: {
    id: "media", label: "Media", primaryName: "Signal Red", hue: "H4°", secondaryName: "Warm Sand",
    primary: { 50: "#FFF1F0", 100: "#FFE0DD", 200: "#FFC3BD", 300: "#FF9B91", 400: "#F5675B", 500: "#D94336", 600: "#B42318", 700: "#8F1D14", 800: "#5F1711", 900: "#300B08" },
    secondary: { 100: "#EDE4D8", 500: "#B09470", 700: "#7C6448" },
    tokens: { action: "#B42318", actionHover: "#8F1D14", actionPressed: "#5F1711", selected: "#FFF1F0", quiet: "#FFF1F0", border: "#FFC3BD", icon: "#B42318", textOnPrimary: "#FFFFFF", focus: "#F5675B", accent: "#B09470" }
  },
  personal_ops: {
    id: "personal_ops", label: "Personal", primaryName: "Personal Blue", hue: "H216°", secondaryName: "Blue-Gray Slate",
    primary: { 50: "#ECF4FD", 100: "#C8DFF8", 200: "#92C0F2", 300: "#5CA2EC", 400: "#3386E2", 500: "#2068C0", 600: "#1850A0", 700: "#103880", 800: "#0A2458", 900: "#051230" },
    secondary: { 100: "#E0E4EC", 500: "#788090", 700: "#506070" },
    tokens: { action: "#1850A0", actionHover: "#103880", actionPressed: "#0A2458", selected: "#ECF4FD", quiet: "#ECF4FD", border: "#92C0F2", icon: "#2068C0", textOnPrimary: "#FFFFFF", focus: "#3386E2", accent: "#788090" }
  },
  reviews: {
    id: "reviews", label: "Reviews", primaryName: "Golden Yellow", hue: "H44°", secondaryName: "Warm Rose",
    primary: { 50: "#FEFCE6", 100: "#FDF8B4", 200: "#FAEE76", 300: "#F0D038", 400: "#D4A810", 500: "#A87C00", 600: "#7E6000", 700: "#5A4400", 800: "#382800", 900: "#1C1500" },
    secondary: { 100: "#F5E8E8", 500: "#C07878", 700: "#8A5050" },
    tokens: { action: "#F0D038", actionHover: "#D4A810", actionPressed: "#A87C00", selected: "#FEFCE6", quiet: "#FEFCE6", border: "#FAEE76", icon: "#7E6000", textOnPrimary: "#102026", focus: "#D4A810", accent: "#C07878" }
  },
  resources: {
    id: "resources", label: "Resources", primaryName: "Refined Rose-Pink", hue: "H335°", secondaryName: "Rose-Gray",
    primary: { 50: "#FBF0F4", 100: "#F5D0DC", 200: "#EAA2BE", 300: "#DC74A0", 400: "#C84882", 500: "#A82868", 600: "#821850", 700: "#5E1038", 800: "#3C0A24", 900: "#1E0512" },
    secondary: { 100: "#F0E8EC", 500: "#A08898", 700: "#6C5868" },
    tokens: { action: "#821850", actionHover: "#5E1038", actionPressed: "#3C0A24", selected: "#FBF0F4", quiet: "#FBF0F4", border: "#EAA2BE", icon: "#A82868", textOnPrimary: "#FFFFFF", focus: "#C84882", accent: "#A08898" }
  },
  finance: {
    id: "finance", label: "Finance", primaryName: "Jade Emerald", hue: "H152°", secondaryName: "Warm Bronze",
    primary: { 50: "#E8F5EE", 100: "#C0E6D2", 200: "#80CCA8", 300: "#42B27E", 400: "#1A9660", 500: "#0E7848", 600: "#0A5A36", 700: "#063E24", 800: "#042618", 900: "#02140C" },
    secondary: { 100: "#EEE8CC", 500: "#9A7840", 700: "#6A5228" },
    tokens: { action: "#0A5A36", actionHover: "#063E24", actionPressed: "#042618", selected: "#E8F5EE", quiet: "#E8F5EE", border: "#80CCA8", icon: "#0E7848", textOnPrimary: "#FFFFFF", focus: "#1A9660", accent: "#9A7840" }
  },
  vault: {
    id: "vault", label: "Vault", primaryName: "Warm Graphite", hue: "H30° · minimal saturation", secondaryName: "Steel Blue",
    primary: { 50: "#F3F2F0", 100: "#E2E0DC", 200: "#C2C0BC", 300: "#A2A09C", 400: "#82807C", 500: "#60605A", 600: "#3E3C38", 700: "#282624", 800: "#181614", 900: "#0C0A0A" },
    secondary: { 100: "#DCE4EC", 500: "#6880A0", 700: "#486080" },
    tokens: { action: "#3E3C38", actionHover: "#282624", actionPressed: "#181614", selected: "#F3F2F0", quiet: "#F3F2F0", border: "#C2C0BC", icon: "#3E3C38", textOnPrimary: "#FFFFFF", focus: "#82807C", accent: "#6880A0" }
  }
};

export function moduleColorIdForPathname(pathname: string): ModuleColorId | null {
  if (pathname.startsWith("/vault")) return "vault";
  if (pathname.startsWith("/admin/personal")) return "personal_ops";
  const match = pathname.match(/^\/admin\/(projects|notes|people|media|reviews|resources|finance)(?:\/|$)/);
  return (match?.[1] as ModuleColorId | undefined) || null;
}

export function moduleThemeVariables(module: ModuleColorId): Record<string, string> {
  const definition = MODULE_COLOR_SYSTEM[module];
  const variables: Record<string, string> = {
    "--action-primary": definition.tokens.action,
    "--action-primary-hover": definition.tokens.actionHover,
    "--action-primary-pressed": definition.tokens.actionPressed,
    "--action-primary-contrast": definition.tokens.textOnPrimary,
    "--selected-bg": definition.tokens.selected,
    "--module-quiet": definition.tokens.quiet,
    "--module-border": definition.tokens.border,
    "--module-icon": definition.tokens.icon,
    "--module-focus": definition.tokens.focus,
    "--module-accent": definition.tokens.accent,
    "--brand": definition.tokens.action,
    "--brand-soft": definition.tokens.quiet
  };

  for (const step of PRIMARY_SCALE_STEPS) variables[`--module-primary-${step}`] = definition.primary[step];
  for (const step of SECONDARY_SCALE_STEPS) variables[`--module-secondary-${step}`] = definition.secondary[step];
  return variables;
}
