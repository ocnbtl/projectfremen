/* Synthetic records and a temporary store only. Never loads local environment files. */
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  ts = require("typescript");
const fixture = fs.mkdtempSync(
  path.join(os.tmpdir(), "unigentamos-calendar-map-"),
);
Object.assign(process.env, {
  FREMEN_DATA_DIR: fixture,
  SUPABASE_URL: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  FREMEN_REQUIRE_SUPABASE: "false",
  MORGEN_API_KEY: "",
  CENSUS_API_KEY: "",
  OPENROUTESERVICE_API_KEY: "",
});
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
const {
  eventOccurrences,
  instantFor,
  calendarLayout,
  calendarOverlapGroups,
  validateEventTime,
} = require("../lib/modules/planning/calendar-model.ts");
const { emptyPlanningState } = require("../lib/modules/planning/types.ts");
const {
  savePlanningRecord,
  readPlanningState,
  normalizePlanningRecord,
  planningState,
} = require("../lib/modules/planning/store.ts");
const {
  parseCalendarFile,
  mergeImportedEvents,
} = require("../lib/modules/planning/import.ts");
const {
  publicIpv4,
  fetchMorgen,
} = require("../lib/modules/planning/providers.ts");
const { routeStops } = require("../lib/modules/planning/map-providers.ts");
const {
  reconcileCanonicalRecord,
} = require("../lib/local-first/canonical-record-server.ts");
const { canonicalMetadata } = require("../lib/local-first/canonical-record.ts");
const stamp = "2026-01-01T00:00:00.000Z";
const event = (extra = {}) => ({
  id: "series",
  createdAt: stamp,
  updatedAt: stamp,
  title: "Design review",
  description: "",
  start: "2026-03-01T09:00:00",
  end: "2026-03-01T10:00:00",
  timeZone: "America/New_York",
  allDay: false,
  calendarId: "native",
  location: "",
  linkedRefs: [],
  recurrence: "FREQ=WEEKLY;COUNT=3",
  reminderMinutes: 15,
  kind: "event",
  exceptions: {},
  ...extra,
});
const ics = (title = "Source", extra = "") =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:stable-1\r\nDTSTART;TZID=America/New_York:20260301T090000\r\nDTEND;TZID=America/New_York:20260301T100000\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nSUMMARY:${title}\r\n${extra}END:VEVENT\r\nEND:VCALENDAR\r\n`;
let passed = 0;
async function check(label, run) {
  await run();
  passed++;
  console.log(`PASS ${label}`);
}
(async () => {
  await check(
    "lightweight location validation stays separate from event time validation",
    () => {
      const {
        normalizePlanningRecord: light,
      } = require("../lib/modules/planning/record-validation.ts");
      const {
        normalizePlanningRecord: full,
      } = require("../lib/modules/planning/validation.ts");
      const stamp = new Date().toISOString();
      const place = {
        id: "light-place",
        createdAt: stamp,
        updatedAt: stamp,
        name: "Offline place",
        latitude: 39,
        longitude: -84,
        tags: [],
        linkedRefs: [],
      };
      assert.deepEqual(light("places", place), full("places", place));
      assert.throws(
        () => light("places", { ...place, latitude: 91 }),
        /valid map coordinates/,
      );
      assert.throws(() => light("events", event()), /Open Calendar/);
      assert.equal(full("events", event()).recurrence, "FREQ=WEEKLY;COUNT=3");
      assert.throws(
        () => full("events", event({ end: "2026-03-01T08:00:00" })),
        /end must be after/,
      );
    },
  );
  await check(
    "weekly appointments retain wall time across daylight saving",
    () => {
      const rows = eventOccurrences(
        [event()],
        "2026-03-01",
        "2026-03-20",
        "America/New_York",
      );
      assert.equal(rows.length, 3);
      assert.equal(
        new Date(rows[0].startMs).toISOString(),
        "2026-03-01T14:00:00.000Z",
      );
      assert.equal(
        new Date(rows[1].startMs).toISOString(),
        "2026-03-08T13:00:00.000Z",
      );
    },
  );
  await check(
    "all-day multi-day events retain calendar dates across time zones",
    () => {
      const rows = eventOccurrences(
        [
          event({
            start: "2026-03-07",
            end: "2026-03-10",
            allDay: true,
            recurrence: "",
          }),
        ],
        "2026-03-08",
        "2026-03-09",
        "Asia/Tokyo",
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].startMs, instantFor("2026-03-07", "Asia/Tokyo"));
    },
  );
  await check(
    "moved and cancelled occurrences preserve the other appointments",
    () => {
      const rows = eventOccurrences(
        [
          event({
            exceptions: {
              "2026-03-08T09:00:00": { cancelled: true },
              "2026-03-15T09:00:00": {
                start: "2026-03-09T11:00:00",
                end: "2026-03-09T12:00:00",
              },
            },
          }),
        ],
        "2026-03-08",
        "2026-03-10",
        "America/New_York",
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].occurrenceKey, "2026-03-15T09:00:00");
    },
  );
  await check("overlapping and adjacent events use predictable columns", () => {
    const base = eventOccurrences(
      [event({ recurrence: "" })],
      "2026-03-01",
      "2026-03-02",
      "America/New_York",
    )[0];
    const rows = calendarLayout([
      base,
      {
        ...base,
        id: "b",
        startMs: base.startMs + 100,
        endMs: base.endMs + 100,
      },
      { ...base, id: "c", startMs: base.endMs + 100, endMs: base.endMs + 1000 },
    ]);
    assert.deepEqual(
      rows.map((row) => [row.column, row.columns]),
      [
        [0, 2],
        [1, 2],
        [0, 1],
      ],
    );
  });
  await check(
    "invalid ranges, time zones, recurrence and coordinates fail before persistence",
    () => {
      assert.throws(() =>
        validateEventTime(event({ end: "2026-03-01T08:00:00" })),
      );
      assert.throws(() =>
        validateEventTime(event({ timeZone: "Mars/Olympus" })),
      );
      assert.throws(() =>
        validateEventTime(event({ recurrence: "FREQ=SECONDLY" })),
      );
      assert.throws(() =>
        normalizePlanningRecord("places", {
          id: "p",
          createdAt: stamp,
          updatedAt: stamp,
          name: "Place",
          latitude: 91,
          longitude: 0,
        }),
      );
      assert.throws(() =>
        normalizePlanningRecord(
          "events",
          event({ overrides: { title: "x".repeat(1000) } }),
        ),
      );
    },
  );
  await check(
    "stable imports deduplicate, preserve local edits and replace upstream exceptions",
    () => {
      const first = parseCalendarFile(
        ics("Source", "EXDATE;TZID=America/New_York:20260308T090000\r\n"),
        "connection",
        "native",
        "UTC",
      );
      first[0].overrides = { title: "Local title" };
      first[0].exceptions = {
        "2026-03-15T09:00:00": { location: "Local room" },
      };
      let state = { ...emptyPlanningState(), events: first };
      const next = parseCalendarFile(
        ics("Upstream changed"),
        "connection",
        "native",
        "UTC",
      );
      state = mergeImportedEvents(state, next, "connection");
      state = mergeImportedEvents(state, next, "connection");
      assert.equal(state.events.length, 1);
      assert.equal(state.events[0].overrides.title, "Local title");
      assert.equal(state.events[0].source.changed, true);
      assert.deepEqual(state.events[0].sourceExceptions, {});
      assert.equal(
        eventOccurrences(
          state.events,
          "2026-03-01",
          "2026-03-20",
          "America/New_York",
        ).length,
        3,
      );
    },
  );
  await check(
    "additional recurrence dates and UTC exclusions preserve source appointments",
    () => {
      const imported = parseCalendarFile(
        ics(
          "Extra dates",
          "RDATE;TZID=America/New_York:20260304T090000,20260308T090000\r\nEXDATE:20260308T130000Z\r\n",
        ),
        "connection",
        "native",
        "UTC",
      );
      const rows = eventOccurrences(
        imported,
        "2026-03-01",
        "2026-03-20",
        "America/New_York",
      );
      assert.deepEqual(
        rows.map((x) => x.start),
        ["2026-03-01T09:00:00", "2026-03-04T09:00:00", "2026-03-15T09:00:00"],
      );
      const once = parseCalendarFile(
        ics("Once", "RDATE:20260304T140000Z\r\n").replace(
          "RRULE:FREQ=WEEKLY;COUNT=3\r\n",
          "",
        ),
        "connection",
        "native",
        "UTC",
      );
      assert.equal(
        eventOccurrences(once, "2026-03-01", "2026-03-20", "America/New_York")
          .length,
        2,
      );
      assert.throws(
        () =>
          parseCalendarFile(
            ics("Unsupported", "EXRULE:FREQ=WEEKLY\r\n"),
            "c",
            "native",
            "UTC",
          ),
        /recurrence rules/,
      );
    },
  );
  await check(
    "mixed-zone imports and detached occurrences retain their actual times",
    () => {
      const mixed = parseCalendarFile(
        ics().replace(
          "DTEND;TZID=America/New_York:20260301T100000",
          "DTEND:20260301T150000Z",
        ),
        "connection",
        "native",
        "UTC",
      );
      assert.equal(mixed[0].end, "2026-03-01T10:00:00");
      const detached = [
        "BEGIN:VEVENT",
        "UID:stable-1",
        "RECURRENCE-ID:20260308T130000Z",
        "DTSTART:20260308T150000Z",
        "DTEND:20260308T160000Z",
        "SUMMARY:Moved instance",
        "END:VEVENT",
        "",
      ].join("\r\n");
      const imported = parseCalendarFile(
        ics().replace("END:VCALENDAR", `${detached}END:VCALENDAR`),
        "connection",
        "native",
        "UTC",
      );
      assert.equal(imported.length, 1);
      const rows = eventOccurrences(
        imported,
        "2026-03-01",
        "2026-03-20",
        "America/New_York",
      );
      assert.equal(rows.length, 3);
      assert.equal(rows[1].start, "2026-03-08T11:00:00");
      assert.equal(rows[1].end, "2026-03-08T12:00:00");
      assert.equal(rows[1].title, "Moved instance");
    },
  );
  await check(
    "complete feed removal is distinct from missing events in a window",
    () => {
      const state = {
        ...emptyPlanningState(),
        events: parseCalendarFile(ics(), "connection", "native", "UTC"),
      };
      assert.equal(
        mergeImportedEvents(state, [], "connection").events[0].source.cancelled,
        true,
      );
      assert.equal(
        mergeImportedEvents(state, [], "connection", {
          start: "2026-03-01",
          end: "2026-04-01",
        }).events[0].source.cancelled,
        false,
      );
    },
  );
  await check("malformed imports do not mutate existing data", () => {
    assert.throws(() =>
      parseCalendarFile("not a calendar", "c", "native", "UTC"),
    );
    assert.throws(() =>
      parseCalendarFile("a".repeat(2000001), "c", "native", "UTC"),
    );
  });
  await check("feed requests reject private and reserved networks", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "::1",
    ])
      assert.equal(publicIpv4(ip), false, ip);
    assert.equal(publicIpv4("8.8.8.8"), true);
  });
  await check(
    "route failures preserve input and missing credentials remain explicit",
    async () => {
      const stops = [
          [-84, 39],
          [-83, 40],
        ],
        before = JSON.stringify(stops);
      await assert.rejects(routeStops(stops, "car"), /OPENROUTESERVICE/);
      assert.equal(JSON.stringify(stops), before);
      await assert.rejects(
        routeStops(
          [
            [0, 91],
            [1, 1],
          ],
          "walk",
        ),
        /coordinates/,
      );
    },
  );
  let place;
  await check(
    "place persistence reopens the same identity and rejects stale updates",
    async () => {
      place = await savePlanningRecord("places", {
        id: "fixture-place",
        name: "Studio",
        latitude: 39,
        longitude: -84,
        address: "",
        notes: "",
        tags: ["work"],
        linkedRefs: [],
      });
      assert.equal((await readPlanningState()).places[0].id, place.id);
      await assert.rejects(
        savePlanningRecord(
          "places",
          { id: place.id, name: "Stale" },
          "outdated",
        ),
        (e) => e.status === 409,
      );
      assert.equal((await readPlanningState()).places[0].name, "Studio");
    },
  );
  await check(
    "offline conflicting coordinates are preserved for review",
    async () => {
      const changed = await savePlanningRecord(
        "places",
        { id: place.id, latitude: 40 },
        place.updatedAt,
      );
      await assert.rejects(
        reconcileCanonicalRecord({
          format: "unigentamos-canonical-command-v1",
          operation: "update",
          commandId: "conflict",
          canonicalId: `map:places:${place.id}`,
          baseUpdatedAt: place.updatedAt,
          baseFields: { latitude: 39 },
          patch: { latitude: 41 },
          queuedAt: new Date().toISOString(),
        }),
        /conflict/i,
      );
      assert.equal(
        (await readPlanningState()).places[0].latitude,
        changed.latitude,
      );
    },
  );
  await check(
    "offline creation is idempotent and rejects trusted source fields",
    async () => {
      const command = {
        format: "unigentamos-canonical-command-v1",
        operation: "create",
        commandId: "create",
        canonicalId: "calendar:events:offline-event",
        baseUpdatedAt: null,
        baseFields: {},
        patch: Object.fromEntries(
          Object.entries(event({ recurrence: "" })).filter(
            ([key]) => !["id", "createdAt", "updatedAt"].includes(key),
          ),
        ),
        queuedAt: new Date().toISOString(),
      };
      await reconcileCanonicalRecord(command);
      await reconcileCanonicalRecord(command);
      assert.equal(
        (await readPlanningState()).events.filter(
          (e) => e.id === "offline-event",
        ).length,
        1,
      );
      await assert.rejects(
        reconcileCanonicalRecord({
          ...command,
          patch: { ...command.patch, source: { uid: "forged" } },
        }),
        /not editable/,
      );
      assert.equal(
        canonicalMetadata({
          module: "map",
          collection: "places",
          recordId: "a b",
        }).route,
        "/admin/map?selected=a%20b",
      );
    },
  );
  await check(
    "additive planning initialization is repeatable and rejects future schema writes",
    async () => {
      const before = fs.readFileSync(
        path.join(fixture, "planning-records.json"),
        "utf8",
      );
      await readPlanningState();
      await readPlanningState();
      assert.equal(
        fs.readFileSync(path.join(fixture, "planning-records.json"), "utf8"),
        before,
      );
      assert.throws(() => planningState({ schemaVersion: 2 }), /newer/);
      const {
        readPersonalLifeState,
      } = require("../lib/modules/personal-life/store.ts");
      const legacy = {
        schemaVersion: 1,
        lists: [],
        buildItems: [],
        vehicles: [],
        trips: [
          {
            id: "old-trip",
            createdAt: stamp,
            updatedAt: stamp,
            name: "Existing trip",
            place: "Cincinnati",
            region: "Ohio",
            status: "planned",
            travelMode: "car",
            latitude: 39,
            longitude: -84,
            startDate: "",
            endDate: "",
            notes: "Keep me",
          },
        ],
      };
      fs.writeFileSync(
        path.join(fixture, "personal-life.json"),
        JSON.stringify(legacy),
      );
      const first = await readPersonalLifeState(),
        second = await readPersonalLifeState();
      assert.deepEqual(first, second);
      assert.equal(first.trips[0].id, "old-trip");
      assert.equal(first.trips[0].notes, "Keep me");
      assert.deepEqual(
        JSON.parse(
          fs.readFileSync(path.join(fixture, "personal-life.json"), "utf8"),
        ),
        legacy,
      );
      const updated = {
        ...first.trips[0],
        stops: [
          {
            id: "stop-a",
            name: "First",
            latitude: 39,
            longitude: -84,
            notes: "",
            arrival: "",
          },
        ],
      };
      const command = {
        format: "unigentamos-canonical-command-v1",
        operation: "update",
        commandId: "trip-edit",
        canonicalId: "personal-life:trips:old-trip",
        baseUpdatedAt: stamp,
        baseFields: { stops: [] },
        patch: { stops: updated.stops },
        queuedAt: stamp,
      };
      await reconcileCanonicalRecord(command);
      assert.equal(
        (await readPersonalLifeState()).trips[0].stops[0].id,
        "stop-a",
      );
      await assert.rejects(
        reconcileCanonicalRecord({
          ...command,
          commandId: "conflicting-trip",
          patch: { stops: [{ ...updated.stops[0], name: "Other order" }] },
        }),
        /conflict/,
      );
      assert.equal(
        canonicalMetadata({
          module: "personal-life",
          collection: "trips",
          recordId: "old-trip",
        }).route,
        "/admin/personal/travel?selected=old-trip",
      );
    },
  );
  await check(
    "dense calendar clusters are separated from adjacent appointments",
    () => {
      const base = eventOccurrences(
        [event({ recurrence: "" })],
        "2026-03-01",
        "2026-03-02",
        "UTC",
      )[0];
      assert.deepEqual(
        calendarOverlapGroups([
          base,
          { ...base, id: "b" },
          { ...base, id: "c" },
          { ...base, id: "d", startMs: base.endMs, endMs: base.endMs + 60000 },
        ]).map((g) => g.length),
        [3, 1],
      );
    },
  );
  await check(
    "Morgen verifies absent events by ID and preserves data on provider failures",
    async () => {
      const { morgenEvent } = require("../lib/modules/planning/import.ts");
      const raw = {
        id: "opaque",
        calendarId: "cal",
        accountId: "acct",
        title: "Source event",
        start: "2026-03-01T09:00:00",
        duration: "PT1H",
        timeZone: "America/New_York",
        locations: { room: { name: "Room 4" } },
        participants: {
          one: { name: "Alexandra", email: "alexandra@example.test" },
        },
      };
      const prior = morgenEvent(raw, "morgen", "acct", "cal");
      assert.equal(prior.location, "Room 4");
      assert.equal(prior.participants[0].name, "Alexandra");
      const originalFetch = global.fetch;
      process.env.MORGEN_API_KEY = "isolated-fixture";
      let missingStatus = 404;
      global.fetch = async (url, options) => {
        assert.ok(!options.method || options.method === "GET");
        if (String(url).includes("calendars/list"))
          return new Response(
            JSON.stringify({
              data: {
                calendars: [{ id: "cal", accountId: "acct", name: "Work" }],
              },
            }),
          );
        if (String(url).includes("events/list"))
          return new Response(JSON.stringify({ data: { events: [] } }));
        return new Response("{}", { status: missingStatus });
      };
      try {
        const result = await fetchMorgen(
          {
            id: "morgen",
            name: "Work",
            kind: "morgen",
            createdAt: stamp,
            updatedAt: stamp,
          },
          "2026-03-01T00:00:00Z",
          "2026-04-01T00:00:00Z",
          [prior],
        );
        assert.equal(result.events[0].source.cancelled, true);
        missingStatus = 503;
        await assert.rejects(
          fetchMorgen(
            { id: "morgen" },
            "2026-03-01T00:00:00Z",
            "2026-04-01T00:00:00Z",
            [prior],
          ),
          /unchanged/,
        );
        assert.equal(prior.source.cancelled, false);
      } finally {
        global.fetch = originalFetch;
        process.env.MORGEN_API_KEY = "";
      }
    },
  );
  await check(
    "UTC recurrence end includes the correct final local occurrence",
    () => {
      for (const [timeZone, until] of [
        ["Asia/Tokyo", "20260303T000000Z"],
        ["America/New_York", "20260303T140000Z"],
      ]) {
        const items = eventOccurrences(
          [
            event({
              start: "2026-03-01T09:00:00",
              end: "2026-03-01T10:00:00",
              timeZone,
              recurrence: `FREQ=DAILY;UNTIL=${until}`,
            }),
          ],
          "2026-03-01",
          "2026-03-05",
          timeZone,
        );
        assert.equal(items.length, 3);
        assert.equal(items[2].start.slice(0, 10), "2026-03-03");
      }
    },
  );
  await check(
    "planning backup restoration preserves identities and accepts additive writes again",
    async () => {
      const file = path.join(fixture, "planning-records.json");
      const before = fs.readFileSync(file);
      const ids = (await readPlanningState()).places.map((item) => item.id);
      fs.writeFileSync(
        path.join(fixture, "planning-records.backup.json"),
        before,
      );
      await savePlanningRecord("places", {
        id: "rollback-rehearsal",
        name: "Temporary rollback fixture",
        latitude: 1,
        longitude: 2,
        address: "",
        notes: "",
        tags: [],
        linkedRefs: [],
      });
      fs.writeFileSync(file, before);
      assert.deepEqual(
        (await readPlanningState()).places.map((item) => item.id),
        ids,
      );
      assert.deepEqual(fs.readFileSync(file), before);
      const restored = await savePlanningRecord("places", {
        id: "rollback-rehearsal",
        name: "Reapplied fixture",
        latitude: 1,
        longitude: 2,
        address: "",
        notes: "",
        tags: [],
        linkedRefs: [],
      });
      assert.equal(restored.id, "rollback-rehearsal");
      assert.equal(
        (await readPlanningState()).places.filter(
          (item) => item.id === restored.id,
        ).length,
        1,
      );
    },
  );
  await check(
    "calendar groups and five-minute event times persist through canonical reconciliation",
    async () => {
      const before = (await readPlanningState()).calendars.find(
        (c) => c.id === "native",
      );
      const groups = [
        { id: "study", name: "Study", color: "#59518B", icon: "university" },
      ];
      const calendar = await savePlanningRecord(
        "calendars",
        { id: "native", groups },
        before.updatedAt,
      );
      assert.deepEqual(calendar.groups, groups);
      await reconcileCanonicalRecord({
        format: "unigentamos-canonical-command-v1",
        operation: "update",
        commandId: "group-sync",
        canonicalId: "calendar:calendars:native",
        baseUpdatedAt: calendar.updatedAt,
        baseFields: { groups },
        patch: {
          groups: [
            ...groups,
            { id: "work", name: "Work", color: "#50752F", icon: "briefcase" },
          ],
        },
        queuedAt: new Date().toISOString(),
      });
      assert.equal(
        (await readPlanningState()).calendars.find((c) => c.id === "native")
          .groups.length,
        2,
      );
      const saved = await savePlanningRecord(
        "events",
        event({
          id: "five-minute",
          start: "2026-03-01T08:05",
          end: "2026-03-01T08:10",
          recurrence: "",
          groupId: "study",
        }),
      );
      assert.equal(saved.groupId, "study");
      assert.equal(saved.end, "2026-03-01T08:10");
      await reconcileCanonicalRecord({
        format: "unigentamos-canonical-command-v1",
        operation: "update",
        commandId: "event-group-sync",
        canonicalId: "calendar:events:five-minute",
        baseUpdatedAt: saved.updatedAt,
        baseFields: { groupId: "study" },
        patch: { groupId: "work" },
        queuedAt: new Date().toISOString(),
      });
      assert.equal(
        (await readPlanningState()).events.find((e) => e.id === "five-minute")
          .groupId,
        "work",
      );
      assert.equal(
        eventOccurrences(
          [saved],
          "2026-03-01",
          "2026-03-02",
          "America/New_York",
        )[0].groupId,
        "study",
      );
      assert.throws(
        () =>
          normalizePlanningRecord("calendars", {
            ...calendar,
            groups: [...groups, ...groups],
          }),
        /unique groups/,
      );
      const {
        planningWritableKeys,
      } = require("../lib/modules/planning/ownership.ts");
      assert(planningWritableKeys("calendars").includes("groups"));
      assert(planningWritableKeys("events").includes("groupId"));
    },
  );
  await check(
    "clearing an occurrence group or place survives JSON persistence",
    () => {
      const raw = event({
        groupId: "work",
        placeId: "studio",
        exceptions: { "2026-03-01T09:00:00": { groupId: "", placeId: "" } },
      });
      const normalized = JSON.parse(
        JSON.stringify(normalizePlanningRecord("events", raw)),
      );
      const occurrences = eventOccurrences(
        [normalized],
        "2026-03-01",
        "2026-03-09",
        "America/New_York",
      );
      assert.equal(occurrences[0].groupId, "");
      assert.equal(occurrences[0].placeId, "");
      assert.equal(occurrences[1].groupId, "work");
    },
  );
  await check(
    "map filters join by region, distinguish missing data, and reject mismatched releases",
    () => {
      const {
        mapAnalysis,
      } = require("../lib/modules/planning/map-analysis.ts");
      const data = (values) => ({
        rows: values.map((v, i) => ({
          id: String(i),
          name: String(i),
          value: v,
          year: "2020-2024",
        })),
        source: "fixture",
        sourceUrl: "https://example.test",
        period: "2020-2024",
        unit: "people",
        geography: "state",
        geometry: { type: "FeatureCollection", features: [] },
      });
      const settings = {
        metrics: [
          { metric: "population", min: 20 },
          { metric: "income", min: 40 },
        ],
        match: "all",
        scale: "quantile",
      };
      const result = mapAnalysis(
        [data([10, 20, 30, null]), data([100, 35, 50, 500])],
        settings,
      );
      assert.equal(result.matched, 1);
      assert.equal(result.rows[2].matches, true);
      assert.equal(result.rows[3].matches, false);
      assert.equal(
        mapAnalysis([data([10, 20, 30, null]), data([100, 35, 50, null])], {
          ...settings,
          match: "any",
        }).matched,
        3,
      );
      assert.throws(
        () =>
          mapAnalysis(
            [data([1]), { ...data([2]), period: "2019-2023" }],
            settings,
          ),
        /releases cannot be combined/,
      );
      assert.throws(
        () =>
          normalizePlanningRecord("savedViews", {
            id: "bad",
            createdAt: stamp,
            updatedAt: stamp,
            name: "Bad",
            center: [0, 0],
            analysis: {
              ...settings,
              metrics: [{ metric: "population", min: 50, max: 1 }],
            },
          }),
        /minimum/,
      );
    },
  );
  await check("world boundaries are clipped at the antimeridian", () => {
    const { clipCountry } = require("../lib/modules/planning/map-providers.ts");
    const { feature } = require("topojson-client"),
      world = require("world-atlas/countries-110m.json");
    for (const name of ["Russia", "Canada", "Fiji"]) {
      const source = feature(world, world.objects.countries).features.find(
        (f) => f.properties.name === name,
      );
      const clipped = clipCountry(source.geometry);
      assert(clipped.coordinates.length);
      for (const polygon of clipped.coordinates)
        for (const ring of polygon) {
          assert.deepEqual(ring[0], ring.at(-1));
          for (let i = 1; i < ring.length; i++)
            assert(
              Math.abs(ring[i][0] - ring[i - 1][0]) <= 180.00001,
              name + " crosses the whole map",
            );
        }
    }
  });
  await check(
    "bundled city estimates preserve official GEOIDs, missing values and margins of error",
    () => {
      const data = require("../data/map/census-places-2024.json");
      assert.equal(data.period, "2020–2024");
      assert.equal(data.rows.length, 32330);
      assert.equal(
        new Set(data.rows.map((row) => row[0])).size,
        data.rows.length,
      );
      assert.equal(
        data.rows.filter((row) => row[0].startsWith("39")).length,
        1265,
      );
      assert(
        data.sources.every(
          (source) =>
            source.url.startsWith("https://www2.census.gov/") &&
            /^[a-f0-9]{64}$/.test(source.sha256),
        ),
      );
      for (const row of data.rows) {
        assert(/^\d{7}$/.test(row[0]));
        assert.equal(row.length, 7);
        assert(
          row
            .slice(1)
            .every(
              (value) =>
                value === null || (Number.isFinite(value) && value >= 0),
            ),
        );
      }
      assert(data.rows.some((row) => row[5] === null));
      assert.deepEqual(
        data.rows.find((row) => row[0] === "3915000"),
        ["3915000", 311224, 60, 33.2, 0.4, 52909, 1946],
      );
    },
  );
  await check(
    "large map responses stream complete JSON while remaining private",
    async () => {
      const {
        privateJsonStream,
      } = require("../lib/modules/planning/json-stream.ts");
      const body = { ok: true, data: "Place 📍 Québec – ".repeat(350000) };
      const response = privateJsonStream(body);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      assert.equal(response.headers.get("Content-Length"), null);
      assert.deepEqual(await response.json(), body);
    },
  );
  console.log(
    `${passed} planning behavior checks passed. Isolated fixture: ${fixture}`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
