"use client";

import UnigentamosIcon from "../icons/UnigentamosIcon";

export const PERSONAL_OPS_ICON_LIBRARY = [
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
  { name: "link", label: "Link" },
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
  { name: "check", label: "Complete" },
  { name: "star", label: "Star" },
  { name: "more", label: "More" },
  { name: "menu", label: "Menu" },
  { name: "chevron-down", label: "Expand" },
  { name: "archive", label: "Archive" },
  { name: "review", label: "Review" },
  { name: "run", label: "Run" },
  { name: "timeline", label: "Timeline" },
  { name: "resource", label: "Resource" }
] as const;

export type PersonalOpsIconName = (typeof PERSONAL_OPS_ICON_LIBRARY)[number]["name"];

const ICON_ROLE: Readonly<Record<PersonalOpsIconName, string>> = Object.fromEntries(
  PERSONAL_OPS_ICON_LIBRARY.map((item) => [item.name, item.name === "username" ? "person" : item.name])
) as Record<PersonalOpsIconName, string>;

export default function PersonalOpsIcon({ name, className }: { name: PersonalOpsIconName; className?: string }) {
  return <UnigentamosIcon role={ICON_ROLE[name]} className={className} />;
}
