export const STYLE_GUIDE_SCHEMA_VERSION = 5 as const;

export type StyleGuideScaleStop = {
  step: number;
  value: string;
};

export type StyleGuideModuleTokens = {
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

export type StyleGuideTypographyRole = {
  id: string;
  label: string;
  family: string;
  size: number;
  weight: number;
  lineHeight: number;
  letterSpacing: number;
};

export type StyleGuideColorToken = {
  id: string;
  label: string;
  value: string;
  usage: string;
};

export type StyleGuideModulePalette = {
  id: string;
  module: string;
  primaryName: string;
  hue: string;
  secondaryName: string;
  accent: string;
  secondary: string;
  surface: string;
  primaryScale: StyleGuideScaleStop[];
  secondaryScale: StyleGuideScaleStop[];
  tokens: StyleGuideModuleTokens;
  status: "approved";
};

export type StyleGuideIconAssignment = {
  id: string;
  icon: string;
  usage: string;
  selection?: string;
  resourceId?: string;
};

export type StyleGuideState = {
  schemaVersion: typeof STYLE_GUIDE_SCHEMA_VERSION;
  id: "personal-style-guide";
  title: string;
  description: string;
  typography: StyleGuideTypographyRole[];
  colors: StyleGuideColorToken[];
  modules: StyleGuideModulePalette[];
  icons: StyleGuideIconAssignment[];
  createdAt: string;
  updatedAt: string;
};

export type StyleGuideInput = Pick<
  StyleGuideState,
  "title" | "description" | "typography" | "colors" | "modules" | "icons"
>;
