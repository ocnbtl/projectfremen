import { ADMIN_NAV_ITEMS } from "../admin-navigation";
import type { TaskKind } from "../modules/planning/task-model";

export const modulePaths = ADMIN_NAV_ITEMS.flatMap((item) => (item.href ? [item.href] : []));
export const taskKinds = [
  "task",
  "goal",
  "routine",
  "obligation",
  "decision",
  "follow_up",
  "objective",
] as const;
export const searchKinds = [
  "note",
  "contact",
  "resource",
  "media",
  "project",
  "review",
  "finance",
  "personal_ops",
  "other",
] as const;
export const reminderOptions = [-1, 0, 5, 15, 30, 60, 1440] as const;
export type DailyPreferences = {
  dateOrder: "mdy" | "dmy" | "ymd";
  clock: "12" | "24";
  weekStart: "sunday" | "monday";
  balanceCurrency: string;
  currencyDisplay: "symbol" | "code";
  homeZone: string;
  routineZone: "home" | "device";
  eventLead: number;
  deadlineLead: number;
  taskLead: number;
  calendarId: string;
  taskKind: TaskKind;
  scheduleTask: boolean;
  reminderBell: boolean;
  shareInbox: boolean;
  desktopReminders: boolean;
  quiet: boolean;
  quietStart: string;
  quietEnd: string;
  digest: "live" | "daily";
  digestAt: string;
  inboxKinds: string[];
  emailKinds: string[];
  pushKinds: string[];
  deliveryZone: string;
  accountLanding: string;
  accountPins: string[];
  accountMobilePins: string[];
  recordKinds: string[];
  landing: string;
  desktopPins: string[];
  mobilePins: string[];
  searchKinds: string[];
  archived: boolean;
  recentSearches: boolean;
};
export const dailyDefaults: DailyPreferences = {
  balanceCurrency: "USD",
  dateOrder: "mdy",
  clock: "12",
  weekStart: "sunday",
  currencyDisplay: "symbol",
  homeZone: "device",
  routineZone: "home",
  eventLead: 15,
  deadlineLead: 15,
  taskLead: 15,
  calendarId: "",
  taskKind: "task",
  scheduleTask: false,
  reminderBell: true,
  shareInbox: true,
  desktopReminders: false,
  quiet: false,
  quietStart: "22:00",
  quietEnd: "07:00",
  digest: "live",
  digestAt: "09:00",
  inboxKinds: ["assignment", "mention", "reminder"],
  emailKinds: [],
  pushKinds: [],
  deliveryZone: "UTC",
  accountLanding: "records",
  accountPins: [],
  accountMobilePins: [],
  recordKinds: [],
  landing: "/admin",
  desktopPins: [],
  mobilePins: [],
  searchKinds: [],
  archived: true,
  recentSearches: false,
};

function validZone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function validateDaily(value: unknown): DailyPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid preferences.");
  const result = { ...dailyDefaults, ...value };
  const choices: Partial<Record<keyof DailyPreferences, readonly unknown[]>> = {
    dateOrder: ["mdy", "dmy", "ymd"],
    clock: ["12", "24"],
    weekStart: ["sunday", "monday"],
    currencyDisplay: ["symbol", "code"],
    routineZone: ["home", "device"],
    taskKind: taskKinds,
    digest: ["live", "daily"],
    landing: ["/admin", ...modulePaths],
    accountLanding: ["records", "media", "settings", "notifications"],
    taskLead: reminderOptions,
    deadlineLead: reminderOptions,
    eventLead: reminderOptions,
  };
  for (const [name, item] of Object.entries(result)) {
    const key = name as keyof DailyPreferences;
    const fallback = dailyDefaults[key];
    if (
      !Object.hasOwn(dailyDefaults, key) ||
      typeof item !== typeof fallback ||
      (choices[key] && !choices[key]!.includes(item))
    )
      throw new Error("Invalid preference for " + key + ".");
    if (Array.isArray(fallback)) {
      const allowed: readonly string[] =
        key === "recordKinds"
          ? ["note", "task", "board", "project", "finance", "health", "person"]
          : ["accountPins", "accountMobilePins"].includes(key)
            ? ["records", "media", "settings", "notifications"]
            : key === "searchKinds"
              ? searchKinds
              : ["inboxKinds", "emailKinds", "pushKinds"].includes(key)
                ? ["assignment", "mention", "reminder"]
                : modulePaths;
      if (
        !Array.isArray(item) ||
        item.length > allowed.length ||
        new Set(item).size !== item.length ||
        item.some((val) => !allowed.includes(val))
      )
        throw new Error("Choose available modules.");
    }
  }
  if (!validZone(result.deliveryZone) || (result.homeZone !== "device" && !validZone(result.homeZone)))
    throw new Error("Choose a valid time zone.");
  if (
    ![result.quietStart, result.quietEnd, result.digestAt].every((time) =>
      /^([01]\d|2[0-3]):[0-5]\d$/.test(time),
    )
  )
    throw new Error("Choose a valid time.");
  if (result.quiet && result.quietStart === result.quietEnd)
    throw new Error("Choose different start and end times for quiet hours.");
  if (!Intl.supportedValuesOf("currency").includes(result.balanceCurrency))
    throw new Error("Choose a supported balance currency.");
  if (result.calendarId.length > 150 || /[\x00-\x1f]/.test(result.calendarId))
    throw new Error("Invalid calendar.");
  return result;
}

export function preferenceZone(
  prefs: DailyPreferences,
  deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  return prefs.homeZone === "device" ? deviceZone : prefs.homeZone;
}

export function deliveryClock(at: number, zone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (key: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === key)?.value;
  return {
    date: get("year") + "-" + get("month") + "-" + get("day"),
    time: get("hour") + ":" + get("minute"),
  };
}
export function silenced(prefs: DailyPreferences, at: number, zone = preferenceZone(prefs)) {
  if (!prefs.quiet) return false;
  const { time } = deliveryClock(at, zone);
  return prefs.quietStart < prefs.quietEnd
    ? time >= prefs.quietStart && time < prefs.quietEnd
    : time >= prefs.quietStart || time < prefs.quietEnd;
}
export function readyForDigest(
  createdAt: number,
  now: number,
  prefs: DailyPreferences,
  zone = preferenceZone(prefs),
) {
  if (createdAt > now) return false;
  if (prefs.digest === "live") return true;
  const created = deliveryClock(createdAt, zone),
    current = deliveryClock(now, zone);
  if (created.date === current.date) return created.time <= prefs.digestAt && current.time >= prefs.digestAt;
  const previous = new Date(current.date + "T12:00:00Z");
  previous.setUTCDate(previous.getUTCDate() - 1);
  return (
    current.time >= prefs.digestAt ||
    created.date < previous.toISOString().slice(0, 10) ||
    created.time <= prefs.digestAt
  );
}
export function formattedDay(iso: string, order: DailyPreferences["dateOrder"]) {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return order === "ymd"
    ? [year, month, day].join("-")
    : (order === "dmy" ? [day, month, year] : [month, day, year]).join("/");
}
export const leadMinutes = (lead: number) => (lead < 0 ? null : lead);
export const pinOrder = <T extends { href?: string }>(items: readonly T[], pins: readonly string[]) => [
  ...pins.flatMap((path) => items.filter((item) => item.href === path)),
  ...items.filter((item) => !pins.includes(item.href || "")),
];
