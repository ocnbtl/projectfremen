"use client";
import * as Popover from "@radix-ui/react-popover";
import CalendarTimeGrid from "./CalendarTimeGrid";
import EventPeople from "./EventPeople";
import CalendarObservanceSettings from "./CalendarObservanceSettings";
import { calendarObservances, defaultObservances, type HolidayCatalog } from "../../lib/modules/planning/observances";
import EventEditorFields from "./EventEditorFields";
import CalendarDatePicker from "./CalendarDatePicker";
import { CalendarScene, useCalendarMotion } from "./CalendarMotion";
import { motion } from "motion/react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import {
  calendarGroups,
  eventGroup,
} from "../../lib/modules/planning/calendar-groups";
import RelatedRecords from "./RelatedRecords";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Temporal } from "@js-temporal/polyfill";
import {
  WorkspaceButton as Button,
  WorkspaceHeader,
  WorkspaceFeedback,
  WorkspaceSheet,
  WorkspaceEmpty,
} from "../admin-shell/WorkspaceKit";
import SharedAIDock from "../admin-shell/SharedAIDock";
import SelectField from "../ui/SelectField";
import RecordLinks from "./RecordLinks";
import {
  planningRequest,
  savePlanning as savePlanningRecord,
  type PlanningSnapshot,
} from "../../lib/modules/planning/repository";
import {
  addDays,
  eventOccurrences,
  instantFor,
  localDate,
  localFor,
  monthStart,
  shiftMonth,
  weekStart,
} from "../../lib/modules/planning/calendar-model";
import {
  effectiveEvent,
  type CalendarEvent,
  type Calendar,
  type EventFields,
  type EventOccurrence,
} from "../../lib/modules/planning/types";
import {
  MODULE_COLOR_SYSTEM,
  moduleThemeVariables,
} from "../../lib/design-system/color-system";
import styles from "./CalendarWorkspace.module.css";

import { normalizePlanningRecord } from "../../lib/modules/planning/validation";
// Keep recurrence validation in Calendar's bundle and available before going offline.
const savePlanning: typeof savePlanningRecord = (
  collection,
  input,
  expected,
  options,
) =>
  savePlanningRecord(
    collection,
    input,
    expected,
    options,
    normalizePlanningRecord,
  );

type EventDraft = {
  fields: EventFields;
  original?: CalendarEvent;
  occurrence?: EventOccurrence;
  scope: "series" | "occurrence";
};
// Session memory only: private drafts are never written to unencrypted browser storage.
let retainedDraft: EventDraft | undefined;
type View = "day" | "week" | "month" | "agenda";
const labelDate = (
  date: string,
  options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" },
) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, options);
const timeLabel = (ms: number, zone: string) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
  }).format(ms);
