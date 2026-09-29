"use client";
import RelatedRecords from "./RelatedRecords";
import { motionTokens } from "../../lib/design-system/motion";
import { useMotionPreference } from "../admin-shell/ExperienceProvider";
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
import DateField from "../people/DateField";
import TimeField from "../people/TimeField";
import SelectField from "../ui/SelectField";
import RecordLinks from "./RecordLinks";
import {
  planningRequest,
  savePlanning as savePlanningRecord,
  type PlanningSnapshot,
} from "../../lib/modules/planning/repository";
import {
  addDays,
  calendarLayout,
  calendarOverlapGroups,
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
import { moduleThemeVariables } from "../../lib/design-system/color-system";
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
  const { preference } = useMotionPreference();
  const contentRef = useRef<HTMLDivElement>(null);
  const previousDate = useRef("");
  const [overlap, setOverlap] = useState<EventOccurrence[]>();
  const [overlapQuery, setOverlapQuery] = useState("");
  const [overlapLimit, setOverlapLimit] = useState(50);
  const overlapMatches =
    overlap?.filter((item) =>
      `${item.title} ${item.location}`
        .toLowerCase()
        .includes(overlapQuery.toLowerCase()),
    ) || [];
  const timeScroll = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef<Record<string, number>>({});
  const [draft, setDraft] = useState<EventDraft | undefined>(
    () => retainedDraft,
  );
  const [zoneInput, setZoneInput] = useState("");
  const [slotFocus, setSlotFocus] = useState({ day: "", half: 18 });
  const [dragPreview, setDragPreview] = useState<{
    day: string;
    half: number;
  }>();
  const resizeOrigin = useRef<{ id: string; y: number; end: number } | null>(
    null,
  );
  const [resizing, setResizing] = useState<{ id: string; end: number }>();
  const dragOrigin = useRef<{ day: string; half: number } | null>(null);
  const [creationRange, setCreationRange] = useState<{
    day: string;
    from: number;
    to: number;
  }>();

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
    [calendarColor, setCalendarColor] = useState("#565B86");
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
    if (matchMedia("(max-width:760px)").matches) setView("agenda");
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
    const previous = previousDate.current;
    previousDate.current = date;
    if (
      !previous ||
      previous === date ||
      preference === "reduce" ||
      matchMedia("(prefers-reduced-motion:reduce)").matches
    )
      return;
    const animation = contentRef.current?.animate(
      [
        {
          opacity: 0.55,
          transform: `translateX(${date > previous ? 8 : -8}px)`,
        },
        { opacity: 1, transform: "translateX(0)" },
      ],
      {
        duration: motionTokens.standard * 1000,
        easing: `cubic-bezier(${motionTokens.arrive.join(",")})`,
      },
    );
    return () => animation?.cancel();
  }, [date, preference]);
  useEffect(() => {
    if (editor) {
      retainedDraft = editor;
      setDraft(editor);
    }
  }, [editor]);
  useEffect(() => {
    if (!snapshot || (view !== "week" && view !== "day")) return;
    const node = timeScroll.current;
    if (node) node.scrollTop = scrollPositions.current[view] ?? 8 * 64;
  }, [view, Boolean(snapshot)]);
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
  const days = Array.from(
    { length: view === "month" ? 42 : view === "week" ? 7 : 1 },
    (_, i) => addDays(range.start, i),
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
    return expanded.items.filter(
      (item) =>
        visibleCalendars.has(item.calendarId) &&
        `${item.title} ${item.description} ${item.location}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
  }, [expanded.items, snapshot?.state.calendars, query]);
  // Zone conversion and interval layout do not depend on open menus or editor
  // keystrokes. Compute each day's bounds once and reuse its layout.
  const dayGroups = useMemo(
    () =>
      Object.fromEntries(
        days.map((day) => {
          const low = instantFor(day, zone),
            high = instantFor(addDays(day, 1), zone);
          const groups = calendarOverlapGroups(
            occurrences.filter(
              (item) => !item.allDay && item.startMs < high && item.endMs > low,
            ),
          );
          return [
            day,
            groups.map((group) => {
              let endings: number[] = [],
                dense = false;
              for (const item of group) {
                endings = endings.filter((end) => end > item.startMs);
                endings.push(item.endMs);
                if (endings.length > 2) {
                  dense = true;
                  break;
                }
              }
              return { group, layout: dense ? null : calendarLayout(group) };
            }),
          ];
        }),
      ),
    [occurrences, range.start, range.end, view, zone],
  );
  const dated = showDated
    ? (snapshot?.dated || []).filter(
        (x) =>
          x.start < range.end &&
          x.end > range.start &&
          x.title.toLowerCase().includes(query.toLowerCase()),
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
    const start = `${day}T${String(Math.floor(hour)).padStart(2, "0")}:${hour % 1 ? "30" : "00"}`;
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
    const displayStart = `${day}T${String(Math.floor(hour)).padStart(2, "0")}:${hour % 1 ? "30" : "00"}`,
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
      Math.max(item.startMs + 30 * 60000, endMs),
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
  function eventButton(item: EventOccurrence, style?: CSSProperties) {
    const event = snapshot?.state.events.find((x) => x.id === item.eventId);
    const calendar = snapshot?.state.calendars.find(
      (x) => x.id === item.calendarId,
    );
    const content = (
      <>
        <strong>{item.title}</strong>
        <span>
          {item.allDay
            ? "All day"
            : `${timeLabel(item.startMs, zone)}–${timeLabel(resizing?.id === item.id ? resizing.end : item.endMs, zone)}`}
        </span>
        {item.location && <small>{item.location}</small>}
        {item.overridden && <small>Edited here</small>}
      </>
    );
    const title = `${item.title} · ${timeLabel(item.startMs, zone)}–${timeLabel(item.endMs, zone)}`;
    const drag = (e: React.DragEvent) =>
      e.dataTransfer.setData("application/x-unigentamos-event", item.id);
    if (!style)
      return (
        <button
          type="button"
          key={item.id}
          className={styles.agendaEvent}
          style={
            { "--event-color": calendar?.color || "#565B86" } as CSSProperties
          }
          onClick={() => event && openEvent(event, item)}
          title={title}
        >
          {content}
        </button>
      );
    return (
      <div
        key={item.id}
        className={styles.event}
        style={
          {
            ...style,
            height:
              resizing?.id === item.id
                ? Math.max(
                    24,
                    Number(style.height) +
                      (((resizing.end - item.endMs) / 60000) * 64) / 60,
                  )
                : style.height,
            "--event-color": calendar?.color || "#565B86",
          } as CSSProperties
        }
      >
        <button
          type="button"
          className={styles.eventBody}
          draggable={!item.allDay}
          onDragStart={drag}
          onClick={() => event && openEvent(event, item)}
          title={title}
        >
          {content}
        </button>
        <button
          type="button"
          className={styles.resizeHandle}
          aria-label={`Resize ${item.title}; use up or down arrows to change by 30 minutes`}
          title="Drag to change duration; arrow keys adjust by 30 minutes"
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              void resizeEvent(
                item,
                item.endMs + (e.key === "ArrowUp" ? -1 : 1) * 30 * 60000,
              );
            }
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            resizeOrigin.current = {
              id: item.id,
              y: e.clientY,
              end: item.endMs,
            };
            setResizing({ id: item.id, end: item.endMs });
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const origin = resizeOrigin.current;
            if (origin?.id === item.id)
              setResizing({
                id: item.id,
                end: Math.max(
                  item.startMs + 30 * 60000,
                  origin.end +
                    Math.round((e.clientY - origin.y) / 32) * 30 * 60000,
                ),
              });
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (resizing?.id === item.id) void resizeEvent(item, resizing.end);
            resizeOrigin.current = null;
            setResizing(undefined);
          }}
          onPointerCancel={() => {
            resizeOrigin.current = null;
            setResizing(undefined);
          }}
        >
          <span aria-hidden="true" />
        </button>
      </div>
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
          color: "#565B86",
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
        <Button onClick={() => setConnections(true)}>Calendars</Button>
        <Button intent="primary" icon="plus" onClick={() => create()}>
          Add event
        </Button>
      </WorkspaceHeader>
      <div className={styles.toolbar}>
        <div className="work-actions">
          <Button onClick={() => setDate(localDate(new Date(), zone))}>
            Today
          </Button>
          <Button
            aria-label="Previous period"
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
            ←
          </Button>
          <Button
            aria-label="Next period"
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
            →
          </Button>
          <h2 aria-live="polite">
            {view === "month"
              ? labelDate(date, { month: "long", year: "numeric" })
              : view === "day"
                ? labelDate(date, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })
                : `${labelDate(range.start, { month: "short", day: "numeric" })} – ${labelDate(addDays(range.end, -1), { month: "short", day: "numeric", year: "numeric" })}`}
          </h2>
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
            {["day", "week", "month", "agenda"].map((x) => (
              <option key={x} value={x}>
                {x[0].toUpperCase() + x.slice(1)}
              </option>
            ))}
          </SelectField>
          <Button aria-expanded={filters} onClick={() => setFilters(!filters)}>
            Filter
          </Button>
        </div>
      </div>
      {filters && (
        <div className="work-filters">
          {snapshot?.state.calendars
            .filter((c) => !c.archivedAt)
            .map((c) => (
              <label className={styles.calendarToggle} key={c.id}>
                <input
                  type="checkbox"
                  checked={c.visible}
                  onChange={() =>
                    void action(
                      () =>
                        savePlanning(
                          "calendars",
                          { id: c.id, visible: !c.visible },
                          c.updatedAt,
                        ),
                      "",
                    )
                  }
                />
                <span style={{ background: c.color }} />
                {c.name}
              </label>
            ))}
          <label className={styles.calendarToggle}>
            <input
              type="checkbox"
              checked={showDated}
              onChange={(e) => setShowDated(e.target.checked)}
            />
            Linked work and trips
          </label>
          <label>
            Display time zone
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
        </div>
      )}
      <WorkspaceFeedback
        error={error || expanded.error}
        message={notice}
        onRetry={error ? () => void refresh() : undefined}
      />
      {snapshot?.persistence === "device" && (
        <p className={styles.contextNotice} role="status">
          Saved on this device. Pending changes will sync when your Vault
          reconnects.
        </p>
      )}
      {draft && !editor && (
        <div className={styles.draftNotice}>
          <span>Unsaved event draft</span>
          <Button onClick={() => setEditor(draft)}>Resume draft</Button>
          <Button onClick={() => finishEditing()}>Discard</Button>
        </div>
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
        <div className={styles.content} ref={contentRef}>
          {view === "month" ? (
            <div className={styles.month}>
              {days.map((day) => (
                <section
                  key={day}
                  className={styles.monthDay}
                  data-today={day === localDate(new Date(now), zone)}
                >
                  <button
                    className={styles.dayNumber}
                    onClick={() => {
                      setDate(day);
                      setView("day");
                    }}
                  >
                    {labelDate(day, { weekday: "short", day: "numeric" })}
                  </button>
                  {occurrences
                    .filter(
                      (x) =>
                        localFor(x.startMs, zone).slice(0, 10) <= day &&
                        localFor(x.endMs - 1, zone).slice(0, 10) >= day,
                    )
                    .slice(0, 3)
                    .map((x) => eventButton(x))}
                  {occurrences.filter(
                    (x) => localFor(x.startMs, zone).slice(0, 10) === day,
                  ).length > 3 && (
                    <button
                      onClick={() => {
                        setDate(day);
                        setView("agenda");
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
                </section>
              ))}
            </div>
          ) : view === "agenda" ? (
            <div className={styles.agenda}>
              {!occurrences.length && !dated.length ? (
                <WorkspaceEmpty title="Room to plan">
                  Add an event, connect a calendar, or schedule linked work.
                </WorkspaceEmpty>
              ) : (
                Array.from({ length: 30 }, (_, i) => addDays(date, i)).map(
                  (day) => {
                    const items = occurrences.filter(
                        (x) =>
                          localFor(x.startMs, zone).slice(0, 10) <= day &&
                          localFor(x.endMs - 1, zone).slice(0, 10) >= day,
                      ),
                      links = dated.filter(
                        (x) => x.start <= day && x.end > day,
                      );
                    return items.length || links.length ? (
                      <section className={styles.agendaDay} key={day}>
                        <h2>
                          {labelDate(day, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </h2>
                        <div>
                          {items.map((x) => eventButton(x))}
                          {links.map((x) => (
                            <Link
                              className={styles.dated}
                              key={x.id}
                              href={x.ownerRef?.route || "/admin/personal"}
                            >
                              {x.title}
                              <small>Linked record · Open owner</small>
                            </Link>
                          ))}
                        </div>
                      </section>
                    ) : null;
                  },
                )
              )}
            </div>
          ) : (
            <div
              className={styles.timeScroll}
              ref={timeScroll}
              onScroll={(e) => {
                scrollPositions.current[view] = e.currentTarget.scrollTop;
              }}
            >
              <div
                className={styles.timeGrid}
                style={{ "--days": days.length } as CSSProperties}
              >
                <div className={styles.timeGutter}>
                  {zone.split("/").pop()?.replaceAll("_", " ")}
                </div>
                {days.map((day) => (
                  <div
                    className={styles.dayHeader}
                    key={day}
                    data-today={day === localDate(new Date(now), zone)}
                  >
                    <strong>
                      {labelDate(day, { weekday: "short", day: "numeric" })}
                    </strong>
                    {occurrences
                      .filter((x) => x.allDay && x.start <= day && x.end > day)
                      .map((x) => eventButton(x))}
                    {dated
                      .filter((x) => x.start <= day && x.end > day)
                      .map((x) => (
                        <Link
                          className={styles.dated}
                          key={x.id}
                          href={x.ownerRef?.route || "/admin/personal"}
                        >
                          {x.title}
                        </Link>
                      ))}
                  </div>
                ))}
                <div className={styles.hours}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <span key={h}>
                      {h === 0
                        ? "12 AM"
                        : h < 12
                          ? `${h} AM`
                          : h === 12
                            ? "12 PM"
                            : `${h - 12} PM`}
                    </span>
                  ))}
                </div>
                {days.map((day) => (
                  <div
                    className={styles.dayColumn}
                    key={day}
                    data-calendar-day={day}
                    onPointerMove={(e) => {
                      const origin = dragOrigin.current;
                      if (!origin || origin.day !== day) return;
                      const half = Math.max(
                        0,
                        Math.min(
                          47,
                          Math.floor(
                            (e.clientY -
                              e.currentTarget.getBoundingClientRect().top) /
                              32,
                          ),
                        ),
                      );
                      setCreationRange({
                        day,
                        from: Math.min(origin.half, half),
                        to: Math.max(origin.half, half) + 1,
                      });
                    }}
                    onPointerUp={() => {
                      const origin = dragOrigin.current;
                      if (origin && creationRange)
                        create(
                          day,
                          creationRange.from / 2,
                          (creationRange.to - creationRange.from) * 30,
                        );
                      dragOrigin.current = null;
                      setCreationRange(undefined);
                    }}
                    onPointerCancel={() => {
                      dragOrigin.current = null;
                      setCreationRange(undefined);
                    }}
                    onDragLeave={() => setDragPreview(undefined)}
                    onDragOver={(e) => {
                      if (
                        e.dataTransfer.types.includes(
                          "application/x-unigentamos-event",
                        )
                      ) {
                        e.preventDefault();
                        setDragPreview({
                          day,
                          half: Math.max(
                            0,
                            Math.min(
                              47,
                              Math.floor(
                                (e.clientY -
                                  e.currentTarget.getBoundingClientRect().top) /
                                  32,
                              ),
                            ),
                          ),
                        });
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragPreview(undefined);
                      const item = occurrences.find(
                        (x) =>
                          x.id ===
                          e.dataTransfer.getData(
                            "application/x-unigentamos-event",
                          ),
                      );
                      if (item) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        void move(
                          item,
                          day,
                          Math.max(
                            0,
                            Math.min(
                              23.5,
                              Math.floor((e.clientY - rect.top) / 32) / 2,
                            ),
                          ),
                        );
                      }
                    }}
                  >
                    {Array.from({ length: 48 }, (_, half) => (
                      <button
                        className={styles.slot}
                        key={half}
                        aria-label={`Add event ${day} at ${Math.floor(half / 2)}:${half % 2 ? "30" : "00"}`}
                        tabIndex={
                          half === slotFocus.half &&
                          day === (slotFocus.day || days[0])
                            ? 0
                            : -1
                        }
                        data-half={half}
                        onFocus={() => setSlotFocus({ day, half })}
                        onKeyDown={(e) => {
                          if (
                            [
                              "ArrowUp",
                              "ArrowDown",
                              "ArrowLeft",
                              "ArrowRight",
                              "Home",
                              "End",
                            ].includes(e.key)
                          ) {
                            e.preventDefault();
                            const nextHalf =
                              e.key === "Home"
                                ? 0
                                : e.key === "End"
                                  ? 47
                                  : Math.max(
                                      0,
                                      Math.min(
                                        47,
                                        half +
                                          (e.key === "ArrowDown"
                                            ? 1
                                            : e.key === "ArrowUp"
                                              ? -1
                                              : 0),
                                      ),
                                    );
                            const nextDay =
                              days[
                                Math.max(
                                  0,
                                  Math.min(
                                    days.length - 1,
                                    days.indexOf(day) +
                                      (e.key === "ArrowRight"
                                        ? 1
                                        : e.key === "ArrowLeft"
                                          ? -1
                                          : 0),
                                  ),
                                )
                              ];
                            setSlotFocus({ day: nextDay, half: nextHalf });
                            timeScroll.current
                              ?.querySelector<HTMLButtonElement>(
                                `[data-calendar-day="${nextDay}"] [data-half="${nextHalf}"]`,
                              )
                              ?.focus();
                          }
                        }}
                        onPointerDown={(e) => {
                          if (e.pointerType === "mouse" && e.button === 0) {
                            dragOrigin.current = { day, half };
                            setCreationRange({ day, from: half, to: half + 2 });
                            e.currentTarget.parentElement?.setPointerCapture(
                              e.pointerId,
                            );
                          }
                        }}
                        onClick={(e) => {
                          if (e.detail === 0 || !creationRange)
                            create(day, half / 2);
                        }}
                      />
                    ))}
                    {creationRange?.day === day && (
                      <div
                        className={styles.dragPreview}
                        style={{
                          top: creationRange.from * 32,
                          height: (creationRange.to - creationRange.from) * 32,
                        }}
                        aria-hidden="true"
                      >
                        {Math.floor(creationRange.from / 2)}:
                        {creationRange.from % 2 ? "30" : "00"}
                      </div>
                    )}
                    {dragPreview?.day === day && (
                      <div
                        className={styles.dropPreview}
                        style={{ top: dragPreview.half * 32 }}
                        aria-hidden="true"
                      >
                        {Math.floor(dragPreview.half / 2)}:
                        {dragPreview.half % 2 ? "30" : "00"}
                      </div>
                    )}
                    {dayGroups[day].flatMap(({ group, layout }) => {
                      if (!layout) {
                        const start = Math.max(
                          group[0].startMs,
                          instantFor(day, zone),
                        );
                        const end = Math.min(
                          Math.max(...group.map((e) => e.endMs)),
                          instantFor(addDays(day, 1), zone),
                        );
                        const local = localFor(start, zone),
                          top =
                            (Number(local.slice(11, 13)) +
                              Number(local.slice(14, 16)) / 60) *
                            64;
                        return [
                          <button
                            key={`overlap-${group[0].id}`}
                            className={styles.overlap}
                            style={{
                              top,
                              height: Math.max(
                                48,
                                ((end - start) / 3600000) * 64 - 2,
                              ),
                            }}
                            onClick={() => {
                              setOverlapQuery("");
                              setOverlapLimit(50);
                              setOverlap(group);
                            }}
                            aria-label={`${group.length} overlapping events on ${labelDate(day)}: ${group
                              .slice(0, 3)
                              .map((e) => e.title)
                              .join(
                                ", ",
                              )}${group.length > 3 ? ` and ${group.length - 3} others` : ""}`}
                          >
                            <strong>{group.length} overlapping events</strong>
                            <span>
                              {timeLabel(start, zone)}–{timeLabel(end, zone)}
                            </span>
                            <small>View events</small>
                          </button>,
                        ];
                      }
                      return layout.map((item) => {
                        const localStart = localFor(
                            Math.max(item.startMs, instantFor(day, zone)),
                            zone,
                          ),
                          localEnd = localFor(
                            Math.min(
                              item.endMs,
                              instantFor(addDays(day, 1), zone),
                            ),
                            zone,
                          );
                        const minute = (value: string) =>
                          Number(value.slice(11, 13)) * 60 +
                          Number(value.slice(14, 16));
                        const top = (minute(localStart) / 60) * 64,
                          end =
                            localEnd.slice(0, 10) > day
                              ? 1536
                              : (minute(localEnd) / 60) * 64;
                        return eventButton(item, {
                          top,
                          left: `calc(${(item.column / item.columns) * 100}% + 3px)`,
                          width: `calc(${100 / item.columns}% - 6px)`,
                          height: Math.max(24, end - top - 2),
                        });
                      });
                    })}
                    {day === localDate(new Date(now), zone) && (
                      <div
                        className={styles.now}
                        style={{
                          top:
                            (Number(localFor(now, zone).slice(11, 13)) +
                              Number(localFor(now, zone).slice(14, 16)) / 60) *
                            64,
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <WorkspaceSheet
        open={Boolean(overlap)}
        onClose={() => setOverlap(undefined)}
        title="Overlapping events"
      >
        {(overlap?.length || 0) > 50 && (
          <label className="work-form">
            Find an overlapping event
            <input
              type="search"
              value={overlapQuery}
              onChange={(e) => {
                setOverlapQuery(e.target.value);
                setOverlapLimit(50);
              }}
            />
          </label>
        )}
        {overlapMatches.length > overlapLimit && (
          <p className="work-muted">
            Showing {overlapLimit} of {overlapMatches.length} events.
          </p>
        )}
        {overlapMatches.slice(0, overlapLimit).map((item) => (
          <button
            className="work-row"
            key={item.id}
            onClick={() => {
              setOverlap(undefined);
              const event = snapshot?.state.events.find(
                (e) => e.id === item.eventId,
              );
              if (event) openEvent(event, item);
            }}
          >
            <div>
              <strong>{item.title}</strong>
              <span>
                {timeLabel(item.startMs, zone)}–{timeLabel(item.endMs, zone)}
              </span>
              {item.location && <small>{item.location}</small>}
            </div>
          </button>
        ))}
        {overlapMatches.length > overlapLimit && (
          <Button onClick={() => setOverlapLimit((limit) => limit + 50)}>
            Show next 50 events
          </Button>
        )}
        {overlapQuery && !overlapMatches.length && (
          <p>No overlapping events match this search.</p>
        )}
      </WorkspaceSheet>
      <WorkspaceSheet
        open={Boolean(editor)}
        onClose={() => setEditor(undefined)}
        title={editor?.original ? "Edit event" : "New event"}
      >
        {editor && (
          <form className="work-form" onSubmit={save}>
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
            <label className="work-check">
              <input
                type="checkbox"
                checked={editor.fields.allDay}
                onChange={(e) => {
                  const allDay = e.target.checked;
                  setEditor({
                    ...editor,
                    fields: {
                      ...editor.fields,
                      allDay,
                      start: allDay
                        ? editor.fields.start.slice(0, 10)
                        : `${editor.fields.start.slice(0, 10)}T09:00`,
                      end: allDay
                        ? addDays(editor.fields.start.slice(0, 10), 1)
                        : `${editor.fields.start.slice(0, 10)}T10:00`,
                    },
                  });
                }}
              />
              All day
            </label>
            <div className="work-form-pair">
              <DateField
                label="Starts"
                value={editor.fields.start.slice(0, 10)}
                onChange={(value) =>
                  update(
                    "start",
                    editor.fields.allDay
                      ? value
                      : `${value}T${editor.fields.start.slice(11, 16)}`,
                  )
                }
              />
              <DateField
                label={editor.fields.allDay ? "Through" : "Ends"}
                value={
                  editor.fields.allDay
                    ? addDays(editor.fields.end, -1)
                    : editor.fields.end.slice(0, 10)
                }
                onChange={(value) =>
                  update(
                    "end",
                    editor.fields.allDay
                      ? addDays(value, 1)
                      : `${value}T${editor.fields.end.slice(11, 16)}`,
                  )
                }
              />
            </div>
            {!editor.fields.allDay && (
              <div className="work-form-pair">
                <TimeField
                  label="Start time"
                  value={editor.fields.start.slice(11, 16)}
                  onChange={(value) =>
                    update(
                      "start",
                      `${editor.fields.start.slice(0, 10)}T${value}`,
                    )
                  }
                />
                <TimeField
                  label="End time"
                  value={editor.fields.end.slice(11, 16)}
                  onChange={(value) =>
                    update("end", `${editor.fields.end.slice(0, 10)}T${value}`)
                  }
                />
              </div>
            )}
            <details className="work-form-options">
              <summary>Calendar, repeat, people and location</summary>
              <label>
                Time zone
                <input
                  required
                  value={editor.fields.timeZone}
                  onChange={(e) => update("timeZone", e.target.value)}
                  list="event-time-zones"
                />
              </label>
              <datalist id="event-time-zones">
                {Intl.supportedValuesOf("timeZone").map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </datalist>
              <div className="work-form-pair">
                <label>
                  Calendar
                  <SelectField
                    value={editor.fields.calendarId}
                    onChange={(e) => update("calendarId", e.target.value)}
                  >
                    {snapshot?.state.calendars
                      .filter((c) => !c.archivedAt)
                      .map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </SelectField>
                </label>
                <label>
                  Type
                  <SelectField
                    value={editor.fields.kind}
                    onChange={(e) =>
                      update("kind", e.target.value as EventFields["kind"])
                    }
                  >
                    <option value="event">Event</option>
                    <option value="time_block">Work block</option>
                  </SelectField>
                </label>
              </div>
              <label>
                Repeat
                <SelectField
                  value={
                    [
                      "",
                      "FREQ=DAILY",
                      "FREQ=WEEKLY",
                      "FREQ=MONTHLY",
                      "FREQ=YEARLY",
                    ].includes(editor.fields.recurrence)
                      ? editor.fields.recurrence
                      : "custom"
                  }
                  onChange={(e) => {
                    if (e.target.value !== "custom")
                      update("recurrence", e.target.value);
                  }}
                >
                  <option value="">Does not repeat</option>
                  <option value="FREQ=DAILY">Daily</option>
                  <option value="FREQ=WEEKLY">Weekly</option>
                  <option value="FREQ=MONTHLY">Monthly</option>
                  <option value="FREQ=YEARLY">Yearly</option>
                  {editor.fields.recurrence && (
                    <option value="custom">Custom imported recurrence</option>
                  )}
                </SelectField>
              </label>
              {editor.fields.recurrence && (
                <details>
                  <summary>Recurrence details</summary>
                  <label>
                    Recurrence rule
                    <input
                      value={editor.fields.recurrence}
                      onChange={(e) => update("recurrence", e.target.value)}
                      placeholder="FREQ=WEEKLY;COUNT=12"
                    />
                  </label>
                  <small>
                    COUNT limits occurrences; UNTIL sets the last recurrence
                    date.
                  </small>
                </details>
              )}
              <label>
                Reminder
                <SelectField
                  value={String(editor.fields.reminderMinutes ?? "none")}
                  onChange={(e) =>
                    update(
                      "reminderMinutes",
                      e.target.value === "none" ? null : Number(e.target.value),
                    )
                  }
                >
                  {[
                    ["none", "None"],
                    ["0", "At start"],
                    ["5", "5 minutes before"],
                    ["15", "15 minutes before"],
                    ["60", "1 hour before"],
                    ["1440", "1 day before"],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </SelectField>
                <small>
                  Shown inside Unigentamos, including missed reminders when you
                  return.
                </small>
              </label>
              <label>
                Saved place
                <SelectField
                  value={editor.fields.placeId || ""}
                  onChange={(e) => {
                    update("placeId", e.target.value || undefined);
                    const p = snapshot?.state.places.find(
                      (x) => x.id === e.target.value,
                    );
                    if (p) update("location", p.name);
                  }}
                >
                  <option value="">No saved place</option>
                  {snapshot?.state.places
                    .filter((p) => !p.archivedAt)
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                </SelectField>
              </label>
              <label>
                Location
                <input
                  value={editor.fields.location}
                  onChange={(e) => update("location", e.target.value)}
                />
              </label>
              <label>
                Description
                <textarea
                  value={editor.fields.description}
                  onChange={(e) => update("description", e.target.value)}
                />
              </label>
              <label>
                Participants (one name or email per line)
                <textarea
                  value={(editor.fields.participants || [])
                    .map((p) => p.email || p.name)
                    .join("\n")}
                  onChange={(e) =>
                    update(
                      "participants",
                      e.target.value
                        .split("\n")
                        .filter(Boolean)
                        .map((value) => ({
                          name: value,
                          ...(value.includes("@") ? { email: value } : {}),
                        })),
                    )
                  }
                />
              </label>
              <p className="work-muted">
                Participants are saved here. No invitations are sent.
              </p>
              <RecordLinks
                refs={editor.fields.linkedRefs}
                available={snapshot?.refs}
                onChange={(refs) => update("linkedRefs", refs)}
              />
              {editor.original && (
                <RelatedRecords
                  module="calendar"
                  type="event"
                  id={editor.original.id}
                />
              )}
            </details>
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
        open={connections}
        onClose={() => setConnections(false)}
        title="Calendars and connections"
      >
        <div className="work-form">
          <WorkspaceFeedback error={error} message={notice} />
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
          <section className="work-section">
            <h2>Your calendars</h2>
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
          </section>
          <section className="work-section">
            <h2>Import or subscribe</h2>
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
          </section>
          <section className="work-section">
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
          </section>
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
