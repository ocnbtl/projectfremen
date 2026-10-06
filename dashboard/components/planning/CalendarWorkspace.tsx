"use client";
import PlaceSync from "./PlaceSync";
import LogoLoader from "../operational/LogoLoader";
import * as Popover from "@radix-ui/react-popover";
import { calendarDisplayColor, eventColors, eventPreviewTitle, eventTimeLabel, eventTimeRange } from "./calendar-presentation";
import CalendarMobileView from "./CalendarMobileView";
import CalendarMonthView from "./CalendarMonthView";
import { monthWeekLayout } from "../../lib/modules/planning/month-layout";
import CalendarHourControls from "./CalendarHourControls";
import CalendarTimeGrid from "./CalendarTimeGrid";
import CalendarYearView from "./CalendarYearView";
import CalendarAgenda from "./CalendarAgenda";
import { calendarRange, shiftCalendar, viewIcons, type CalendarView as View } from "../../lib/modules/planning/calendar-navigation";
import EventPeople from "./EventPeople";
import EventGlyph from "./EventGlyph";
import EventObjects from "./EventObjects";
import EventTiming from "./EventTiming";
import { timeChange, timeChangePatch, canUndoTimeChange, type EventTimeChange } from "../../lib/modules/planning/event-time-history";
import { calendarDateLabel } from "./CalendarMiniMonth";
import CalendarObservanceSettings, { CalendarCountryFlag } from "./CalendarObservanceSettings";
import { calendarObservances, defaultObservances, observanceAppearance, type HolidayCatalog } from "../../lib/modules/planning/observances";
import EventEditorFields from "./EventEditorFields";
import CalendarDisclosure from "./CalendarDisclosure";
import useCalendarAutosave from "./useCalendarAutosave";
import CalendarGroupSettings from "./CalendarGroupSettings";
import CalendarDatePicker from "./CalendarDatePicker";
import CalendarViewToggle from "./CalendarViewToggle";
import { CalendarScene, useCalendarMotion, useCalendarMorph } from "./CalendarMotion";
import { motion } from "motion/react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import {
  eventGroup,
} from "../../lib/modules/planning/calendar-groups";
import RelatedRecords from "./RelatedRecords";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Temporal } from "@js-temporal/polyfill";
import {
  WorkspaceButton as Button,
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
const labelDate = (
  date: string,
  options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" },
) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, options);
const subscribeCompact = (notify: () => void) => { const query = matchMedia("(max-width: 760px)"); query.addEventListener("change", notify); return () => query.removeEventListener("change", notify); };
const readCompact = () => matchMedia("(max-width: 760px)").matches;
export default function CalendarWorkspace() {
  const compact = useSyncExternalStore(subscribeCompact, readCompact, () => false);
  const params = useSearchParams();
  const { layoutTransition } = useCalendarMotion();
  const calendarSurface = useRef<HTMLDivElement>(null);
  const morph = useCalendarMorph(calendarSurface);
  const previousDate = useRef("");
  const swipe = useRef<{ x: number; y: number } | undefined>(undefined);
  const [agendaDays, setAgendaDays] = useState(30);
  const [early, setEarly] = useState(false), [late, setLate] = useState(false);
  const [draft, setDraft] = useState<EventDraft | undefined>(
    () => retainedDraft,
  );
  const [showWeekends, setShowWeekends] = useState(true),
    [showCompleted, setShowCompleted] = useState(false),
    [widenToday, setWidenToday] = useState(false);
  const [dayDetail, setDayDetail] = useState<string>();
  const [zone, setZone] = useState("America/New_York"),
    [date, setDate] = useState(() => new Date().toISOString().slice(0, 10)),
    [view, setView] = useState<View>("week");
  const [confirmedSnapshot, setSnapshot] = useState<PlanningSnapshot>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [actionBusy, setBusy] = useState(false),
    [query, setQuery] = useState("");
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 3500); return () => clearTimeout(timer); }, [notice]);
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
  const [addingCalendar, setAddingCalendar] = useState(false);
  const [feedName, setFeedName] = useState("");
  const [importFile, setImportFile] = useState<File>();
  const [importProvider, setImportProvider] = useState("Google Calendar");
  const [holidayData, setHolidayData] = useState<HolidayCatalog>(), [holidayError, setHolidayError] = useState(""), [holidayLoading, setHolidayLoading] = useState(false);
  const [holidayRetry, setHolidayRetry] = useState(0);
  // Keep the UI responsive while ordered writes preserve record-version checks.
  const confirmed = useRef<PlanningSnapshot | undefined>(undefined);
  const writes = useRef(Promise.resolve());
  const writeCount = useRef(0), revision = useRef(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [calendarPatches, setCalendarPatches] = useState<Record<string, { revision: number; input: Partial<Calendar> }>>({});
  const busy = actionBusy || pendingCount > 0;
  const snapshot = useMemo(() => confirmedSnapshot && ({ ...confirmedSnapshot, state: {
    ...confirmedSnapshot.state,
    calendars: confirmedSnapshot.state.calendars.map(calendar => ({ ...calendar, ...calendarPatches[calendar.id]?.input })),
  } }), [confirmedSnapshot, calendarPatches]);
  function saveCalendarPreference(id: string, patch: Partial<Calendar> | ((calendar: Calendar) => Partial<Calendar>)): Promise<boolean> {
    const visible = snapshot?.state.calendars.find(calendar => calendar.id === id);
    if (!visible) return Promise.resolve(false);
    const input = typeof patch === "function" ? patch(visible) : patch;
    const version = ++revision.current;
    writeCount.current += 1;
    setPendingCount(writeCount.current);
    setError("");
    setCalendarPatches(current => ({ ...current, [id]: { revision: version, input: { ...current[id]?.input, ...input } } }));
    const job = writes.current.then(async () => {
      try {
        const current = confirmed.current?.state.calendars.find(calendar => calendar.id === id);
        const saved = await savePlanning("calendars", { id, ...(typeof patch === "function" && current ? patch(current) : input) }, current?.updatedAt);
        if (confirmed.current) {
          confirmed.current = { ...confirmed.current, state: { ...confirmed.current.state, calendars: confirmed.current.state.calendars.map(calendar => calendar.id === id ? saved : calendar) } };
          setSnapshot(confirmed.current);
        }
        return true;
      } catch (e) {
        setError((e as Error).message || "Calendar preference could not be saved");
        // A conflict may have a newer server value. Restore it before the next queued write.
        try { confirmed.current = await planningRequest<PlanningSnapshot>(); setSnapshot(confirmed.current); } catch { /* Retain the last confirmed value. */ }
        return false;
      } finally {
        setCalendarPatches(current => {
          if (current[id]?.revision !== version) return current;
          const next = { ...current }; delete next[id]; return next;
        });
        writeCount.current -= 1;
        revision.current += 1;
        setPendingCount(writeCount.current);
      }
    });
    writes.current = job.then(() => undefined);
    return job;
  }
  const nativeCalendar = snapshot?.state.calendars.find(c => c.id === "native");
  const observanceSettings = useMemo(() => nativeCalendar?.observances || defaultObservances(), [nativeCalendar?.observances]);
  const refresh = useCallback(async () => {
    if (writeCount.current) return;
    const startedAt = revision.current;
    try {
      const next = await planningRequest<PlanningSnapshot>();
      if (writeCount.current || startedAt !== revision.current) return;
      confirmed.current = next;
      setSnapshot(next);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setZone(z);
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
  const range = useMemo(() => calendarRange(date, view, agendaDays), [date, view, agendaDays]);
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
    { length: view === "month" ? 42 : view === "week" ? 7 : view === "3-day" ? 3 : 1 },
    (_, i) => addDays(range.start, i),
  ).filter(
    (day) =>
      view === "day" || view === "3-day" ||
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
          .includes(query.trim().toLowerCase()),
    ), ...calendarObservances(snapshot?.birthdays || [], holidayData?.holidays || [], observanceSettings, range.start, range.end, zone).filter(item => item.title.toLowerCase().includes(query.trim().toLowerCase()))];
  }, [expanded.items, snapshot?.state.calendars, snapshot?.birthdays, query, holidayData, observanceSettings, range, zone]);
  const dated = showDated
    ? (snapshot?.dated || []).filter(
        (x) =>
          (showCompleted || !x.completed) &&
          x.start < range.end &&
          x.end > range.start &&
          x.title.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : [];
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
  const [timeHistory, setTimeHistory] = useState<EventTimeChange[]>([]);
  const changingTime = useRef(false);
  async function commitTime(change: EventTimeChange, undo = false) {
    if (changingTime.current || busy) return;
    const original = confirmed.current?.state.events.find(item => item.id === change.eventId);
    if (!original) return;
    if (undo && !canUndoTimeChange(original, change)) {
      setError("This event changed since your move. Open it to review its current time.");
      return;
    }
    changingTime.current = true;
    writeCount.current += 1;
    revision.current += 1;
    setBusy(true);
    setError("");
    const patch = timeChangePatch(original, change, undo);
    // Paint the dropped position immediately; a failed save restores confirmed data.
    setSnapshot(current => current && ({ ...current, state: { ...current.state, events: current.state.events.map(event => event.id !== original.id ? event : original.source && !change.occurrenceKey ? { ...event, overrides: { ...event.overrides, ...(undo ? change.before : change.after) } } : { ...event, ...patch }) } }));
    try {
      const saved = await savePlanning("events", patch, original.updatedAt);
      if (confirmed.current) {
        confirmed.current = { ...confirmed.current, state: { ...confirmed.current.state, events: confirmed.current.state.events.map(event => event.id === saved.id ? saved : event) } };
        setSnapshot(confirmed.current);
      }
      setTimeHistory(history => undo ? history.slice(0, -1) : [...history.slice(-19), change]);
      setNotice(undo ? "Previous event time restored" : "Event time updated · Ctrl+Z or Undo to restore");
    } catch (error) {
      setSnapshot(confirmed.current);
      setError((error as Error).message);
    } finally {
      changingTime.current = false;
      writeCount.current -= 1;
      revision.current += 1;
      setBusy(false);
      void refresh();
    }
  }
  const undoLatest = () => { const change = timeHistory.at(-1); if (change) void commitTime(change, true); };
  useEffect(() => {
    const undoKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== "z" || event.repeat || editor || connections || busy || !timeHistory.length || target?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="dialog"]')) return;
      event.preventDefault();
      undoLatest();
    };
    window.addEventListener("keydown", undoKey);
    return () => window.removeEventListener("keydown", undoKey);
  });
  async function move(item: EventOccurrence, day: string, hour: number) {
    const original = snapshot?.state.events.find(x => x.id === item.eventId);
    if (!original) return;
    const minute = Math.round(hour * 60), displayStart = `${day}T${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    const ms = instantFor(displayStart, zone), start = localFor(ms, item.timeZone), end = localFor(ms + item.endMs - item.startMs, item.timeZone);
    if (ms === item.startMs) return;
    await commitTime(timeChange(original, item, start, end));
  }
  async function resizeEvent(item: EventOccurrence, endMs: number) {
    const original = snapshot?.state.events.find(x => x.id === item.eventId);
    if (!original || endMs === item.endMs) return;
    await commitTime(timeChange(original, item, item.start, localFor(Math.max(item.startMs + 300000, endMs), item.timeZone)));
  }
  const timeline = view === "day" || view === "3-day" || view === "week";
  const changeView = (next: View, day?: string) => morph(() => { setView(next); if (day) setDate(day); });
  function eventButton(item: EventOccurrence, detail = false) {
    const event = snapshot?.state.events.find((x) => x.id === item.eventId);
    const calendar = snapshot?.state.calendars.find(
      (x) => x.id === item.calendarId,
    );
    const group = eventGroup(calendar, item.groupId);
    return (
      <button
        type="button"
        key={item.id}
        className={`${styles.agendaEvent} ${detail ? styles.dayDetailEvent : ""}`}
        data-morph-event={item.id}
        data-birthday={item.system?.kind === "birthday" || undefined}
        data-month-all-day={view === "month" && item.allDay || undefined}
        style={eventColors(item, calendar) as CSSProperties}
        onClick={() => item.system ? setObservance(item) : event && openEvent(event, item)}
        title={item.title}
      >
        <span className={detail ? styles.detailTime : styles.agendaTime}><EventTiming event={item} zone={zone} /></span>
        <span className={styles.eventIcon}><EventGlyph event={item} icon={group?.icon} size={18} /></span>
        <span className={styles.eventCopy}><strong>{eventPreviewTitle(item)}</strong>
        </span>
        <EventPeople refs={item.linkedRefs} available={snapshot?.refs} />
        <EventObjects event={item} available={snapshot?.refs} />
      </button>
    );
  }
  async function connect(
    kind: "ics_file" | "ics_feed" | "morgen",
    file?: File,
  ) {
    return action(async () => {
      const connection = await savePlanning("connections", {
        name: (kind === "ics_feed" ? feedName : connectionName) || file?.name || importProvider,
        kind,
        timeZone: zone,
        url: kind === "ics_feed" ? feedUrl.trim().replace(/^webcal:\/\//i, "https://") : undefined,
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
      if (kind === "ics_feed") { setFeedUrl(""); setFeedName(""); }
      else { setConnectionName(""); setImportFile(undefined); }
    }, "Calendar imported");
  }
  if (!snapshot && !error) return <LogoLoader label="Loading calendar" viewport />;

  return (
    <div
      className={`work-surface ${styles.shell}`}
      style={moduleThemeVariables("calendar") as CSSProperties}
    >
      <PlaceSync onComplete={refresh} />
      <header className={styles.toolbar} data-timeline={timeline} aria-label="Calendar controls">
        <h1>Calendar</h1>
        <div className={styles.dateNavigation}>
          <Button className={styles.todayButton} onClick={() => setDate(localDate(new Date(), zone))}>Today</Button>
          <Button aria-label="Previous period" className={styles.periodButton} onClick={() => setDate(shiftCalendar(date, view, -1, agendaDays))}><UnigentamosIcon role="chevron-right" size={18} style={{ transform: "rotate(180deg)" }} /></Button>
          <Button aria-label="Next period" className={styles.periodButton} onClick={() => setDate(shiftCalendar(date, view, 1, agendaDays))}><UnigentamosIcon role="chevron-right" size={18} /></Button>
          <CalendarDatePicker value={date} today={localDate(new Date(now), zone)} view={view} onChange={(day, next) => changeView(next, day)} />
        </div>
        <div className={styles.draftSlot} data-active={Boolean(draft && !editor)}>
          {draft && !editor && <div className={styles.draftNotice}>
            <UnigentamosIcon role="edit" size={14} /><span>Unsaved draft</span>
            <Button onClick={() => setEditor(draft)} aria-label="Resume draft">Resume</Button>
            <Button onClick={() => finishEditing()} aria-label="Discard draft" title="Discard draft">Discard</Button>
          </div>}
        </div>
        <div className={styles.toolbarTools}>
          <CalendarHourControls available={timeline} days={days} events={occurrences} zone={zone} early={early} late={late} setEarly={setEarly} setLate={setLate} />
          <label className={styles.calendarSearch}><UnigentamosIcon role="search" size={16} /><input className={styles.search} type="search" aria-label="Search events" onKeyDown={e => { if (compact && (e.key === "Enter" || e.key === "Escape")) e.currentTarget.blur(); }} placeholder={compact ? "" : "Search"} value={query} onChange={e => setQuery(e.target.value)} /></label>
          <CalendarViewToggle view={view} onChange={next => changeView(next, next === "3-day" ? localDate(new Date(), zone) : undefined)} />
          <SelectField className={styles.viewDropdown} triggerContent={compact ? <span className={styles.viewChoice}><UnigentamosIcon role={viewIcons[view]} size={16} />{view === "3-day" ? "3 days" : view[0].toUpperCase() + view.slice(1)}</span> : undefined} aria-label="Calendar view" menuClassName={styles.calendarChoiceMenu} value={view} onChange={e => { const next = e.target.value as View; changeView(next, next === "3-day" ? localDate(new Date(), zone) : undefined); }}>
            {(["day", "3-day", "week", "month", "year", "agenda"] as View[]).map(v => <option key={v} value={v}><span className={styles.viewChoice}><UnigentamosIcon role={viewIcons[v]} size={16} />{v === "3-day" ? "3 days" : v[0].toUpperCase() + v.slice(1)}</span></option>)}
          </SelectField>
          <Popover.Root open={filters} onOpenChange={setFilters}>
            <Popover.Trigger asChild><Button icon={compact ? undefined : "sliders"} aria-label={compact ? "Calendar tools" : "Options"} data-has-draft={compact && Boolean(draft && !editor) || undefined} className={`${styles.toolbarUtility} ${styles.optionsButton}`}>{compact ? <UnigentamosIcon role="sliders" candidate="settings" size={18} /> : "Options"}</Button></Popover.Trigger>
            <Popover.Portal><Popover.Content className={[styles.calendarPopover, styles.viewOptions].join(" ")} style={moduleThemeVariables("calendar") as CSSProperties} sideOffset={8} collisionPadding={12} aria-label="Calendar view options">
              {compact && <div className={styles.mobileToolActions}>
                <Button icon="calendar" onClick={() => { setFilters(false); setConnections(true); }}>Settings</Button>

                {draft && !editor && <div className={styles.draftNotice}><span>Unsaved draft</span><Button aria-label="Resume draft" onClick={() => { setFilters(false); setEditor(draft); }}>Resume</Button><Button aria-label="Discard draft" onClick={() => finishEditing()}>Discard</Button></div>}
              </div>}
              <div className={styles.viewOptionSection}>
                <ViewToggle label="Widen today" icon="today" checked={widenToday} onChange={next => morph(() => setWidenToday(next))} />
                <ViewToggle label="Show weekends" icon="week" checked={showWeekends} onChange={next => morph(() => setShowWeekends(next))} />
              </div>
              <div className={styles.viewOptionSection}>
                <ViewToggle label="Display completed tasks" icon="check" checked={showCompleted} onChange={setShowCompleted} />
                <ViewToggle label="Linked work and trips" icon="link" checked={showDated} onChange={setShowDated} />
              </div>
              <label className={styles.zoneControl}><span className={styles.viewChoice}><UnigentamosIcon role="clock" size={16} />Display time zone</span>
                <SelectField searchable aria-label="Display time zone" value={zone} menuClassName={styles.calendarChoiceMenu} onChange={e => setZone(e.target.value)}>
                  {[...new Set([zone, "UTC", ...Intl.supportedValuesOf("timeZone")])].map(z => <option key={z} value={z}>{z.replaceAll("_", " ").replaceAll("/", " / ")}</option>)}
                </SelectField>
              </label>
            </Popover.Content></Popover.Portal>
          </Popover.Root>
          <button type="button" data-calendar-settings-trigger aria-label="Settings" title="Calendar settings" className={`work-button work-button--secondary ${styles.toolbarUtility} ${styles.calendarsButton}`} onClick={() => setConnections(true)}><UnigentamosIcon role="sliders" candidate="settings" size={20} /><span>Settings</span></button>

        </div>
          <Button data-calendar-event-trigger intent="primary" icon="plus" aria-label="Add event" className={styles.addEventButton} onClick={() => create()}>{compact ? "Add" : "Add event"}</Button>
      </header>
      <WorkspaceFeedback
        error={error || expanded.error || holidayError}
        message={notice}
        onRetry={error || holidayError ? () => { void refresh(); setHolidayRetry(value => value + 1); } : undefined}
      />
      {!!timeHistory.length && <button type="button" className={styles.undoTime} disabled={busy} onClick={undoLatest} title="Undo last event time change (Ctrl+Z / Cmd+Z)"><UnigentamosIcon role="chevron-right" size={15} style={{ transform: "rotate(180deg)" }} />Undo move · {timeHistory.at(-1)?.title}</button>}
      {query.trim() && <p className={styles.searchStatus} role="status">{occurrences.length + dated.length ? `${occurrences.length + dated.length} matching events in this view` : "No matching events in this view"}</p>}
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
          title="Calendar unavailable"
        >
          {error || "Please try loading your calendar again."}
        </WorkspaceEmpty>
      ) : (
        <div ref={calendarSurface} className={styles.content} data-view={view} data-morph-focus={date}
          onTouchStart={event => {
            const touch = event.touches.length === 1 ? event.touches[0] : undefined;
            swipe.current = touch ? { x: touch.clientX, y: touch.clientY } : undefined;
          }}
          onTouchCancel={() => { swipe.current = undefined; }}
          onTouchEnd={event => {
            const start = swipe.current, touch = event.changedTouches[0];
            swipe.current = undefined;
            if (!start || !touch || event.touches.length) return;
            const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
            if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
            if (event.cancelable) event.preventDefault();
            setDate(current => shiftCalendar(current, view, dx < 0 ? 1 : -1, agendaDays));
          }}>
          <CalendarScene id={`${view}:${range.start}`} direction={date < previousDate.current ? -1 : 1}>
          {compact && view === "month" ? <CalendarMobileView view={view} date={date} today={localDate(new Date(now), zone)} days={days} events={occurrences} linked={dated} zone={zone} onDate={setDate} renderEvent={item => eventButton(item)} /> : view === "year" ? <CalendarYearView compact={compact} date={date} today={localDate(new Date(now), zone)} zone={zone} events={occurrences} calendars={snapshot.state.calendars} linked={dated} showWeekends={showWeekends} onDay={day => changeView("day", day)} onMonth={day => changeView("month", day)} /> : view === "month" ? (
            <CalendarMonthView days={days} date={date} today={localDate(new Date(now), zone)} events={occurrences} calendars={snapshot.state.calendars} refs={snapshot.refs} zone={zone} showWeekends={showWeekends}
              onDay={day => changeView("day", day)} onMore={day => setDayDetail(day)}
              onOpen={item => { if (item.system) setObservance(item); else { const event = snapshot.state.events.find(e => e.id === item.eventId); if (event) openEvent(event, item); } }} />
          ) : view === "agenda" ? (
            <CalendarAgenda rangeDays={agendaDays} onRangeDays={setAgendaDays} events={occurrences} linked={dated} zone={zone} start={range.start} today={localDate(new Date(now), zone)} renderEvent={item => eventButton(item)} onDay={day => changeView("day", day)} />
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
        presentation="center"
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
          <div className={styles.dayDetailList}>
            {(() => {
              const columns = showWeekends ? 7 : 5;
              const row = Math.floor(Math.max(0, days.indexOf(dayDetail)) / columns);
              const week = days.slice(row * columns, (row + 1) * columns);
              const column = week.indexOf(dayDetail);
              return monthWeekLayout(week, occurrences, zone, Number.MAX_SAFE_INTEGER).segments
                .filter(segment => segment.first <= column && segment.last >= column)
                .map(segment => eventButton(segment.event, true));
            })()}
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
          </div>
        )}
      </WorkspaceSheet>
      <WorkspaceSheet
        anchorSelector="[data-calendar-event-trigger]"
        className={styles.eventSheet}
        anchorWidth={760}
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
            <label className={styles.eventTitleField}>
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
            />
            {editor.original && (
              <RelatedRecords
                hideEmpty
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
          <p><UnigentamosIcon role={observance.system?.kind === "birthday" ? "birthday" : "star"} size={18} />{labelDate(localFor(observance.startMs, zone).slice(0, 10), { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
          {!observance.allDay && <p><UnigentamosIcon role="clock" size={18} />{eventTimeRange(observance.startMs, observance.endMs, zone)} · {zone.replaceAll("_", " ")}</p>}
          <p>{observance.system?.detail}</p>
          {observance.ownerRef && <Link className="work-button" href={observance.ownerRef.route}>Open {observance.ownerRef.label}’s profile</Link>}
          <Button icon="sliders" onClick={() => { setObservance(undefined); setConnections(true); }}>Manage {observance.system?.kind === "birthday" ? "birthdays" : "holidays & dates"}</Button>
        </div>}
      </WorkspaceSheet>
      <WorkspaceSheet
        open={connections}
        onClose={() => setConnections(false)}
        presentation="page"
        title="Settings" titleIcon="sliders" className={styles.settingsSheet}
      >
        <div className={`work-form ${styles.calendarSettingsForm}`}>
          <WorkspaceFeedback error={error} message={notice} />
          <div className={styles.settingsHeading}><h3>Your calendars</h3><div className={styles.settingsActions}>

            {(["holidays", "custom"] as const).map(section => <SettingsPopover key={section} label={section === "custom" ? "Custom dates" : "Holiday calendars"} icon={section === "custom" ? "star" : "interaction-milestone"}>
              <CalendarObservanceSettings section={section} footer={section === "custom" ? <Popover.Close asChild><Button>Done</Button></Popover.Close> : undefined} settings={observanceSettings} catalog={holidayData} loading={holidayLoading} error={holidayError} busy={busy} year={date.slice(0, 4)} date={date} zone={zone} onSave={settings => saveCalendarPreference("native", { observances: settings })} />
            </SettingsPopover>)}
            <Button icon="plus" intent="primary" aria-expanded={addingCalendar} onClick={() => setAddingCalendar(value => !value)}>Add a calendar</Button>
          </div></div>
          {addingCalendar && <div className={styles.newCalendarForm}>          <form
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
                if (ok) { setCalendarName(""); setAddingCalendar(false); }
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
</div>}
          <div className={styles.calendarCardGrid}>
            {snapshot?.state.calendars.filter(c => !c.archivedAt).map(c => <section className={styles.calendarCard} key={c.id} style={{ "--calendar-card-color": calendarDisplayColor(c.color) } as CSSProperties}>
              <CalendarSettings calendar={c} busy={busy} enabled={c.visible} onToggle={visible => void saveCalendarPreference(c.id, { visible })} onSave={(name, color) => saveCalendarPreference(c.id, { name, color })} />
              <CalendarDisclosure title="Edit groups" icon="palette"><CalendarGroupSettings calendars={[c]} busy={busy} onSave={(calendar, groups) => saveCalendarPreference(calendar.id, { groups })} /></CalendarDisclosure>
            </section>)}
            {["birthdays", ...observanceSettings.countries.map(code => `holidays:${code}`), "custom"].map(key => {
              const code = key.startsWith("holidays:") ? key.slice(9) : undefined;
              const name = code ? holidayData?.countries.find(c => c.code === code)?.name || code : undefined;
              const appearance = observanceAppearance(observanceSettings, key, name);
              const enabled = key === "birthdays" ? observanceSettings.birthdays : key === "custom" ? observanceSettings.customVisible !== false : !observanceSettings.disabledCountries?.includes(code!);
              return <section className={styles.calendarCard} key={key} style={{ "--calendar-card-color": appearance.color } as CSSProperties}>
                <CalendarSettings calendar={appearance} busy={busy} icon={key === "birthdays" ? "birthday" : "star"} country={code} enabled={enabled}
                  onToggle={visible => void saveCalendarPreference("native", current => { const settings = current.observances || defaultObservances(); return { observances: { ...settings, ...(key === "birthdays" ? { birthdays: visible } : key === "custom" ? { customVisible: visible } : { disabledCountries: visible ? (settings.disabledCountries || []).filter(c => c !== code) : [...new Set([...(settings.disabledCountries || []), code!])] }) } }; })}
                  onSave={(name, color) => saveCalendarPreference("native", current => { const settings = current.observances || defaultObservances(); return { observances: { ...settings, appearances: { ...settings.appearances, [key]: { name, color } } } }; })} />
                {key === "birthdays" ? <CalendarDisclosure title="Choose birthdays" icon="birthday"><div className={styles.birthdayChoices}>{(snapshot?.birthdays || []).map(person => <label key={person.ref.objectId} className={styles.calendarToggle}><EventPeople refs={[person.ref]} available={snapshot?.refs} /><span>{person.ref.label}</span><input type="checkbox" aria-label={`Show birthday for ${person.ref.label}`} checked={!observanceSettings.hiddenBirthdays?.includes(person.ref.objectId)} onChange={e => { const checked = e.target.checked; void saveCalendarPreference("native", current => { const settings = current.observances || defaultObservances(); return { observances: { ...settings, hiddenBirthdays: checked ? (settings.hiddenBirthdays || []).filter(id => id !== person.ref.objectId) : [...new Set([...(settings.hiddenBirthdays || []), person.ref.objectId])] } }; }); }} /></label>)}{!snapshot?.birthdays?.length && <p>Add birthdays to people’s profiles to choose them here.</p>}</div></CalendarDisclosure> : <CalendarDisclosure title={code ? "Edit holidays" : "Edit dates"} icon={code ? "interaction-milestone" : "edit"} leading={code ? <span className={styles.holidayCardYear}>{date.slice(0,4)}</span> : undefined} actions={code ? <Button icon="delete" aria-label={`Remove ${name} holiday calendar`} disabled={busy} onClick={() => void saveCalendarPreference("native", current => ({ observances: { ...(current.observances || defaultObservances()), countries: (current.observances || defaultObservances()).countries.filter(country => country !== code) } }))} /> : undefined}>
                  <CalendarObservanceSettings section={code ? "holidays" : "custom"} countryCode={code} settings={observanceSettings} catalog={holidayData} loading={holidayLoading} error={holidayError} busy={busy} year={date.slice(0, 4)} date={date} zone={zone} onSave={settings => saveCalendarPreference("native", { observances: settings })} />
                </CalendarDisclosure>}
              </section>;
            })}
          </div>
          <section className={styles.importSection} aria-label="Import calendars">
            <div className={styles.settingsHeading}><div><h3><UnigentamosIcon role="import" size={18} />Import another calendar</h3><p>Upload a file once, or subscribe to a feed that refreshes automatically while Unigentamos is open.</p></div></div>
            <div className={styles.importProviders} role="group" aria-label="Calendar provider">{["Google Calendar", "Apple Calendar", "Outlook", "Other"].map(provider => <Button key={provider} aria-pressed={importProvider === provider} onClick={() => setImportProvider(provider)}>{provider === "Apple Calendar" ? <img src="/contact-sources/apple.svg" width={18} height={18} alt="" /> : provider === "Google Calendar" ? <img src="/contact-sources/google-calendar.png" width={18} height={18} alt="" /> : provider === "Outlook" ? <img src="/contact-sources/outlook.svg" width={18} height={18} alt="" /> : <UnigentamosIcon role="calendar" size={18} />}{provider}</Button>)}</div>
            <p className={styles.importHelp}>{importProvider === "Google Calendar" ? <>Export a calendar and choose its .ics file below, or paste its iCal feed address. <a href="https://support.google.com/calendar/answer/37111?hl=en" target="_blank" rel="noreferrer">Google export guide ↗</a></> : importProvider === "Apple Calendar" ? <>Export an .ics file from Calendar on Mac, or use an existing shared calendar link. Shared links can be read by anyone who has them. <a href="https://support.apple.com/guide/calendar/icl1023/mac" target="_blank" rel="noreferrer">Apple export guide ↗</a></> : <>Choose an .ics calendar export or paste a published iCal subscription link.</>}</p>
            <div className={styles.importMethods}>
              <form className={styles.importMethod} onSubmit={e => { e.preventDefault(); const form = e.currentTarget; if (importFile) void connect("ics_file", importFile).then(ok => { if (ok) form.reset(); }); }}>
                <h4><UnigentamosIcon role="export" size={17} />Upload a file</h4>
                <label>Name<input aria-label="Upload calendar name" value={connectionName} onChange={e => setConnectionName(e.target.value)} placeholder="Work, personal, travel…" /></label>
                <label>Calendar file<input required type="file" accept=".ics,text/calendar" disabled={busy} onChange={e => setImportFile(e.target.files?.[0])} /></label>
                <Button type="submit" icon="export" disabled={!importFile || busy}>Upload</Button>
              </form>
              <span className={styles.importOr}>or</span>
              <form className={styles.importMethod} onSubmit={e => { e.preventDefault(); void connect("ics_feed"); }}>
                <h4><UnigentamosIcon role="link" size={17} />Subscribe to a link</h4>
                <label>Name<input aria-label="Subscription calendar name" value={feedName} onChange={e => setFeedName(e.target.value)} placeholder="Work, personal, travel…" /></label>
                <label>Calendar link<input required type="text" inputMode="url" value={feedUrl} onChange={e => setFeedUrl(e.target.value)} placeholder="https://… or webcal://…" /></label>
                <Button type="submit" icon="link" disabled={!feedUrl.trim() || busy}>Subscribe</Button>
              </form>
            </div>
            {snapshot?.capabilities.morgen && <Button
              disabled={busy}
              onClick={() => void connect("morgen")}
            >
              Connect Morgen
            </Button>}
          </section>
          {Boolean(snapshot?.state.connections.length) && <section className="work-section">
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
        className={styles.calendarAssistant}
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
  icon = "calendar",
  country,
  enabled,
  onToggle,
}: {
  calendar: Pick<Calendar, "name" | "color">;
  busy: boolean;
  onSave: (name: string, color: string) => Promise<boolean>;
  icon?: string;
  country?: string;
  enabled?: boolean;
  onToggle?: (enabled: boolean) => void;
}) {
  const [name, setName] = useState(calendar.name),
    [color, setColor] = useState(calendar.color);
  const previousAppearance = useRef(calendar);
  useEffect(() => {
    const previous = previousAppearance.current;
    setName(value => value === previous.name ? calendar.name : value);
    setColor(value => value === previous.color ? calendar.color : value);
    previousAppearance.current = calendar;
  }, [calendar.name, calendar.color]);
  const autosave = useCalendarAutosave<{ name: string; color: string }>(value => onSave(value.name, value.color), value => Boolean(value.name.trim()));
  return (
    <form
      className={styles.calendarNameRow}
      onSubmit={(event) => {
        event.preventDefault();
        void autosave.flush();
      }}
    >
      {onToggle && <label className={styles.calendarEnable}><input type="checkbox" aria-label={`Show ${calendar.name}`} checked={enabled} onChange={event => onToggle(event.target.checked)} /><span aria-hidden="true"><UnigentamosIcon role="check" size={18} /></span></label>}
      <span className={styles.calendarNameIcon} style={{ color }}>{country ? <CalendarCountryFlag code={country} /> : <UnigentamosIcon role={icon} size={18} />}</span>
      <label className={styles.calendarNameInput}>
        <span>Calendar name</span>
        <input
          required
          maxLength={120}
          aria-label={`Name for ${calendar.name}`}
          value={name}
          onChange={(event) => { setName(event.target.value); autosave.schedule({ name: event.target.value, color }); }}
          onBlur={() => void autosave.flush()}
        />
      </label>
      <label className={styles.calendarColorInput}>
        <span>Color</span>
        <input
          type="color"
          aria-label={`Color for ${calendar.name}`}
          value={color}
          onChange={(event) => { setColor(event.target.value); autosave.schedule({ name, color: event.target.value }); }}
        />
      </label>
      <span className={styles.autosaveStatus} role="status">{autosave.status}</span>
      {autosave.status === "Not saved" && <Button onClick={() => void autosave.flush()}>Retry</Button>}
    </form>
  );
}

function ViewToggle({ label, icon, checked, onChange }: { label: string; icon: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className={styles.calendarToggle}><UnigentamosIcon role={icon} size={17} /><span>{label}</span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /></label>;
}

function SettingsPopover({ label, icon, children }: { label: string; icon: string; children: ReactNode }) {
  const trigger = useRef<HTMLButtonElement>(null);
  return <Popover.Root><Popover.Trigger asChild><button ref={trigger} type="button" className={`work-button ${styles.settingsPopoverTrigger}`}><UnigentamosIcon role={icon} size={16} /><span>{label}</span><UnigentamosIcon role="chevron-down" size={13} /></button></Popover.Trigger>
    <Popover.Portal container={trigger.current?.closest<HTMLElement>('[role="dialog"]') || undefined}><Popover.Content className={`${styles.calendarPopover} ${styles.settingsPopover}`} style={moduleThemeVariables("calendar") as CSSProperties} sideOffset={8} collisionPadding={16} collisionBoundary={trigger.current?.closest<HTMLElement>('[role="dialog"]')} sticky="always" align="end" aria-label={label} onOpenAutoFocus={event => event.preventDefault()} onFocusOutside={event => event.preventDefault()} onEscapeKeyDown={event => event.stopImmediatePropagation()}>
      {children}{label !== "Custom dates" && <Popover.Close asChild><button type="button" className="work-button">Done</button></Popover.Close>}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
