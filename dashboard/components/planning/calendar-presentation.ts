import type { Calendar, EventOccurrence } from "../../lib/modules/planning/types";
import { eventGroup } from "../../lib/modules/planning/calendar-groups";
import { MODULE_COLOR_SYSTEM } from "../../lib/design-system/color-system";

export function calendarDisplayColor(color?: string) {
  return !color || color.toLowerCase() === "#565b86" ? MODULE_COLOR_SYSTEM.calendar.tokens.icon : color;
}

/** Calendar identity stays on the outline; the category owns the fill. */
export function eventColors(item: EventOccurrence, calendar?: Calendar) {
  const outline = item.system?.color || calendarDisplayColor(calendar?.color);
  return { "--event-outline": outline, "--event-color": item.system?.color || eventGroup(calendar, item.groupId)?.color || outline };
}

export function eventPreviewTitle(item: EventOccurrence) {
  return item.system?.kind === "birthday" ? item.ownerRef?.label || item.title.replace(/[’']s birthday$/, "") : item.title;
}
