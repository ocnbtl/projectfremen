import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../lib/admin-session";
import { isCsrfRequestValid } from "../../../lib/csrf";
import { appendAuditEvent, getRequestIp } from "../../../lib/audit-log";
import {
  readPlanningState,
  isPlanningCollection,
  savePlanningRecord,
  mutatePlanningState,
} from "../../../lib/modules/planning/store";
import {
  parseCalendarFile,
  mergeImportedEvents,
} from "../../../lib/modules/planning/import";
import {
  fetchCalendarFeed,
  fetchMorgen,
} from "../../../lib/modules/planning/providers";
import { readPersonalRecords } from "../../../lib/personal-records-store";
import { readPersonalLifeState } from "../../../lib/modules/personal-life/store";
import { readPersonalOpsState } from "../../../lib/modules/personal-ops/store";
import { readProjectsState } from "../../../lib/modules/projects/store";
import { createNativeObjectRef } from "../../../lib/native-objects/routes";
import { addDays } from "../../../lib/modules/planning/calendar-model";
import type {
  Calendar,
  CalendarEvent,
} from "../../../lib/modules/planning/types";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
export async function GET() {
  if (!(await hasAdminSession()))
    return json({ ok: false, error: "Unauthorized" }, 401);
  try {
    const state = await readPlanningState();
    const sources = await Promise.allSettled([
      readPersonalRecords(),
      readPersonalLifeState(),
      readPersonalOpsState(),
      readProjectsState(),
    ]);
    const records = sources[0].status === "fulfilled" ? sources[0].value : [],
      life = sources[1].status === "fulfilled" ? sources[1].value : null,
      ops = sources[2].status === "fulfilled" ? sources[2].value : null,
      projects = sources[3].status === "fulfilled" ? sources[3].value : null;
    const refs = records
      .filter((record) =>
        ["person", "org", "interaction", "note", "file", "resource"].includes(
          record.className,
        ),
      )
      .map((record) =>
        createNativeObjectRef({
          module:
            record.className === "note"
              ? "notes"
              : record.className === "file"
                ? "media"
                : record.className === "resource"
                  ? "resources"
                  : "people",
          objectType:
            record.className === "file"
              ? "media_asset"
              : record.className === "org"
                ? "organization"
                : record.className,
          objectId: record.id,
          label: record.title,
        }),
      );
    for (const ref of refs) {
      const record = records.find((r) => r.id === ref.objectId);
      if (!record) continue;
      Object.assign(ref, {
        preview: {
          imageUrl:
            record.profile?.photoUrl ||
            record.resourceProfile?.metadata?.imageUrl ||
            "",
          detail:
            [record.profile?.primaryOccupation, record.profile?.primaryEmployer]
              .filter(Boolean)
              .join(" · ") ||
            record.profile?.primaryEmail ||
            record.mediaProfile?.manifest.mimeType ||
            "",
        },
      });
    }
    for (const project of projects?.projects || [])
      refs.push(
        createNativeObjectRef({
          module: "projects",
          objectType: "project",
          objectId: project.id,
          label: project.name,
        }),
      );
    for (const item of [
      ...(ops?.obligations || []),
      ...(ops?.routines || []),
      ...(ops?.followUps || []),
    ])
      refs.push(
        createNativeObjectRef({
          module: "personal_ops",
          objectType: item.objectType,
          objectId: item.id,
          label: item.title,
        }),
      );
    for (const trip of life?.trips || [])
      refs.push(
        createNativeObjectRef({
          module: "personal_ops",
          objectType: "trip",
          objectId: trip.id,
          label: trip.name,
        }),
      );
    for (const place of state.places.filter((x) => !x.archivedAt))
      refs.push(
        createNativeObjectRef({
          module: "map",
          objectType: "place",
          objectId: place.id,
          label: place.name,
        }),
      );
    for (const event of state.events.filter((x) => !x.archivedAt))
      refs.push(
        createNativeObjectRef({
          module: "calendar",
          objectType: "event",
          objectId: event.id,
          label: event.title,
        }),
      );
    const dated = [...(ops?.obligations || []), ...(ops?.followUps || [])]
      .filter((x) => x.dueAt)
      .map((item) => ({
        id: `work-${item.id}`,
        title: item.title,
        start: item.dueAt!.slice(0, 10),
        end: addDays(item.dueAt!.slice(0, 10), 1),
        ownerRef: refs.find((x) => x.objectId === item.id),
      }));
    for (const trip of life?.trips || [])
      if (trip.startDate)
        dated.push({
          id: `trip-${trip.id}`,
          title: trip.name,
          start: trip.startDate.slice(0, 10),
          end: addDays((trip.endDate || trip.startDate).slice(0, 10), 1),
          ownerRef: refs.find((x) => x.objectId === trip.id),
        });
    for (const milestone of projects?.milestones || []) {
      if (!milestone.dueAt || milestone.archivedAt || milestone.completedAt)
        continue;
      dated.push({
        id: `milestone-${milestone.id}`,
        title: milestone.title,
        start: milestone.dueAt.slice(0, 10),
        end: addDays(milestone.dueAt.slice(0, 10), 1),
        ownerRef: createNativeObjectRef({
          module: "projects",
          objectType: "milestone",
          objectId: milestone.id,
          containerObjectId: milestone.projectId,
          label: milestone.title,
        }),
      });
    }
    return json({
      ok: true,
      state,
      refs,
      trips: life?.trips || [],
      dated,
      sourceErrors: sources.flatMap((x, i) =>
        x.status === "rejected"
          ? [["Records", "Personal", "Work", "Projects"][i]]
          : [],
      ),
      capabilities: {
        morgen: Boolean(process.env.MORGEN_API_KEY),
        census: Boolean(process.env.CENSUS_API_KEY),
        routing: Boolean(process.env.OPENROUTESERVICE_API_KEY),
      },
    });
  } catch {
    return json(
      {
        ok: false,
        error:
          "Planning records could not be loaded. Retry without changing your existing records.",
      },
      503,
    );
  }
}
export async function POST(request: Request) {
  if (!(await hasAdminSession()))
    return json({ ok: false, error: "Unauthorized" }, 401);
  if (!isCsrfRequestValid(request))
    return json({ ok: false, error: "Invalid CSRF token" }, 403);
  let refreshingId: string | undefined;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 2_500_000)
      throw new Error("This request is too large");
    const body = JSON.parse(raw);
    let result: unknown;
    if (body.operation === "save") {
      if (
        !isPlanningCollection(body.collection) ||
        !body.input ||
        typeof body.input !== "object"
      )
        throw new Error("Choose a valid record collection");
      // Source identity is created by trusted import adapters, never by form input.
      const {
        source,
        sourceExceptions,
        lastSuccessAt,
        lastAttemptAt,
        lastError,
        ...input
      } = body.input;
      void source;
      void sourceExceptions;
      void lastSuccessAt;
      void lastAttemptAt;
      void lastError;
      if (body.collection === "events") {
        const current = (await readPlanningState()).events.find(
          (x) => x.id === input.id,
        );
        if (current?.source) {
          const { id, overrides, exceptions, archivedAt, ...changes } = input;
          input.id = id;
          if (body.resetSource)
            input.source = { ...current.source, changed: false };
          input.overrides = body.resetSource
            ? undefined
            : { ...current.overrides, ...(overrides || changes) };
          input.exceptions = body.resetSource
            ? {}
            : exceptions || current.exceptions;
          if (body.keepNative) {
            input.id = undefined;
            input.overrides = undefined;
            Object.assign(input, current, current.overrides, {
              id: undefined,
              calendarId: "native",
              source: undefined,
              sourceExceptions: undefined,
              exceptions: {
                ...current.sourceExceptions,
                ...current.exceptions,
              },
              overrides: undefined,
            });
          } else {
            Object.keys(changes).forEach((key) => delete input[key]);
            input.archivedAt = archivedAt;
          }
        }
      }
      result = await savePlanningRecord(
        body.collection,
        input,
        body.keepNative ? undefined : body.expectedUpdatedAt,
      );
    } else if (body.operation === "import" || body.operation === "refresh") {
      const state = await readPlanningState(),
        connection = state.connections.find(
          (x) => x.id === body.connectionId && !x.archivedAt,
        );
      if (!connection)
        throw new Error("Choose an available calendar connection");
      if (
        body.operation === "refresh" &&
        connection.lastSuccessAt &&
        Date.now() - Date.parse(connection.lastSuccessAt) < 15 * 60_000
      )
        throw new Error(
          "This connection was refreshed recently. It can refresh again after 15 minutes.",
        );
      const calendar = state.calendars.find(
        (x) => x.connectionId === connection.id,
      );
      if (!calendar && connection.kind !== "morgen")
        throw new Error("Create a calendar for this connection first");
      if (body.operation === "refresh")
        await mutatePlanningState((current) => {
          const latest = current.connections.find(
            (c) => c.id === connection.id,
          );
          if (
            latest?.lastAttemptAt &&
            Date.now() - Date.parse(latest.lastAttemptAt) < 15 * 60000
          )
            throw Object.assign(
              new Error(
                "This connection was checked recently. Try again in 15 minutes.",
              ),
              { status: 429 },
            );
          return {
            state: {
              ...current,
              connections: current.connections.map((c) =>
                c.id === connection.id
                  ? { ...c, lastAttemptAt: new Date().toISOString() }
                  : c,
              ),
            },
            result: null,
          };
        });
      refreshingId = connection.id;
      let incoming: CalendarEvent[],
        remoteCalendars: Calendar[] | undefined,
        scope: { start: string; end: string } | undefined;
      if (connection.kind === "morgen") {
        const start = addDays(new Date().toISOString().slice(0, 10), -30),
          end = addDays(start, 60);
        const response = await fetchMorgen(
          connection,
          `${start}T00:00:00Z`,
          `${end}T00:00:00Z`,
          state.events,
        );
        incoming = response.events;
        remoteCalendars = response.calendars;
        scope = { start, end };
      } else {
        const text =
          connection.kind === "ics_feed"
            ? await fetchCalendarFeed(connection.url || "")
            : String(body.text || "");
        incoming = parseCalendarFile(
          text,
          connection.id,
          calendar!.id,
          connection.timeZone || body.timeZone || "UTC",
        );
      }
      result = await mutatePlanningState((current) => {
        let next = mergeImportedEvents(current, incoming, connection.id, scope);
        if (remoteCalendars)
          for (const calendar of remoteCalendars) {
            const old = next.calendars.find((x) => x.id === calendar.id);
            next.calendars = next.calendars
              .filter((x) => x.id !== calendar.id)
              .concat({ ...calendar, visible: old?.visible ?? true });
          }
        const now = new Date().toISOString();
        next = {
          ...next,
          connections: next.connections.map((x) =>
            x.id === connection.id
              ? {
                  ...x,
                  lastSuccessAt: now,
                  lastError: undefined,
                  updatedAt: now,
                }
              : x,
          ),
        };
        return { state: next, result: { count: incoming.length } };
      });
    } else throw new Error("Unknown planning operation");
    await appendAuditEvent({
      at: new Date().toISOString(),
      action: `planning.${body.operation}.success`,
      path: "/api/planning",
      method: "POST",
      ip: getRequestIp(request),
      status: "ok",
    });
    return json({ ok: true, item: result });
  } catch (error) {
    if (refreshingId)
      await mutatePlanningState((state) => ({
        state: {
          ...state,
          connections: state.connections.map((c) =>
            c.id === refreshingId
              ? {
                  ...c,
                  lastError:
                    error instanceof Error ? error.message : "Refresh failed",
                }
              : c,
          ),
        },
        result: null,
      })).catch(() => {});

    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Planning changes could not be saved",
      },
      Number((error as { status?: number }).status) || 400,
    );
  }
}