export default function CalendarWorkspace() {
  const params = useSearchParams();
  const { layoutTransition } = useCalendarMotion();
  const previousDate = useRef("");
  const [early, setEarly] = useState(false), [late, setLate] = useState(false);
  const [draft, setDraft] = useState<EventDraft | undefined>(
    () => retainedDraft,
  );
  const [zoneInput, setZoneInput] = useState("");
  const [showWeekends, setShowWeekends] = useState(true),
    [showCompleted, setShowCompleted] = useState(false),
    [widenToday, setWidenToday] = useState(false);
  const [dayDetail, setDayDetail] = useState<string>(),
    [agendaPage, setAgendaPage] = useState(0);
  const [zone, setZone] = useState("America/New_York"),
    [date, setDate] = useState(() => new Date().toISOString().slice(0, 10)),
    [view, setView] = useState<View>("week");
  const [snapshot, setSnapshot] = useState<PlanningSnapshot>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState("");
  const [editor, setEditor] = useState<{
      fields: EventFields;
      original?: CalendarEvent;
      occurrence?: EventOccurrence;
      scope: "series" | "occurrence";
    }>(),
    [connections, setConnections] = useState(false),
    [filters, setFilters] = useState(false),
    [ai, setAi] = useState(false),
    [now, setNow] = useState(Date.now()),
    [showDated, setShowDated] = useState(true);
  const [connectionName, setConnectionName] = useState(""),
    [feedUrl, setFeedUrl] = useState(""),
    [calendarName, setCalendarName] = useState(""),
    [calendarColor, setCalendarColor] = useState(
      MODULE_COLOR_SYSTEM.calendar.tokens.icon,
    );
  const [observance, setObservance] = useState<EventOccurrence>();
  const [calendarTab, setCalendarTab] = useState<"calendars" | "holidays">("calendars");
  const [holidayData, setHolidayData] = useState<HolidayCatalog>(), [holidayError, setHolidayError] = useState(""), [holidayLoading, setHolidayLoading] = useState(false);
  const [holidayRetry, setHolidayRetry] = useState(0);
  const nativeCalendar = snapshot?.state.calendars.find(c => c.id === "native");
  const observanceSettings = useMemo(() => nativeCalendar?.observances || defaultObservances(), [nativeCalendar?.observances]);
  const refresh = useCallback(async () => {
    try {
      setSnapshot(await planningRequest<PlanningSnapshot>());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setZone(z);
    setZoneInput(z);
    const linkedDate = params.get("date");
    setDate(
      linkedDate && /^\d{4}-\d{2}-\d{2}$/.test(linkedDate)
        ? linkedDate
        : localDate(new Date(), z),
    );
    if (matchMedia("(max-width:760px)").matches) setView("day");
    void refresh();
    const timer = setInterval(() => setNow(Date.now()), 60000);
    window.addEventListener("online", refresh);
    window.addEventListener("unigentamos-planning-changed", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("unigentamos-planning-changed", refresh);
    };
  }, [refresh, params]);
  useEffect(() => {
    previousDate.current = date;
  }, [date]);
  useEffect(() => {
    if (editor) {
      retainedDraft = editor;
      setDraft(editor);
    }
  }, [editor]);
  function finishEditing(saved?: EventDraft) {
    if (!saved || retainedDraft === saved) retainedDraft = undefined;
    setDraft((current) => (!saved || current === saved ? undefined : current));
    setEditor((current) => (!saved || current === saved ? undefined : current));
  }
  const openEvent = useCallback(
    (event: CalendarEvent, occurrence?: EventOccurrence) => {
      setEditor({
        fields: occurrence || effectiveEvent(event),
        original: event,
        occurrence,
        scope:
          occurrence && (event.recurrence || event.recurrenceDates?.length)
            ? "occurrence"
            : "series",
      });
      setError("");
    },
    [],
  );
  const openedLink = useRef("");
  useEffect(() => {
    const selected = params.get("selected");
    const occurrenceKey = params.get("occurrence");
    const linkedDate = params.get("date");
    const linkKey = `${selected}|${occurrenceKey}|${linkedDate}`;
    if (!selected) {
      openedLink.current = "";
      return;
    }
    if (!snapshot || openedLink.current === linkKey) return;
    const event = snapshot.state.events.find((x) => x.id === selected);
    if (!event) return;
    openedLink.current = linkKey;
    if (!occurrenceKey) {
      openEvent(event);
      return;
    }
    try {
      const targetDate = Temporal.PlainDate.from(
        linkedDate || occurrenceKey.slice(0, 10),
      ).toString();
      const occurrence = eventOccurrences(
        [event],
        addDays(targetDate, -1),
        addDays(targetDate, 2),
        zone,
      ).find((item) => item.occurrenceKey === occurrenceKey);
      if (!occurrence) {
        setError(
          "This occurrence is no longer available. It may have been moved or cancelled.",
        );
        return;
      }
      setDate(targetDate);
      openEvent(event, occurrence);
    } catch {
      setError("This event link has an invalid date.");
    }
  }, [params, snapshot, zone, openEvent]);
  const range = useMemo(() => {
    const start =
      view === "month"
        ? weekStart(monthStart(date))
        : view === "week"
          ? weekStart(date)
          : date;
    return {
      start,
      end: addDays(
        start,
        view === "month"
          ? 42
          : view === "week"
            ? 7
            : view === "agenda"
              ? 30
              : 1,
      ),
    };
  }, [date, view]);
  const holidayCountries = observanceSettings.countries.join(",");
  const holidayYears = [...new Set([range.start.slice(0, 4), addDays(range.end, -1).slice(0, 4), date.slice(0, 4)])].join(",");
  useEffect(() => {
    if (!snapshot) return;
    const controller = new AbortController();
    setHolidayLoading(true);
    setHolidayError("");
    fetch(`/api/planning/holidays?${new URLSearchParams({ countries: holidayCountries, years: holidayYears })}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || "Holiday dates could not be loaded"); return data as HolidayCatalog; })
      .then(data => { if (!controller.signal.aborted) setHolidayData(data); })
      .catch(e => { if (!controller.signal.aborted) setHolidayError((e as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setHolidayLoading(false); });
    return () => controller.abort();
  }, [Boolean(snapshot), holidayCountries, holidayYears, holidayRetry]);
  const days = Array.from(
    { length: view === "month" ? 42 : view === "week" ? 7 : 1 },
    (_, i) => addDays(range.start, i),
  ).filter(
    (day) =>
      view === "day" ||
      showWeekends ||
      ![0, 6].includes(new Date(`${day}T12:00`).getDay()),
  );
  const expanded = useMemo(() => {
    try {
      return {
        items: eventOccurrences(
          snapshot?.state.events || [],
          range.start,
          range.end,
          zone,
        ),
        error: "",
      };
    } catch (e) {
      return { items: [], error: (e as Error).message };
    }
  }, [snapshot, range, zone]);
  const occurrences = useMemo(() => {
    const visibleCalendars = new Set(
      snapshot?.state.calendars
        .filter((calendar) => calendar.visible && !calendar.archivedAt)
        .map((calendar) => calendar.id),
    );
    return [...expanded.items.filter(
      (item) =>
        visibleCalendars.has(item.calendarId) &&
        `${item.title} ${item.description} ${item.location}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ), ...calendarObservances(snapshot?.birthdays || [], holidayData?.holidays || [], observanceSettings, range.start, range.end, zone).filter(item => item.title.toLowerCase().includes(query.toLowerCase()))];
  }, [expanded.items, snapshot?.state.calendars, snapshot?.birthdays, query, holidayData, observanceSettings, range, zone]);
  const dated = showDated
    ? (snapshot?.dated || []).filter(
        (x) =>
          (showCompleted || !x.completed) &&
          x.start < range.end &&
          x.end > range.start &&
          x.title.toLowerCase().includes(query.toLowerCase()),
      )
    : [];
  useEffect(() => setAgendaPage(0), [date, query, view, showCompleted]);
  async function action(work: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    try {
      await work();
      setNotice(message);
      await refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function create(day = date, hour = 9, duration = 60) {
    const start = `${day}T${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.round((hour % 1) * 60)).padStart(2, "0")}`;
    setEditor({
      scope: "series",
      fields: {
        title: "",
        description: "",
        start,
        end: localFor(instantFor(start, zone) + duration * 60000, zone),
        timeZone: zone,
        allDay: false,
        calendarId:
          snapshot?.state.calendars.find(
            (x) => !x.connectionId && !x.archivedAt,
          )?.id || "native",
        placeId: params.get("place") || undefined,
        location:
          snapshot?.state.places.find((x) => x.id === params.get("place"))
            ?.name || "",
        linkedRefs: [],
        recurrence: "",
        reminderMinutes: 15,
        kind: "event",
      },
    });
    setError("");
  }
  function update<K extends keyof EventFields>(key: K, value: EventFields[K]) {
    setEditor((current) =>
      current
        ? { ...current, fields: { ...current.fields, [key]: value } }
        : current,
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    const { original, fields, occurrence, scope } = editor;
    const input =
      scope === "occurrence" && occurrence && original
        ? {
            id: original.id,
            exceptions: {
              ...original.exceptions,
              [occurrence.occurrenceKey]: fields,
            },
          }
        : {
            ...fields,
            id: original?.id,
            exceptions: original?.exceptions || {},
          };
    if (
      await action(
        () => savePlanning("events", input, original?.updatedAt),
        "Event saved",
      )
    )
      finishEditing(editor);
  }
  async function archive() {
    if (!editor?.original) return;
    const original = editor.original;
    const input =
      editor.scope === "occurrence" && editor.occurrence
        ? {
            id: original.id,
            exceptions: {
              ...original.exceptions,
              [editor.occurrence.occurrenceKey]: { cancelled: true },
            },
          }
        : { id: original.id, archivedAt: new Date().toISOString() };
    if (
      await action(
        () => savePlanning("events", input, original.updatedAt),
        "Event removed from the calendar",
      )
    )
      finishEditing(editor);
  }
  async function move(item: EventOccurrence, day: string, hour: number) {
    const original = snapshot?.state.events.find((x) => x.id === item.eventId);
    if (!original) return;
    const displayStart = `${day}T${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.round((hour % 1) * 60)).padStart(2, "0")}`,
      ms = instantFor(displayStart, zone),
      start = localFor(ms, item.timeZone),
      end = localFor(ms + item.endMs - item.startMs, item.timeZone);
    await action(
      () =>
        savePlanning(
          "events",
          original.recurrence || original.recurrenceDates?.length
            ? {
                id: original.id,
                exceptions: {
                  ...original.exceptions,
                  [item.occurrenceKey]: {
                    ...original.exceptions[item.occurrenceKey],
                    start,
                    end,
                  },
                },
              }
            : { id: original.id, start, end },
          original.updatedAt,
        ),
      "Time updated",
    );
  }
  async function resizeEvent(item: EventOccurrence, endMs: number) {
    const original = snapshot?.state.events.find((e) => e.id === item.eventId);
    if (!original) return;
    const end = localFor(
      Math.max(item.startMs + 5 * 60000, endMs),
      item.timeZone,
    );
    await action(
      () =>
        savePlanning(
          "events",
          original.recurrence || original.recurrenceDates?.length
            ? {
                id: original.id,
                exceptions: {
                  ...original.exceptions,
                  [item.occurrenceKey]: {
                    ...original.exceptions[item.occurrenceKey],
                    end,
                  },
                },
              }
            : { id: original.id, end },
          original.updatedAt,
        ),
      "Event duration updated",
    );
  }
  function eventButton(item: EventOccurrence) {
    const event = snapshot?.state.events.find((x) => x.id === item.eventId);
    const calendar = snapshot?.state.calendars.find(
      (x) => x.id === item.calendarId,
    );
    const group = eventGroup(calendar, item.groupId);
    return (
      <button
        type="button"
        key={item.id}
        className={styles.agendaEvent}
        style={
          {
            "--event-color":
              item.system ? (item.system.kind === "birthday" ? "#5A6040" : "#716B80") : group?.color || calendarDisplayColor(calendar?.color),
          } as CSSProperties
        }
        onClick={() => item.system ? setObservance(item) : event && openEvent(event, item)}
        title={item.title}
      >
        <strong>
          {(group || item.system) && <UnigentamosIcon role={item.system ? item.system.kind === "birthday" ? "birthday" : "star" : group!.icon} size={14} />}{" "}
          {item.title}
        </strong>
        <EventPeople refs={item.linkedRefs} available={snapshot?.refs} />
        <span>
          {item.allDay
            ? "All day"
            : timeLabel(item.startMs, zone) + "–" + timeLabel(item.endMs, zone)}
        </span>
      </button>
    );
  }
  async function connect(
    kind: "ics_file" | "ics_feed" | "morgen",
    file?: File,
  ) {
    await action(async () => {
      const connection = await savePlanning("connections", {
        name: connectionName || file?.name || "Calendar connection",
        kind,
        timeZone: zone,
        url: kind === "ics_feed" ? feedUrl : undefined,
      });
      if (kind !== "morgen")
        await savePlanning("calendars", {
          name: connection.name,
          color: MODULE_COLOR_SYSTEM.calendar.tokens.icon,
          visible: true,
          connectionId: connection.id,
        });
      await planningRequest({
        operation: kind === "ics_file" ? "import" : "refresh",
        connectionId: connection.id,
        text: file ? await file.text() : undefined,
        timeZone: zone,
      });
      setConnectionName("");
      setFeedUrl("");
    }, "Calendar imported");
  }
  return (
    <div
      className={`work-surface ${styles.shell}`}
      style={moduleThemeVariables("calendar") as CSSProperties}
    >
      <WorkspaceHeader title="Calendar">
        <Button icon="calendar" onClick={() => setConnections(true)}>Calendars</Button>
        <Button intent="primary" icon="plus" onClick={() => create()}>
          Add event
        </Button>
      </WorkspaceHeader>
      <div className={styles.toolbar}>
        <div className={`work-actions ${styles.dateNavigation}`}>
          <Button onClick={() => setDate(localDate(new Date(), zone))}>
            Today
          </Button>
          <Button
            aria-label="Previous period"
            className={styles.periodButton}
            onClick={() =>
              setDate(
                view === "month"
                  ? shiftMonth(date, -1)
                  : addDays(
                      date,
                      view === "week" ? -7 : view === "agenda" ? -30 : -1,
                    ),
              )
            }
          >
            <UnigentamosIcon role="chevron-right" size={18} style={{ transform: "rotate(180deg)" }} />
          </Button>
          <Button
            aria-label="Next period"
            className={styles.periodButton}
            onClick={() =>
              setDate(
                view === "month"
                  ? shiftMonth(date, 1)
                  : addDays(
                      date,
                      view === "week" ? 7 : view === "agenda" ? 30 : 1,
                    ),
              )
            }
          >
            <UnigentamosIcon role="chevron-right" size={18} />
          </Button>
          <CalendarDatePicker value={date} today={localDate(new Date(now), zone)} onChange={setDate} />
        </div>
        <div className={styles.draftSlot}>
          {draft && !editor && <div className={styles.draftNotice}>
            <UnigentamosIcon role="edit" size={14} /><span>Unsaved draft</span>
            <Button onClick={() => setEditor(draft)} aria-label="Resume draft">Resume</Button>
            <Button onClick={() => finishEditing()} aria-label="Discard draft" title="Discard draft" icon="close" />
          </div>}
        </div>
        <div className="work-actions">
          <input
            className={styles.search}
            type="search"
            aria-label="Search events"
            placeholder="Search events"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <SelectField
            aria-label="Calendar view"
            value={view}
            onChange={(e) => setView(e.target.value as View)}
          >
            {["day", "week", "month", "agenda"].map((v) => (
              <option key={v} value={v}>
                <span className={styles.viewChoice}><UnigentamosIcon role={({ day: "today", week: "week", month: "calendar", agenda: "list" } as Record<string, string>)[v]} size={16} />{v[0].toUpperCase() + v.slice(1)}</span>
              </option>
            ))}
          </SelectField>
          <Popover.Root open={filters} onOpenChange={setFilters}>
            <Popover.Trigger asChild>
              <Button icon="sliders">View options</Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className={styles.calendarPopover}
                sideOffset={8}
                collisionPadding={12}
              >
                {[
                  ["Show weekends", showWeekends, setShowWeekends, "week"],
                  ["Show completed tasks", showCompleted, setShowCompleted, "check"],
                  ["Widen today", widenToday, setWidenToday, "today"],
                  ["Linked work and trips", showDated, setShowDated, "link"],
                ].map(([label, checked, set, icon]) => (
                  <label className={styles.calendarToggle} key={String(label)}>
                    <input
                      type="checkbox"
                      checked={Boolean(checked)}
                      onChange={(e) =>
                        (set as (v: boolean) => void)(e.target.checked)
                      }
                    />
                    <UnigentamosIcon role={String(icon)} size={16} />{String(label)}
                  </label>
                ))}
                <label>
                  <span className={styles.viewChoice}><UnigentamosIcon role="clock" size={16} />Display time zone</span>
                  <input
                    value={zoneInput}
                    onChange={(e) => setZoneInput(e.target.value)}
                    onBlur={() => {
                      try {
                        new Intl.DateTimeFormat("en", { timeZone: zoneInput });
                        setZone(zoneInput);
                        setError("");
                      } catch {
                        setError(
                          "Choose a recognized time zone, such as America/New_York.",
                        );
                      }
                    }}
                    list="calendar-zones"
                  />
                </label>
                <datalist id="calendar-zones">
                  {Intl.supportedValuesOf("timeZone").map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </datalist>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </div>
      <WorkspaceFeedback
        error={error || expanded.error || holidayError}
        message={notice}
        onRetry={error || holidayError ? () => { void refresh(); setHolidayRetry(value => value + 1); } : undefined}
      />
      {snapshot?.persistence === "device" && (
        <p className={styles.contextNotice} role="status">
          Saved on this device. Pending changes will sync when your Vault
          reconnects.
        </p>
      )}
      {snapshot?.state.events.some(
        (e) =>
          e.source && (e.source.changed || e.source.cancelled) && !e.archivedAt,
      ) && (
        <details className={styles.sourceChanges}>
          <summary>Calendar source changes need review</summary>
          {snapshot.state.events
            .filter(
              (e) =>
                e.source &&
                (e.source.changed || e.source.cancelled) &&
                !e.archivedAt,
            )
            .map((e) => (
              <button
                className="work-row"
                key={e.id}
                onClick={() => openEvent(e)}
              >
                <strong>{effectiveEvent(e).title}</strong>
                <span>
                  {e.source?.cancelled
                    ? "Cancelled at source"
                    : "Changed at source"}
                </span>
              </button>
            ))}
        </details>
      )}
      {snapshot?.sourceErrors.length ? (
        <p className={styles.contextNotice}>
          Some linked context is unavailable: {snapshot.sourceErrors.join(", ")}
          . Your saved events remain available.
        </p>
      ) : null}
      {!snapshot ? (
        <WorkspaceEmpty
          title={error ? "Calendar unavailable" : "Loading your calendar"}
        >
          Your records will appear here when loading completes.
        </WorkspaceEmpty>
      ) : (
        <div className={styles.content}>
          <CalendarScene id={`${view}:${range.start}`} direction={date < previousDate.current ? -1 : 1}>
          {view === "month" ? (
            <div
              className={styles.month}
              style={{
                gridTemplateColumns: `repeat(${showWeekends ? 7 : 5},minmax(0,1fr))`,
              }}
            >
              {days.map((day) => (
                <motion.section
                  key={day}
                  layout
                  transition={{ layout: layoutTransition }}
                  className={styles.monthDay}
                  data-today={day === localDate(new Date(now), zone)}
                >
                  <motion.button
                    layout="position"
                    transition={{ layout: layoutTransition }}
                    className={styles.dayNumber}
                    aria-label={labelDate(day, { weekday: "long", month: "long", day: "numeric" })}
                    onClick={() => {
                      setDate(day);
                      setView("day");
                    }}
                  >
                    <span className={styles.monthWeekday}>{labelDate(day, { weekday: "long" })}</span>
                    <span>{Number(day.slice(-2))}</span>
                  </motion.button>
                  {occurrences
                    .filter(
                      (x) =>
                        localFor(x.startMs, zone).slice(0, 10) <= day &&
                        localFor(x.endMs - 1, zone).slice(0, 10) >= day,
                    )
                    .slice(0, 2)
                    .map((x) => eventButton(x))}
                  {occurrences.filter(
                    (x) => localFor(x.startMs, zone).slice(0, 10) === day,
                  ).length > 2 && (
                    <button
                      onClick={() => {
                        setDate(day);
                        setDayDetail(day);
                      }}
                    >
                      View all events
                    </button>
                  )}
                  <button
                    className={styles.addDay}
                    aria-label={`Add event on ${day}`}
                    onClick={() => create(day)}
                  >
                    +
                  </button>
                </motion.section>
              ))}
            </div>
          ) : view === "agenda" ? (
            <div className={styles.agenda}>
              {[
                ...occurrences.map((item) => ({
                  id: item.id,
                  start: item.start,
                  title: item.title,
                  item,
                })),
                ...dated.map((link) => ({
                  id: link.id,
                  start: link.start,
                  title: link.title,
                  link,
                })),
              ]
                .sort((a, b) => a.start.localeCompare(b.start))
                .slice(agendaPage * 5, agendaPage * 5 + 5)
                .map((row) => (
                  <section className={styles.agendaDay} key={row.id}>
                    <h2>
                      {labelDate(row.start.slice(0, 10), {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </h2>
                    {"item" in row ? (
                      eventButton(row.item)
                    ) : (
                      <Link
                        className={styles.dated}
                        href={row.link.ownerRef?.route || "/admin/personal"}
                      >
                        {row.title}
                        {row.link.completed ? " · Completed" : ""}
                      </Link>
                    )}
                  </section>
                ))}
              {!occurrences.length && !dated.length ? (
                <WorkspaceEmpty title="Room to plan">
                  Add an event, connect a calendar, or schedule linked work.
                </WorkspaceEmpty>
              ) : (
                <div className="work-actions">
                  <Button
                    disabled={agendaPage === 0}
                    onClick={() => setAgendaPage(agendaPage - 1)}
                  >
                    Previous
                  </Button>
                  <span>
                    Page {agendaPage + 1} of{" "}
                    {Math.max(
                      1,
                      Math.ceil((occurrences.length + dated.length) / 5),
                    )}
                  </span>
                  <Button
                    disabled={
                      (agendaPage + 1) * 5 >= occurrences.length + dated.length
                    }
                    onClick={() => setAgendaPage(agendaPage + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <CalendarTimeGrid
              days={days}
              zone={zone}
              now={now}
              events={occurrences}
              calendars={snapshot.state.calendars}
              refs={snapshot.refs}
              dated={dated}
              widenToday={widenToday}
              early={early}
              late={late}
              setEarly={setEarly}
              setLate={setLate}
              onCreate={create}
              onDay={setDayDetail}
              onOpen={(item) => {
                if (item.system) { setObservance(item); return; }
                const event = snapshot.state.events.find(
                  (e) => e.id === item.eventId,
                );
                if (event) openEvent(event, item);
              }}
              onMove={(...args) => void move(...args)}
              onResize={(...args) => void resizeEvent(...args)}
            />
          )}
          </CalendarScene>
        </div>
      )}
      <WorkspaceSheet
        open={Boolean(dayDetail)}
        onClose={() => setDayDetail(undefined)}
        title={
          dayDetail
            ? labelDate(dayDetail, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })
            : "Day"
        }
      >
        {dayDetail && (
          <>
            <Button icon="plus" onClick={() => create(dayDetail)}>
              Add event
            </Button>
            {occurrences
              .filter(
                (x) =>
                  localFor(x.startMs, zone).slice(0, 10) <= dayDetail &&
                  localFor(x.endMs - 1, zone).slice(0, 10) >= dayDetail,
              )
              .map(eventButton)}
            {dated
              .filter((x) => x.start <= dayDetail && x.end > dayDetail)
              .map((x) => (
                <Link
                  className={styles.dated}
                  href={x.ownerRef?.route || "/admin/personal"}
                  key={x.id}
                >
                  {x.title}
                  {x.completed ? " · Completed" : ""}
                </Link>
              ))}
          </>
        )}
      </WorkspaceSheet>
      <WorkspaceSheet
        open={Boolean(editor)}
        onClose={() => setEditor(undefined)}
        title={editor?.original ? "Edit event" : "New event"}
      >
        {editor && (
          <form className={`work-form ${styles.eventForm}`} onSubmit={save}>
            <WorkspaceFeedback error={error} />
            {editor.original?.source && (
              <p className="work-muted">
                Changes are saved in Unigentamos. The source calendar remains
                unchanged.
                {editor.original.source.changed
                  ? " The source has changed since your local edit. Review the event below or reset to source."
                  : ""}
              </p>
            )}
            {editor.original?.source?.cancelled && (
              <p role="status">
                The source cancelled this event. Keep a native copy to retain it
                on your calendar, or remove it.
              </p>
            )}
            <label>
              Title
              <input
                required
                autoFocus
                maxLength={240}
                value={editor.fields.title}
                onChange={(e) => update("title", e.target.value)}
              />
            </label>
            {editor.occurrence &&
              (editor.original?.recurrence ||
                editor.original?.recurrenceDates?.length) && (
                <label>
                  Edit
                  <SelectField
                    value={editor.scope}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        scope: e.target.value as "series" | "occurrence",
                        fields:
                          e.target.value === "series"
                            ? effectiveEvent(editor.original!)
                            : editor.occurrence!,
                      })
                    }
                  >
                    <option value="occurrence">This occurrence</option>
                    <option value="series">Entire series</option>
                  </SelectField>
                </label>
              )}
            <EventEditorFields
              key={`${editor.original?.id || "new"}:${editor.scope}`}
              fields={editor.fields}
              update={update}
              snapshot={snapshot}
              busy={busy}
              onSaveGroups={(calendar, groups) =>
                action(
                  () => savePlanning("calendars", { id: calendar.id, groups }, calendar.updatedAt),
                  "Group colors saved",
                )
              }
              onCreateGroup={(calendar, group) =>
                action(
                  () =>
                    savePlanning(
                      "calendars",
                      {
                        id: calendar.id,
                        groups: [...calendarGroups(calendar), group],
                      },
                      calendar.updatedAt,
                    ),
                  "Color group saved",
                )
              }
            />
            {editor.original && (
              <RelatedRecords
                module="calendar"
                type="event"
                id={editor.original.id}
              />
            )}
            <div className="work-form-footer">
              <Button type="submit" intent="primary" busy={busy}>
                Save event
              </Button>
              {editor.original && (
                <Button
                  type="button"
                  intent="danger"
                  onClick={() => void archive()}
                  disabled={busy}
                >
                  Remove
                </Button>
              )}
            </div>
            {editor.original?.source && (
              <div className="work-actions">
                <Button
                  onClick={() =>
                    void action(
                      () =>
                        savePlanning(
                          "events",
                          { id: editor.original!.id },
                          editor.original!.updatedAt,
                          { resetSource: true },
                        ),
                      "Source restored",
                    ).then((ok) => {
                      if (ok) finishEditing(editor);
                    })
                  }
                >
                  Reset to source
                </Button>
                <Button
                  onClick={() =>
                    void action(
                      () =>
                        savePlanning(
                          "events",
                          { id: editor.original!.id },
                          undefined,
                          { keepNative: true },
                        ),
                      "Native copy saved",
                    ).then((ok) => {
                      if (ok) finishEditing(editor);
                    })
                  }
                >
                  Keep as native
                </Button>
              </div>
            )}
          </form>
        )}
      </WorkspaceSheet>
      <WorkspaceSheet
        open={Boolean(observance)} onClose={() => setObservance(undefined)} title={observance?.title || "Calendar date"}
      >
        {observance && <div className={styles.observanceDetail}>
          <EventPeople refs={observance.linkedRefs} available={snapshot?.refs} limit={100} />
          <p><UnigentamosIcon role={observance.system?.kind === "birthday" ? "birthday" : "star"} size={18} />{labelDate(observance.start, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
          <p>{observance.system?.detail}</p>
          {observance.ownerRef && <Link className="work-button" href={observance.ownerRef.route}>Open {observance.ownerRef.label}’s profile</Link>}
          <Button icon="sliders" onClick={() => { setObservance(undefined); setCalendarTab(observance.system?.kind === "birthday" ? "calendars" : "holidays"); setConnections(true); }}>Manage {observance.system?.kind === "birthday" ? "birthdays" : "holidays & dates"}</Button>
        </div>}
      </WorkspaceSheet>
      <WorkspaceSheet
        open={connections}
        onClose={() => setConnections(false)}
        title="Calendars and connections"
      >
        <div className={`work-form ${styles.calendarSettingsForm}`}>
          <WorkspaceFeedback error={error} message={notice} />
          <div className={styles.settingsTabs} role="group" aria-label="Calendar settings sections">
            <button type="button" aria-pressed={calendarTab === "calendars"} onClick={() => setCalendarTab("calendars")}><UnigentamosIcon role="calendar" size={16} />Calendars</button>
            <button type="button" aria-pressed={calendarTab === "holidays"} onClick={() => setCalendarTab("holidays")}><UnigentamosIcon role="star" size={16} />Holidays & dates</button>
          </div>
          {calendarTab === "holidays" ? <CalendarObservanceSettings settings={observanceSettings} catalog={holidayData} loading={holidayLoading} error={holidayError} busy={busy} year={date.slice(0, 4)} date={date} zone={zone} onSave={settings => action(() => savePlanning("calendars", { id: "native", observances: settings }, nativeCalendar?.updatedAt), "")} /> : <>
          <section className={styles.calendarVisibility} aria-label="Visible calendars">
            {snapshot?.state.calendars.filter(c => !c.archivedAt).map(c => <label className={styles.calendarToggle} key={c.id}>
              <input type="checkbox" checked={c.visible} disabled={busy} onChange={() => void action(() => savePlanning("calendars", { id: c.id, visible: !c.visible }, c.updatedAt), "")} />
              <span className={styles.calendarDot} style={{ background: calendarDisplayColor(c.color) }} />{c.name}
            </label>)}
            <label className={styles.calendarToggle}><input type="checkbox" checked={observanceSettings.birthdays} disabled={busy} onChange={e => void action(() => savePlanning("calendars", { id: "native", observances: { ...observanceSettings, birthdays: e.target.checked } }, nativeCalendar?.updatedAt), "")} /><UnigentamosIcon role="birthday" size={16} />People’s birthdays</label>
          </section>
          <details className={styles.settingsDisclosure}><summary>Add a calendar</summary>
          <form
            className="work-form"
            onSubmit={(e) => {
              e.preventDefault();
              void action(
                () =>
                  savePlanning("calendars", {
                    name: calendarName,
                    color: calendarColor,
                    visible: true,
                  }),
                "Calendar added",
              ).then((ok) => {
                if (ok) setCalendarName("");
              });
            }}
          >
            <label>
              New calendar
              <input
                required
                value={calendarName}
                onChange={(e) => setCalendarName(e.target.value)}
              />
            </label>
            <label>
              Calendar color
              <input
                type="color"
                value={calendarColor}
                onChange={(e) => setCalendarColor(e.target.value)}
              />
            </label>
            <Button type="submit" busy={busy}>
              Add calendar
            </Button>
          </form>
          </details>
          <details className={styles.settingsDisclosure}>
            <summary>Calendar names & colors</summary>
            {snapshot?.state.calendars
              .filter((calendar) => !calendar.archivedAt)
              .map((calendar) => (
                <CalendarSettings
                  key={`${calendar.id}:${calendar.updatedAt}`}
                  calendar={calendar}
                  busy={busy}
                  onSave={(name, color) =>
                    action(
                      () =>
                        savePlanning(
                          "calendars",
                          { id: calendar.id, name, color },
                          calendar.updatedAt,
                        ),
                      "Calendar updated",
                    )
                  }
                />
              ))}
          </details>
          <details className={styles.settingsDisclosure}>
            <summary>Import or subscribe</summary>
            <label>
              Name
              <input
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
                placeholder="Work, personal, travel…"
              />
            </label>
            <label>
              Calendar file
              <input
                type="file"
                accept=".ics,text/calendar"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void connect("ics_file", file);
                  e.target.value = "";
                }}
              />
            </label>
            <label>
              HTTPS calendar feed
              <input
                type="url"
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
            <Button
              disabled={!feedUrl || busy}
              onClick={() => void connect("ics_feed")}
            >
              Subscribe to feed
            </Button>
            <Button
              disabled={!snapshot?.capabilities.morgen || busy}
              onClick={() => void connect("morgen")}
            >
              Connect Morgen
            </Button>
            {!snapshot?.capabilities.morgen && (
              <p className="work-muted">
                Morgen requires an API key and account entitlement. File imports
                and feeds are available now.
              </p>
            )}
          </details>
          </>}
          {calendarTab === "calendars" && Boolean(snapshot?.state.connections.length) && <section className="work-section">
            <h2>Connections</h2>
            {snapshot?.state.connections.map((c) => (
              <div className={styles.connection} key={c.id}>
                <strong>{c.name}</strong>
                {c.kind === "morgen" && (
                  <p className="work-muted">
                    Refresh covers the previous and next 30 days. Events outside
                    that window may not be current.
                  </p>
                )}
                <small>
                  {c.lastSuccessAt
                    ? `Updated ${new Date(c.lastSuccessAt).toLocaleString()}`
                    : "Not refreshed yet"}
                </small>
                {c.lastError && <p role="alert">{c.lastError}</p>}
                {c.kind === "ics_file" && (
                  <label>
                    Replace from file
                    <input
                      type="file"
                      accept=".ics,text/calendar"
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file)
                          void action(
                            async () =>
                              planningRequest({
                                operation: "import",
                                connectionId: c.id,
                                text: await file.text(),
                                timeZone: zone,
                              }),
                            "Calendar file updated; local edits retained",
                          );
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
                {c.kind !== "ics_file" && (
                  <>
                    {c.archivedAt && (
                      <p className="work-muted">
                        Updates paused. Imported events remain available.
                      </p>
                    )}
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void action(
                          () =>
                            savePlanning(
                              "connections",
                              {
                                id: c.id,
                                archivedAt: c.archivedAt
                                  ? ""
                                  : new Date().toISOString(),
                              },
                              c.updatedAt,
                            ),
                          c.archivedAt ? "Updates resumed" : "Updates paused",
                        )
                      }
                    >
                      {c.archivedAt ? "Resume updates" : "Pause updates"}
                    </Button>
                  </>
                )}
                {c.kind !== "ics_file" && !c.archivedAt && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void action(
                        () =>
                          planningRequest({
                            operation: "refresh",
                            connectionId: c.id,
                            timeZone: zone,
                          }),
                        "Calendar refreshed",
                      )
                    }
                  >
                    Refresh
                  </Button>
                )}
              </div>
            ))}
          </section>}
        </div>
      </WorkspaceSheet>
      <SharedAIDock
        open={ai}
        onOpenChange={setAi}
        context={{
          module: "calendar",
          visibleScope: `${view} · ${range.start}`,
          allowedActions: [
            "Summarize visible events",
            "Draft a reviewed proposal",
          ],
        }}
      />
    </div>
  );
}

function CalendarSettings({
  calendar,
  busy,
  onSave,
}: {
  calendar: Calendar;
  busy: boolean;
  onSave: (name: string, color: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(calendar.name),
    [color, setColor] = useState(calendar.color);
  return (
    <form
      className="work-form work-section"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(name, color);
      }}
    >
      <label>
        Calendar name
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        Color for {calendar.name}
        <input
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
        />
      </label>
      <Button
        type="submit"
        busy={busy}
        disabled={name === calendar.name && color === calendar.color}
      >
        Save calendar
      </Button>
    </form>
  );
}

/** Re-tint the former default without changing stored or custom calendar colors. */
function calendarDisplayColor(color?: string) {
  return !color || color.toLowerCase() === "#565b86"
    ? MODULE_COLOR_SYSTEM.calendar.tokens.icon
    : color;
}
