"use client";
import { useState } from "react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import SelectField from "../ui/SelectField";
import RecordLinks from "./RecordLinks";
import type {
  Calendar,
  EventFields,
  EventGroup,
} from "../../lib/modules/planning/types";
import type { PlanningSnapshot } from "../../lib/modules/planning/repository";
import {
  calendarGroups,
  GROUP_ICONS,
} from "../../lib/modules/planning/calendar-groups";
import { addDays } from "../../lib/modules/planning/calendar-model";
import styles from "./CalendarWorkspace.module.css";

export default function EventEditorFields({
  fields,
  update,
  snapshot,
  busy,
  onCreateGroup,
}: {
  fields: EventFields;
  update: <K extends keyof EventFields>(key: K, value: EventFields[K]) => void;
  snapshot?: PlanningSnapshot;
  busy: boolean;
  onCreateGroup: (calendar: Calendar, group: EventGroup) => Promise<boolean>;
}) {
  const [newGroup, setNewGroup] = useState(false),
    [groupName, setGroupName] = useState("");
  const [groupColor, setGroupColor] = useState("#59518B"),
    [groupIcon, setGroupIcon] = useState("star");
  const [reminderUnit, setReminderUnit] = useState(() =>
    fields.reminderMinutes && fields.reminderMinutes % 1440 === 0
      ? 1440
      : fields.reminderMinutes && fields.reminderMinutes % 60 === 0
        ? 60
        : 1,
  );
  const calendar = snapshot?.state.calendars.find(
    (c) => c.id === fields.calendarId,
  );
  const rule = Object.fromEntries(
    fields.recurrence
      .split(";")
      .filter(Boolean)
      .map((x) => x.split("=")),
  );
  const simpleRule = Object.keys(rule).every((k) =>
    ["FREQ", "INTERVAL"].includes(k),
  );
  const placeRef = snapshot?.refs.find(
    (r) =>
      r.module === "map" &&
      r.objectType === "place" &&
      r.objectId === fields.placeId,
  );
  const linked =
    placeRef &&
    !fields.linkedRefs.some(
      (r) => r.module === "map" && r.objectId === placeRef.objectId,
    )
      ? [...fields.linkedRefs, placeRef]
      : fields.linkedRefs;
  return (
    <>
      <label>
        Description
        <textarea
          rows={2}
          placeholder="What is this time for?"
          value={fields.description}
          onChange={(e) => update("description", e.target.value)}
        />
      </label>
      <section className={styles.editorSection} aria-label="Event schedule">
        <div className={styles.editorSectionTitle}>
          <UnigentamosIcon role="clock" size={18} />
          <strong>Date & time</strong>
          <label className={styles.quietToggle}>
            <input
              type="checkbox"
              checked={fields.allDay}
              onChange={(e) => {
                update("allDay", e.target.checked);
                update(
                  "start",
                  e.target.checked
                    ? fields.start.slice(0, 10)
                    : `${fields.start.slice(0, 10)}T09:00`,
                );
                update(
                  "end",
                  e.target.checked
                    ? addDays(fields.start.slice(0, 10), 1)
                    : `${fields.start.slice(0, 10)}T10:00`,
                );
              }}
            />
            All day
          </label>
        </div>
        <div className="work-form-pair">
          {(["start", "end"] as const).map((key) => (
            <label key={key}>
              {key === "start" ? "Start" : "End"}
              <input
                required
                type={fields.allDay ? "date" : "datetime-local"}
                step={
                  fields.allDay
                    ? 1
                    : Number(fields[key].slice(14, 16)) % 5 === 0
                      ? 300
                      : 60
                }
                value={
                  fields.allDay
                    ? key === "end"
                      ? addDays(fields.end, -1)
                      : fields.start
                    : fields[key].slice(0, 16)
                }
                onChange={(e) => {
                  if (e.target.value)
                    update(
                      key,
                      fields.allDay && key === "end"
                        ? addDays(e.target.value, 1)
                        : e.target.value,
                    );
                }}
              />
            </label>
          ))}
        </div>
        <div className="work-form-pair">
          <label>
            Calendar
            <SelectField
              value={fields.calendarId}
              onChange={(e) => {
                update("calendarId", e.target.value);
                update("groupId", "");
              }}
            >
              {snapshot?.state.calendars
                .filter((c) => !c.archivedAt)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </SelectField>
          </label>
          <label>
            Time zone
            <input
              required
              value={fields.timeZone}
              list="event-time-zones"
              onChange={(e) => update("timeZone", e.target.value)}
            />
          </label>
        </div>
        <datalist id="event-time-zones">
          {Intl.supportedValuesOf("timeZone").map((z) => (
            <option key={z}>{z}</option>
          ))}
        </datalist>
      </section>
      <section
        className={styles.editorSection}
        aria-label="Repeat and reminder"
      >
        <div className={styles.editorSectionTitle}>
          <UnigentamosIcon role="routine" size={18} />
          <strong>Repeat & remind</strong>
        </div>
        <div className={styles.inlineFields}>
          <label className={styles.quietToggle}>
            <input
              type="checkbox"
              checked={Boolean(fields.recurrence)}
              onChange={(e) =>
                update(
                  "recurrence",
                  e.target.checked ? "FREQ=WEEKLY;INTERVAL=1" : "",
                )
              }
            />
            Repeat
          </label>
          {fields.recurrence && simpleRule && (
            <>
              <span>Every</span>
              <input
                aria-label="Repeat interval"
                type="number"
                min={1}
                max={365}
                value={rule.INTERVAL || 1}
                onChange={(e) =>
                  update(
                    "recurrence",
                    `FREQ=${rule.FREQ || "WEEKLY"};INTERVAL=${e.target.value}`,
                  )
                }
              />
              <SelectField
                aria-label="Repeat unit"
                value={rule.FREQ}
                onChange={(e) =>
                  update(
                    "recurrence",
                    `FREQ=${e.target.value};INTERVAL=${rule.INTERVAL || 1}`,
                  )
                }
              >
                {[
                  ["DAILY", "days"],
                  ["WEEKLY", "weeks"],
                  ["MONTHLY", "months"],
                  ["YEARLY", "years"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </SelectField>
            </>
          )}
        </div>
        {fields.recurrence && !simpleRule && (
          <label>
            Custom recurrence
            <input
              value={fields.recurrence}
              onChange={(e) => update("recurrence", e.target.value)}
            />
            <small>
              Imported recurrence is preserved, including its end date and
              exceptions.
            </small>
          </label>
        )}
        <div className={styles.inlineFields}>
          <UnigentamosIcon role="reminder" size={18} />
          <label className={styles.quietToggle}>
            <input
              type="checkbox"
              checked={fields.reminderMinutes !== null}
              onChange={(e) =>
                update("reminderMinutes", e.target.checked ? 15 : null)
              }
            />
            Reminder
          </label>
          {fields.reminderMinutes !== null && (
            <>
              <input
                aria-label="Reminder amount"
                type="number"
                min={0}
                max={43200 / reminderUnit}
                step="any"
                value={Number(
                  (fields.reminderMinutes / reminderUnit).toFixed(5),
                )}
                onChange={(e) =>
                  update(
                    "reminderMinutes",
                    Math.round(Number(e.target.value) * reminderUnit),
                  )
                }
              />
              <SelectField
                aria-label="Reminder unit"
                value={String(reminderUnit)}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  update(
                    "reminderMinutes",
                    Math.min(
                      43200,
                      Math.round(
                        ((fields.reminderMinutes || 0) / reminderUnit) * next,
                      ),
                    ),
                  );
                  setReminderUnit(next);
                }}
              >
                <option value="1">minutes before</option>
                <option value="60">hours before</option>
                <option value="1440">days before</option>
              </SelectField>
            </>
          )}
        </div>
        <small className="work-muted">
          Reminders appear inside Unigentamos.
        </small>
      </section>
      <section className={styles.editorSection} aria-label="Color groups">
        <div className={styles.editorSectionTitle}>
          <UnigentamosIcon role="palette" size={18} />
          <strong>Color group</strong>
        </div>
        <div className={styles.groupChoices}>
          <button
            type="button"
            aria-pressed={!fields.groupId}
            onClick={() => update("groupId", "")}
          >
            None
          </button>
          {calendarGroups(calendar).map((g) => (
            <button
              type="button"
              key={g.id}
              aria-pressed={g.id === fields.groupId}
              style={{ "--group-color": g.color } as React.CSSProperties}
              onClick={() => update("groupId", g.id)}
            >
              <UnigentamosIcon role={g.icon} size={16} />
              {g.name}
            </button>
          ))}
          <button
            type="button"
            aria-expanded={newGroup}
            onClick={() => setNewGroup(!newGroup)}
          >
            <UnigentamosIcon role="plus" size={16} />
            Create group
          </button>
        </div>
        {newGroup && (
          <div className={styles.newGroup}>
            <label>
              Group name
              <input
                maxLength={80}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
            </label>
            <label>
              Color
              <input
                type="color"
                value={groupColor}
                onChange={(e) => setGroupColor(e.target.value)}
              />
            </label>
            <div
              className={styles.groupChoices}
              role="group"
              aria-label="Group icon"
            >
              {GROUP_ICONS.map((icon) => (
                <button
                  type="button"
                  aria-label={icon}
                  aria-pressed={icon === groupIcon}
                  key={icon}
                  onClick={() => setGroupIcon(icon)}
                >
                  <UnigentamosIcon role={icon} size={18} />
                </button>
              ))}
            </div>
            <button
              type="button"
              className="work-button"
              disabled={busy || !groupName.trim() || !calendar}
              onClick={async () => {
                if (!calendar) return;
                const group = {
                  id: crypto.randomUUID(),
                  name: groupName.trim(),
                  color: groupColor,
                  icon: groupIcon,
                };
                if (await onCreateGroup(calendar, group)) {
                  update("groupId", group.id);
                  setNewGroup(false);
                  setGroupName("");
                }
              }}
            >
              Save group
            </button>
          </div>
        )}
      </section>
      <section className={styles.editorSection} aria-label="Linked objects">
        <div className={styles.editorSectionTitle}>
          <UnigentamosIcon role="link" size={18} />
          <strong>Linked objects</strong>
        </div>
        <RecordLinks
          refs={linked}
          available={snapshot?.refs}
          onChange={(refs) => {
            update("linkedRefs", refs);
            const place = refs.find(
              (r) => r.module === "map" && r.objectType === "place",
            );
            update("placeId", place?.objectId || "");
            if (place && place.objectId !== fields.placeId)
              update(
                "location",
                snapshot?.state.places.find((p) => p.id === place.objectId)
                  ?.address || place.label,
              );
          }}
        />
        <label>
          Address or meeting link
          <input
            placeholder="Optional location details"
            value={fields.location}
            onChange={(e) => update("location", e.target.value)}
          />
        </label>
        {!!fields.participants?.length && (
          <div>
            <small className="work-muted">Imported participants</small>
            <p>
              {fields.participants.map((p) => p.name || p.email).join(", ")}
            </p>
          </div>
        )}
        <label className={styles.quietToggle}>
          <input
            type="checkbox"
            checked={fields.kind === "time_block"}
            onChange={(e) =>
              update("kind", e.target.checked ? "time_block" : "event")
            }
          />
          Reserve as a work block
        </label>
      </section>
    </>
  );
}
