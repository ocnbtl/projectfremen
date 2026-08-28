export type PersonalOpsIconName =
  | "today"
  | "week"
  | "goal"
  | "follow-up"
  | "decision"
  | "routine"
  | "password"
  | "list"
  | "travel"
  | "build"
  | "car"
  | "style-guide"
  | "dog"
  | "sort"
  | "font"
  | "palette"
  | "component"
  | "motion"
  | "walk"
  | "feed"
  | "droplet"
  | "copy"
  | "edit"
  | "delete"
  | "plus"
  | "username"
  | "email"
  | "website"
  | "phone"
  | "pin"
  | "search"
  | "filter"
  | "show"
  | "hide"
  | "close"
  | "add-column"
  | "open"
  | "person"
  | "object"
  | "check";

export const PERSONAL_OPS_ICON_LIBRARY: ReadonlyArray<{ name: PersonalOpsIconName; label: string }> = [
  { name: "today", label: "Today" },
  { name: "week", label: "Week" },
  { name: "goal", label: "Goal" },
  { name: "follow-up", label: "Follow-up" },
  { name: "decision", label: "Decision" },
  { name: "routine", label: "Routine" },
  { name: "password", label: "Password" },
  { name: "list", label: "List" },
  { name: "travel", label: "Travel" },
  { name: "build", label: "Personal build" },
  { name: "car", label: "Car" },
  { name: "style-guide", label: "Style guide" },
  { name: "dog", label: "Dog" },
  { name: "sort", label: "Sort" },
  { name: "font", label: "Typography" },
  { name: "palette", label: "Color" },
  { name: "component", label: "Component" },
  { name: "motion", label: "Motion" },
  { name: "walk", label: "Walk" },
  { name: "feed", label: "Feed" },
  { name: "droplet", label: "Bathroom" },
  { name: "copy", label: "Copy" },
  { name: "edit", label: "Edit" },
  { name: "delete", label: "Delete" },
  { name: "plus", label: "Add" },
  { name: "username", label: "Person" },
  { name: "email", label: "Email" },
  { name: "website", label: "Website" },
  { name: "phone", label: "Phone" },
  { name: "pin", label: "PIN" },
  { name: "search", label: "Search" },
  { name: "filter", label: "Filter" },
  { name: "show", label: "Show" },
  { name: "hide", label: "Hide" },
  { name: "close", label: "Close" },
  { name: "add-column", label: "Add column" },
  { name: "open", label: "Open" },
  { name: "person", label: "Person" },
  { name: "object", label: "Object" },
  { name: "check", label: "Complete" }
];

