export const settingsPages = {
  account: {
    title: "Account and devices",
    icon: "person",
    description: "Manage sign-in, sessions, and recovery.",
  },
  sharing: {
    title: "Workspace sharing",
    icon: "share",
    description: "Manage members, access, and shared records.",
  },
  writing: {
    title: "Writing",
    icon: "edit",
    description: "Link objects, use shortcuts, and manage your writing skills.",
  },
  regional: {
    title: "Language and region",
    icon: "clock",
    description: "Choose date and time formats, your week start, and your home time zone.",
  },
  notifications: {
    title: "Notifications",
    icon: "reminder",
    description: "Choose which reminders interrupt you and when shared updates appear.",
  },
  planning: {
    title: "Calendar and tasks",
    icon: "calendar",
    description: "Choose capture defaults, reminder times, and calendar connections.",
  },
  appearance: {
    title: "Accessibility",
    icon: "sliders",
    description: "Adjust reading size, contrast, motion, and keyboard focus.",
  },
  navigation: {
    title: "Home and navigation",
    icon: "home",
    description: "Pick your landing page and pin modules for each screen size.",
  },
  search: {
    title: "Search",
    icon: "search",
    description: "Choose which Vault records to search and whether to remember a query.",
  },
  "calendar-map": {
    title: "Calendar and Map",
    icon: "location",
    description: "Choose which event details and map pins you see.",
  },
  backup: {
    title: "Backup and restore",
    icon: "download",
    description: "Export workspace records and review recovery options.",
  },
  "device-data": {
    title: "Files and offline access",
    icon: "module-media",
    description: "Manage photo privacy, local availability, and sync health.",
  },
} as const;
export type SettingsSection = keyof typeof settingsPages;
export function isSettingsSection(value: string): value is SettingsSection {
  return Object.hasOwn(settingsPages, value);
}
