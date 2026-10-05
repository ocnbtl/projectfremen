import type { Calendar, EventOccurrence } from "../../lib/modules/planning/types";
import { eventGroup } from "../../lib/modules/planning/calendar-groups";
import { MODULE_COLOR_SYSTEM } from "../../lib/design-system/color-system";

/** Keep event previews consistent across browser locales and calendar time zones. */
export function eventTimeLabel(ms: number, zone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(ms);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)?.value;
  const minute = part("minute");
  return `${part("hour")}${minute === "00" ? "" : `:${minute}`} ${part("dayPeriod") === "AM" ? "am" : "pm"}`;
}

export function eventTimeRange(startMs: number, endMs: number, zone: string) {
  return `${eventTimeLabel(startMs, zone)} to ${eventTimeLabel(endMs, zone)}`;
}

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