export default function PersonalOpsIcon({ name, className }: { name: PersonalOpsIconName; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true
  };

  if (name === "today") return <svg {...common}><path d="M7 3v3m10-3v3M4.5 9h15" /><rect x="4.5" y="5" width="15" height="15" rx="2.5" /><path d="m8.5 14 2 2 4.5-5" /></svg>;
  if (name === "week") return <svg {...common}><path d="M7 3v3m10-3v3M4.5 9h15" /><rect x="4.5" y="5" width="15" height="15" rx="2.5" /><path d="M8 13h3m2 0h3m-8 3h3m2 0h3" /></svg>;
  if (name === "goal") return <svg {...common}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></svg>;
  if (name === "follow-up") return <svg {...common}><path d="M5 6.5h7a6 6 0 0 1 6 6V18m0 0-3.5-3.5M18 18l3.5-3.5" /></svg>;
  if (name === "decision") return <svg {...common}><path d="m12 3 8 9-8 9-8-9 8-9Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></svg>;
  if (name === "routine") return <svg {...common}><path d="M19 7V3m0 0h-4m4 0-3.2 3.2a7.5 7.5 0 1 0 1.4 10.2" /></svg>;
  if (name === "password") return <svg {...common}><circle cx="8.5" cy="12" r="4" /><path d="M12.5 12H21m-3 0v3m-3-3v2" /></svg>;
  if (name === "list") return <svg {...common}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r=".8" fill="currentColor" stroke="none" /><circle cx="4.5" cy="12" r=".8" fill="currentColor" stroke="none" /><circle cx="4.5" cy="18" r=".8" fill="currentColor" stroke="none" /></svg>;
  if (name === "travel") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>;
  if (name === "build") return <svg {...common}><path d="m12 3 8 4-8 4-8-4 8-4Z" /><path d="m4 12 8 4 8-4M4 17l8 4 8-4" /></svg>;
  if (name === "car") return <svg {...common}><path d="m5 16-1.5-1.5V11l2-5h13l2 5v3.5L19 16" /><path d="M5 11h14M7 16v2m10-2v2" /><circle cx="7" cy="14" r="1" /><circle cx="17" cy="14" r="1" /></svg>;
  if (name === "style-guide") return <svg {...common}><path d="M5 5h14M5 12h14M5 19h14" /><circle cx="9" cy="5" r="2" fill="var(--icon-fill, #fff)" /><circle cx="15" cy="12" r="2" fill="var(--icon-fill, #fff)" /><circle cx="11" cy="19" r="2" fill="var(--icon-fill, #fff)" /></svg>;
  if (name === "dog") return <svg {...common}><circle cx="8" cy="7" r="2" /><circle cx="16" cy="7" r="2" /><circle cx="5" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /><path d="M8 18.3c0-2.6 1.8-4.8 4-4.8s4 2.2 4 4.8c0 1.7-1.3 2.7-4 2.7s-4-1-4-2.7Z" /></svg>;
  if (name === "sort") return <svg {...common}><path d="M8 4v16m0-16L5 7m3-3 3 3M16 20V4m0 16-3-3m3 3 3-3" /></svg>;
  if (name === "font") return <svg {...common}><path d="M5 19 10.5 5h3L19 19M7 14h10" /></svg>;
  if (name === "palette") return <svg {...common}><path d="M12 3a9 9 0 1 0 0 18h1.5a1.8 1.8 0 0 0 0-3.6H12a1.8 1.8 0 0 1 0-3.6h3.4A5.6 5.6 0 0 0 21 8.2C21 5.3 17 3 12 3Z" /><circle cx="7.5" cy="9" r=".8" fill="currentColor" stroke="none" /><circle cx="11" cy="6.5" r=".8" fill="currentColor" stroke="none" /><circle cx="15.5" cy="7.5" r=".8" fill="currentColor" stroke="none" /></svg>;
  if (name === "component") return <svg {...common}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><path d="M16.5 14v5M14 16.5h5" /></svg>;
  if (name === "motion") return <svg {...common}><path d="M3 12c2.2-5 4.3-5 6.5 0s4.3 5 6.5 0 4.2-5 5.5-1" /></svg>;
  if (name === "walk") return <svg {...common}><circle cx="13" cy="4.5" r="2" /><path d="m11 8-2.5 4 3 2 1.5 6M11 8l4 3 3-1M8.5 12 5 17m6.5-3 4 3" /></svg>;
  if (name === "feed") return <svg {...common}><path d="M4 14h16l-2 6H6l-2-6Z" /><path d="M8 10c0-1.2 1-2.2 2.2-2.2M12 10c0-1.7 1.3-3 3-3" /></svg>;
  if (name === "droplet") return <svg {...common}><path d="M12 3S6.5 9.3 6.5 14a5.5 5.5 0 0 0 11 0C17.5 9.3 12 3 12 3Z" /></svg>;
  if (name === "copy") return <svg {...common}><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
  if (name === "edit") return <svg {...common}><path d="M13.5 6.5 17.5 10.5M5 19l3.2-.7L19 7.5a2.1 2.1 0 0 0-3-3L5.3 15.3 5 19Z" /></svg>;
  if (name === "delete") return <svg {...common}><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" /><path d="M10 11v5M14 11v5" /></svg>;
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === "username") return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg>;
  if (name === "email") return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>;
  if (name === "website") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>;
  if (name === "phone") return <svg {...common}><path d="M7 3.5 4.5 6c.8 6.8 6.7 12.7 13.5 13.5l2.5-2.5-4-3-2 2c-2.7-1.1-5.4-3.8-6.5-6.5l2-2z" /></svg>;
  if (name === "pin") return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="8" cy="8" r=".8" fill="currentColor" stroke="none" /><circle cx="12" cy="8" r=".8" fill="currentColor" stroke="none" /><circle cx="16" cy="8" r=".8" fill="currentColor" stroke="none" /><circle cx="8" cy="12" r=".8" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r=".8" fill="currentColor" stroke="none" /><circle cx="16" cy="12" r=".8" fill="currentColor" stroke="none" /><circle cx="8" cy="16" r=".8" fill="currentColor" stroke="none" /><circle cx="12" cy="16" r=".8" fill="currentColor" stroke="none" /></svg>;
  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>;
  if (name === "filter") return <svg {...common}><path d="M4 6h16M7 12h10M10 18h4" /></svg>;
  if (name === "show") return <svg {...common}><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.8" /></svg>;
  if (name === "hide") return <svg {...common}><path d="m3 3 18 18M10.6 6.1A10 10 0 0 1 12 6c6.1 0 9.5 6 9.5 6a15 15 0 0 1-2.1 2.8M6.6 6.7A15.2 15.2 0 0 0 2.5 12s3.4 6 9.5 6a9.8 9.8 0 0 0 3.3-.6M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>;
  if (name === "close") return <svg {...common}><path d="M6 6l12 12M18 6 6 18" /></svg>;
  if (name === "add-column") return <svg {...common}><rect x="3" y="5" width="13" height="14" rx="2" /><path d="M9.5 5v14M19 9v6m-3-3h6" /></svg>;
  if (name === "open") return <svg {...common}><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></svg>;
  if (name === "person") return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg>;
  if (name === "object") return <svg {...common}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.8 7.5 4.3 7.5-4.3M12 12v9" /></svg>;
  return <svg {...common}><path d="m5 12 4.2 4.2L19 6.5" /></svg>;
}
