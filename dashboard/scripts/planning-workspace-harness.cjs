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
  await check("custom repeat interpretation, persistence, leap years and current birthdays", () => {
    const {parseRepeatLanguage,anchoredDay}=require("../lib/modules/planning/repeat-language.ts");
    const people=[{ref:{module:"people",objectType:"person",objectId:"jon",label:"Jonathan Marshall",route:"/admin/people/jon"},birthday:"--03-01"}];
    const parse=text=>parseRepeatLanguage(text,people);
    assert.equal(parse("repeat every 17 days").recurrence,"FREQ=DAILY;INTERVAL=17");
    assert.equal(parse("every weekday").recurrence,"FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    assert.equal(parse("every last Friday").recurrence,"FREQ=MONTHLY;BYDAY=-1FR");
    assert.equal(parse("every Monday and Thursday for 4 times").recurrence,"FREQ=WEEKLY;BYDAY=MO,TH;COUNT=4");
    const halloween=parse("repeat every year 10 days before Halloween");
    assert.equal(anchoredDay(halloween.recurrenceAnchor,2028),"2028-10-21");
    assert.equal(anchoredDay(parse("every Halloween").recurrenceAnchor,2027),"2027-10-31");
    const birthday=parse("repeat three days before Jonathan's birthday");
    assert.equal(anchoredDay(birthday.recurrenceAnchor,2027,people),"2027-02-26");
    assert.equal(anchoredDay(birthday.recurrenceAnchor,2028,people),"2028-02-27");
    assert.equal(anchoredDay(birthday.recurrenceAnchor,2028,[{...people[0],birthday:"--03-02"}]),"2028-02-28");
    assert.equal(anchoredDay(birthday.recurrenceAnchor,2028,[]),null);
    assert.throws(()=>parseRepeatLanguage("three days before Jonathan's birthday",[...people,{...people[0],ref:{...people[0].ref,objectId:"jon2",label:"Jonathan Smith"}}]),/full name/);
    assert.throws(()=>parse("every 0 days"));assert.throws(()=>parse("every year on February 30"));assert.throws(()=>parse("whenever I feel like it"));
    const recurring=normalizePlanningRecord("events",event({...halloween,start:"2026-01-01T09:00",end:"2026-01-01T10:00"}));
    assert.deepEqual(recurring.recurrenceAnchor,halloween.recurrenceAnchor);
    assert.deepEqual(eventOccurrences([recurring],"2026-01-01","2029-01-01","UTC").map(e=>e.start.slice(0,10)),["2026-10-21","2027-10-21","2028-10-21"]);
    const crossYear=event({...parse("3 days before New Year's Day"),start:"2026-01-01T09:00",end:"2026-01-01T10:00"});
    assert.equal(eventOccurrences([crossYear],"2026-12-01","2027-01-01","UTC")[0].start.slice(0,10),"2026-12-29");
    const recurringBirthday=event({...birthday,start:"2026-01-01T09:00",end:"2026-01-01T10:00"});
    assert.equal(eventOccurrences([recurringBirthday],"2028-02-01","2028-03-10","UTC",people)[0].start.slice(0,10),"2028-02-27");
    assert.equal(eventOccurrences([recurringBirthday],"2028-02-01","2028-03-10","UTC",[]).length,0);
    assert.equal(normalizePlanningRecord("events",event({reminderMinutes:20160})).reminderMinutes,20160);
    assert.throws(()=>normalizePlanningRecord("events",event({...halloween,recurrence:"FREQ=DAILY"})),/annual/);
  });
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
      await assert.rejects(routeStops(stops, "van"), /OPENROUTESERVICE/);
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
  await check("van trips retain their mode, route and stop notes through normalization", () => {
    const { normalizeTrip } = require("../lib/modules/personal-life/trip-schema.ts");
    const input = { name: "Van weekend", place: "Lake", travelMode: "van", latitude: 39, longitude: -84,
      stops: [{id:"first",name:"Lake",latitude:39,longitude:-84,notes:"Campsite booked",arrival:"2026-10-10T16:00"}],
      route: {type:"FeatureCollection",features:[],mode:"van",distance:1000,duration:120,legs:[],calculatedAt:stamp} };
    const saved=normalizeTrip(input,stamp), reopened=normalizeTrip(JSON.parse(JSON.stringify(saved)),stamp);
    assert.equal(reopened.travelMode,"van"); assert.equal(reopened.route.mode,"van");
    assert.equal(reopened.stops[0].notes,"Campsite booked"); assert.equal(reopened.stops[0].arrival,"2026-10-10T16:00");
  });
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
    "bulk group recoloring retains group identities and rejects stale calendar edits",
    async () => {
      const before = (await readPlanningState()).calendars.find((c) => c.id === "native");
      const groups = before.groups.map((group, index) => ({ ...group, color: index ? "#AA7833" : "#665399" }));
      const saved = await savePlanningRecord("calendars", { id: before.id, groups }, before.updatedAt);
      assert.deepEqual(saved.groups, groups);
      const reloaded = await readPlanningState();
      assert.deepEqual(reloaded.calendars.find((c) => c.id === before.id).groups, groups);
      assert.equal(reloaded.events.find((e) => e.id === "five-minute").groupId, "work");
      await assert.rejects(() => savePlanningRecord("calendars", { id: before.id, groups: before.groups }, before.updatedAt), /changed|updated|refresh/i);
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
  await check("birthday projections include unknown years and cross-year ranges without moving leap days", () => {
    const { calendarObservances, defaultObservances } = require("../lib/modules/planning/observances.ts");
    const person = { module: "people", objectType: "person", objectId: "person-1", label: "Alex", route: "/admin/people/person-1" };
    const birthdays = [{ ref: person, birthday: "--01-01" }, { ref: { ...person, objectId: "leap" }, birthday: "2000-02-29" }, { ref: { ...person, objectId: "bad" }, birthday: "--02-31" }];
    const found = calendarObservances(birthdays, [], defaultObservances(), "2026-12-28", "2027-01-04", "America/Los_Angeles");
    assert.equal(found.length, 1); assert.equal(found[0].start, "2027-01-01"); assert.equal(found[0].end, "2027-01-02"); assert.equal(found[0].ownerRef.route, person.route); assert.equal(found[0].linkedRefs[0].objectId, person.objectId);
    assert.equal(calendarObservances(birthdays.slice(1), [], defaultObservances(), "2027-02-01", "2027-03-02", "UTC").length, 0);
    assert.equal(calendarObservances(birthdays.slice(1), [], defaultObservances(), "2028-02-01", "2028-03-02", "UTC")[0].start, "2028-02-29");
    assert.equal(calendarObservances(birthdays, [], { ...defaultObservances(), birthdays: false }, "2026-12-28", "2027-01-04", "UTC").length, 0);
  });
  await check("expanded group icons survive calendar validation", () => {
    const { normalizePlanningRecord } = require("../lib/modules/planning/record-validation.ts");
    const { GROUP_ICONS } = require("../lib/modules/planning/calendar-groups.ts");
    for (const icon of GROUP_ICONS) assert.equal(normalizePlanningRecord("calendars",{id:"qa",name:"QA",createdAt:"2026-10-07T00:00:00Z",updatedAt:"2026-10-07T00:00:00Z",groups:[{id:icon,name:icon,color:"#59518b",icon}]}).groups[0].icon,icon);
  });
  await check("country holidays retain calendar dates, observed dates and individual visibility", () => {
    const { holidayCatalog } = require("../lib/modules/planning/holiday-catalog.ts");
    const { calendarObservances, defaultObservances } = require("../lib/modules/planning/observances.ts");
    const catalog = holidayCatalog(["US", "CA"], [2026]); assert(catalog.countries.length >= 200);
    const independence = catalog.holidays.filter(x => x.country === "US" && x.name.startsWith("Independence Day"));
    assert.deepEqual(independence.map(x => x.date), ["2026-07-03", "2026-07-04"]);
    const tax = catalog.holidays.find(x => x.country === "US" && x.name === "Tax Day");
    const defaults = calendarObservances([], catalog.holidays, defaultObservances(), "2026-01-01", "2027-01-01", "Pacific/Auckland");
    assert(defaults.some(x => x.title === "Tax Day"));
    const hidden = calendarObservances([], catalog.holidays, { ...defaultObservances(), hiddenHolidays:[tax.key] }, "2026-01-01", "2027-01-01", "UTC");
    assert(!hidden.some(x => x.title === "Tax Day")); assert(!defaults.some(x => x.system.country === "CA"));
    const enabled = calendarObservances([], catalog.holidays, { ...defaultObservances(), countries: ["US", "CA"], hiddenHolidays: [independence[0].key], extraHolidays: [tax.key] }, "2026-01-01", "2027-01-01", "Pacific/Auckland");
    assert(enabled.some(x => x.title === "Tax Day")); assert(enabled.some(x => x.system.country === "CA")); assert(!enabled.some(x => x.title.startsWith("Independence Day")));
    assert.equal(enabled.find(x => x.title === "Halloween").start, "2026-10-31");
  });
  await check("custom dates preserve annual versus one-time behavior and exclusion boundaries", () => {
    const { calendarObservances, defaultObservances } = require("../lib/modules/planning/observances.ts");
    const settings = { ...defaultObservances(), custom: [{ id: "annual", title: "Annual deadline", date: "2025-10-02", annual: true, visible: true }, { id: "once", title: "One time", date: "2025-10-02", annual: false, visible: true }, { id: "hidden", title: "Hidden", date: "2026-10-02", annual: true, visible: false }] };
    const found = calendarObservances([], [], settings, "2026-10-02", "2026-10-03", "America/New_York"); assert.deepEqual(found.map(x => x.title), ["Annual deadline"]);
    assert.equal(calendarObservances([], [], settings, "2026-10-03", "2026-10-04", "UTC").length, 0);
  });
  await check("calendar visibility preserves holiday choices and custom dates across persistence", async () => {
    const { defaultObservances, calendarObservances, holidayVisible } = require("../lib/modules/planning/observances.ts");
    const { normalizeObservances } = require("../lib/modules/planning/observance-settings.ts");
    const holiday = { key: "US:qa", country: "US", name: "Holiday", date: "2026-10-05", end: "2026-10-06", defaultVisible: false };
    const settings = { ...defaultObservances(), disabledCountries: ["US"], customVisible: false, extraHolidays: [holiday.key], custom: [{ id: "custom-qa", title: "Milestone", date: "2026-10-05", annual: false, visible: true }] };
    assert(holidayVisible(holiday, settings));
    assert.equal(calendarObservances([], [holiday], settings, "2026-10-01", "2026-11-01", "UTC").length, 0);
    const native = (await readPlanningState()).calendars.find(x => x.id === "native");
    await savePlanningRecord("calendars", { id: "native", observances: settings }, native.updatedAt);
    const saved = (await readPlanningState()).calendars.find(x => x.id === "native").observances;
    assert.deepEqual(saved, settings);
    assert.equal(calendarObservances([], [holiday], { ...saved, disabledCountries: [], customVisible: true }, "2026-10-01", "2026-11-01", "UTC").length, 2);
    assert.throws(() => normalizeObservances({ ...settings, disabledCountries: ["bad"] }));
    assert.deepEqual(normalizeObservances({ ...settings, countries: [] }).disabledCountries, []);
  });
  await check("observance settings reject malformed dates and retain canonical conflict protection", async () => {
    const { defaultObservances } = require("../lib/modules/planning/observances.ts");
    const { normalizeObservances } = require("../lib/modules/planning/observance-settings.ts");
    const settings = { ...defaultObservances(), countries: ["US", "CA"], custom: [{ id: "tax", title: "My deadline", date: "2026-04-15", annual: true, visible: true }] };
    assert.throws(() => normalizeObservances({ ...settings, countries: ["bad"] }));
    assert.throws(() => normalizeObservances({ ...settings, custom: [{ ...settings.custom[0], date: "2026-02-31" }] }));
    assert.throws(() => normalizeObservances({ ...settings, custom: [settings.custom[0], settings.custom[0]] }));
    const state = await readPlanningState(), native = state.calendars.find(x => x.id === "native");
    const saved = await savePlanningRecord("calendars", { id: "native", observances: settings }, native.updatedAt);
    assert.deepEqual(saved.observances, settings); assert.deepEqual((await readPlanningState()).calendars.find(x => x.id === "native").observances, settings);
    await assert.rejects(() => savePlanningRecord("calendars", { id: "native", observances: defaultObservances() }, native.updatedAt), /changed elsewhere/);
    const { planningWritableKeys } = require("../lib/modules/planning/ownership.ts"); assert(planningWritableKeys("calendars").includes("observances"));
  });
  await check("month event spans pack without overlap and retain continuations and overflow counts", () => {
    const { monthWeekLayout, monthLaneCapacity } = require("../lib/modules/planning/month-layout.ts");
    assert.equal(monthLaneCapacity(250, 5, 36), 5);
    assert.equal(monthLaneCapacity(250, 8, 36), 4);
    assert.equal(monthLaneCapacity(130, 2, 30), 2);
    assert.equal(monthLaneCapacity(130, 4, 30), 2);
    assert.equal(monthLaneCapacity(50, 4, 30), 0);
    const { instantFor } = require("../lib/modules/planning/calendar-model.ts");
    const zone = "America/New_York";
    const event = (id, start, end, allDay = true) => ({ id, startMs: instantFor(start, zone), endMs: instantFor(end, zone), allDay });
    const days = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"];
    const trip = event("trip", "2026-11-05", "2026-11-10");
    const single = monthWeekLayout(days, [trip], zone).segments[0];
    assert.deepEqual([single.first, single.last, single.continuesBefore, single.continuesAfter], [4, 6, false, true]);
    const next = monthWeekLayout(["2026-11-08", "2026-11-09", "2026-11-10"], [trip], zone).segments[0];
    assert.deepEqual([next.first, next.last, next.continuesBefore, next.continuesAfter], [0, 1, true, false]);
    const spanning = event("span", "2026-10-30", "2026-11-10");
    const timed = event("timed", "2026-11-05T10:00", "2026-11-05T11:00", false);
    const packed = monthWeekLayout(days, [trip, timed, spanning], zone);
    assert.deepEqual(packed.hidden, [0, 0, 0, 0, 1, 0, 0]);
    assert.equal(packed.segments.length, 2);
    for (let i = 0; i < packed.segments.length; i++) for (let j = i + 1; j < packed.segments.length; j++) {
      const a = packed.segments[i], b = packed.segments[j];
      assert(a.lane !== b.lane || a.last < b.first || b.last < a.first);
    }
    const weekdays = monthWeekLayout(days.slice(1, 6), [spanning], zone).segments[0];
    assert.deepEqual([weekdays.first, weekdays.last, weekdays.continuesBefore, weekdays.continuesAfter], [0, 4, true, true]);
    assert.equal(monthWeekLayout(days, [event("ended", "2026-10-30", "2026-11-01")], zone).segments.length, 0);
    assert.equal(monthWeekLayout(days, [event("dst", "2026-11-01", "2026-11-02")], zone).segments[0].last, 0);
    const overnight = monthWeekLayout(days, [event("night", "2026-11-02T23:00", "2026-11-03T01:00", false)], zone);
    assert.deepEqual(overnight.segments.map(s => [s.first, s.last]), [[1, 1], [2, 2]]);
  });
  await check("calendar navigation retains complete years, leap days and Sunday-first week boundaries", () => {
    const { calendarRange, shiftCalendar, weeksOfYear, navigationYear } = require("../lib/modules/planning/calendar-navigation.ts");
    assert.deepEqual(calendarRange("2026-12-31", "3-day"), { start: "2026-12-31", end: "2027-01-03" });
    assert.equal(shiftCalendar("2028-02-28", "3-day", 1), "2028-03-02");
    assert.equal(shiftCalendar("2027-01-02", "3-day", -1), "2026-12-30");
    assert.deepEqual(calendarRange("2028-02-29", "year"), { start: "2028-01-01", end: "2029-01-01" });
    assert.equal(shiftCalendar("2028-02-29", "year", 1), "2029-02-28");
    assert.equal(shiftCalendar("2026-01-31", "month", 1), "2026-02-28");
    assert.equal(weeksOfYear(2026).length, 52);
    assert.deepEqual(weeksOfYear(2026)[0], { number: 1, start: "2025-12-28", end: "2026-01-03" });
    assert.equal(weeksOfYear(2027)[0].start, "2026-12-27");
    assert.equal(navigationYear("2025-12-29", "week"), 2026);
    assert.equal(weeksOfYear(2026).at(-1).end, "2026-12-26");
    assert.deepEqual(calendarRange("2025-12-29", "week"), { start: "2025-12-28", end: "2026-01-04" });
    assert.deepEqual(calendarRange("2026-11-04", "month"), { start: "2026-11-01", end: "2026-12-13" });
    assert.deepEqual(calendarRange("2026-10-03", "week"), { start: "2026-09-27", end: "2026-10-04" });
    assert.deepEqual(calendarRange("2026-10-04", "week"), { start: "2026-10-04", end: "2026-10-11" });
  });
  await check("shared Sunday-first weeks cover every date and remain contiguous across years", () => {
    const { Temporal } = require("@js-temporal/polyfill");
    const { weekStart, visibleWeekdays } = require("../lib/calendar-week.ts");
    const { weeksOfYear, navigationYear } = require("../lib/modules/planning/calendar-navigation.ts");
    assert.deepEqual(visibleWeekdays(), ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
    assert.deepEqual(visibleWeekdays(false), ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
    // Includes all weekday/leap-year combinations in the Gregorian cycle.
    for (let year = 2000; year < 2400; year++) {
      const weeks = weeksOfYear(year);
      assert([52, 53].includes(weeks.length));
      assert(weeks[0].start <= `${year}-01-01` && weeks[0].end >= `${year}-01-01`);
      for (const [index, week] of weeks.entries()) {
        const start = Temporal.PlainDate.from(week.start), end = Temporal.PlainDate.from(week.end);
        assert.equal(start.dayOfWeek, 7); assert.equal(end.dayOfWeek, 6);
        assert.equal(start.until(end).days, 6);
        assert.equal(navigationYear(week.start, "week"), year);
        assert.equal(navigationYear(week.end, "week"), year);
        assert.equal(weekStart(week.end), week.start);
        assert.equal(end.add({ days: 1 }).toString(), (weeks[index + 1] || weeksOfYear(year + 1)[0]).start);
      }
    }
  });
  await check("timed custom dates retain their owning zone, annual duration and display-zone boundaries", () => {
    const { calendarObservances, defaultObservances } = require("../lib/modules/planning/observances.ts");
    const { normalizeObservances } = require("../lib/modules/planning/observance-settings.ts");
    const custom = { id: "night", title: "Annual reflection", date: "2025-12-31", endDate: "2026-01-01", startTime: "23:30", endTime: "00:30", timeZone: "America/New_York", allDay: false, annual: true, visible: true };
    const settings = normalizeObservances({ ...defaultObservances(), custom: [custom], appearances: { custom: { name: "Milestones", color: "#335577" } } });
    const items = calendarObservances([], [], settings, "2027-01-01", "2027-01-02", "Europe/London");
    assert.equal(items.length, 1); assert.equal(items[0].allDay, false); assert.equal(items[0].start, "2026-12-31T23:30");
    assert.equal(items[0].end, "2027-01-01T00:30"); assert.equal(items[0].endMs - items[0].startMs, 3600000);
    assert.equal(items[0].system.color, "#335577"); assert.equal(items[0].system.calendarName, "Milestones");
    assert.equal(calendarObservances([], [], settings, "2026-12-31", "2027-01-01", "Europe/London").length, 0);
    assert.throws(() => normalizeObservances({ ...settings, custom: [{ ...custom, endDate: custom.date, endTime: "22:30" }] }), /after the start/);
    assert.throws(() => normalizeObservances({ ...settings, custom: [{ ...custom, timeZone: "Invalid/Zone" }] }), /time zone/);
    assert.throws(() => normalizeObservances({ ...settings, custom: [{ ...custom, startTime: "25:00" }] }), /valid start/);
    assert.throws(() => normalizeObservances({ ...settings, appearances: { birthdays: { name: "Birthday", color: "url(example)" } } }), /name and color/);
  });
  await check("custom recurrence covers intervals, month ends, leap years and local times", () => {
    const { calendarObservances, defaultObservances } = require("../lib/modules/planning/observances.ts");
    const { normalizeObservances } = require("../lib/modules/planning/observance-settings.ts");
    const base = { id: "repeat", title: "Custom repeat", date: "2026-01-31", annual: false, visible: true };
    const rows = (item, start, end, zone = "UTC") => calendarObservances([], [], normalizeObservances({ ...defaultObservances(), custom: [item] }), start, end, zone);
    assert.deepEqual(rows({ ...base, repeat: { frequency: "monthly", interval: 1 } }, "2026-01-01", "2026-05-01").map(x => x.start), ["2026-01-31", "2026-03-31"]);
    assert.deepEqual(rows({ ...base, date: "2024-02-29", repeat: { frequency: "yearly", interval: 1 } }, "2025-01-01", "2029-01-01").map(x => x.start), ["2028-02-29"]);
    assert.deepEqual(rows({ ...base, date: "2026-10-01", repeat: { frequency: "daily", interval: 2 } }, "2026-10-01", "2026-10-08").map(x => x.start), ["2026-10-01", "2026-10-03", "2026-10-05", "2026-10-07"]);
    const weekly = { ...base, date: "2026-10-01", repeat: { frequency: "weekly", interval: 2 } };
    assert.deepEqual(rows(weekly, "2026-10-01", "2026-11-01").map(x => x.start), ["2026-10-01", "2026-10-15", "2026-10-29"]);
    const timed = rows({ ...weekly, date: "2026-03-01", allDay: false, startTime: "09:00", endTime: "10:00", timeZone: "America/New_York", repeat: { frequency: "weekly", interval: 1 } }, "2026-03-01", "2026-03-16", "America/New_York");
    assert.deepEqual(timed.map(x => x.start), ["2026-03-01T09:00", "2026-03-08T09:00", "2026-03-15T09:00"]);
    assert.equal(timed[1].startMs - timed[0].startMs, (7 * 24 - 1) * 3600000);
    for (const interval of [0, -1, 1.5, 366]) assert.throws(() => normalizeObservances({ ...defaultObservances(), custom: [{ ...base, repeat: { frequency: "daily", interval } }] }), /repeat interval/);
    const { calendarRange, shiftCalendar } = require("../lib/modules/planning/calendar-navigation.ts");
    assert.deepEqual(calendarRange("2026-12-20", "agenda", 60), { start: "2026-12-20", end: "2027-02-18" });
    assert.equal(shiftCalendar("2026-12-20", "agenda", 1, 60), "2027-02-18");
  });
  await check("international regions join stable IDs, retain missing data and support cross-filters", async () => {
    const { worldRegions } = require("../lib/modules/planning/world-regions.ts");
    const { mapAnalysis } = require("../lib/modules/planning/map-analysis.ts");
    const population = await worldRegions("regional-population", "county", "CAN");
    const density = await worldRegions("regional-density", "county", "CAN");
    assert.equal(population.rows.length, 295);
    assert.equal(population.rows.filter(r => r.value === null).length, 3);
    const settings = { countryCode: "CAN", scale: "quantile", match: "all", metrics: [{ metric: "regional-population", min: 100000 }, { metric: "regional-density", min: 100 }] };
    const result = mapAnalysis([population, density], settings);
    assert(result.matched > 0 && result.matched < population.rows.length);
    assert.equal(new Set(result.geometry.features.filter(f => f.properties.value !== null).map(f => f.properties.color)).size, 5);
    assert(result.geometry.features.every(f => Number.isFinite(f.properties.normalized)));
    for (const country of ["BRA", "GBR", "IND", "KEN", "AUS"]) {
      const data = await worldRegions("regional-population", "state", country);
      assert(data.rows.some(r => r.value > 0));
      assert.equal(new Set(data.rows.map(r => r.id)).size, data.rows.length);
    }
    await assert.rejects(worldRegions("regional-population", "county", "../../bad"), /supported/);
    await assert.rejects(worldRegions("income", "county", "CAN"), /supported/);
    await assert.rejects(worldRegions("regional-population", "tract", "CAN"), /supported/);
    const saved = normalizePlanningRecord("savedViews", { id: "canada", createdAt: stamp, updatedAt: stamp, name: "Canada density", query: "", tag: "", layer: "regional-population", analysis: settings, level: "county", center: [-100, 55], zoom: 4 });
    assert.equal(saved.analysis.countryCode, "CAN");
    assert.deepEqual(saved.analysis.metrics, settings.metrics);
  });
  await check("international geometry is complete and does not cross the map seam", () => {
    const { gunzipSync } = require("node:zlib");
    const catalog = require("../data/map/world-regions-catalog.json");
    for (const country of catalog) for (const level of ["1", "2"]) {
      const data = JSON.parse(gunzipSync(fs.readFileSync(path.join(process.cwd(), "data/map/world", `${country.code}-${level}.json.gz`))));
      assert.equal(data.features.length, country.levels[level].regions);
      assert.equal(data.features.filter(f => f.properties.population !== null).length, country.levels[level].available);
      for (const f of data.features) {
        const visit = c => { if (typeof c[0]?.[0] === "number") {
          assert(c.length >= 4); assert.deepEqual(c[0], c.at(-1));
          c.forEach(([x,y], i) => { assert(Number.isFinite(x) && Math.abs(x) <= 180); assert(Number.isFinite(y) && Math.abs(y) <= 90); if (i) assert(Math.abs(x - c[i-1][0]) <= 180); });
        } else c.forEach(visit); };
        visit(f.geometry.coordinates);
      }
    }
  });
  await check("map focus keeps date-line regions together and preserves Greenwich crossings", () => {
    const { regionBounds } = require("../lib/modules/planning/map-bounds.ts");
    const points = coordinates => ({ type: "FeatureCollection", features: coordinates.map(coordinates => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates } })) });
    assert.deepEqual(regionBounds(points([[179, 50], [-179, 55]])), [[179, 50], [181, 55]]);
    assert.deepEqual(regionBounds(points([[-5, 50], [5, 55]])), [[-5, 50], [5, 55]]);
    assert.equal(regionBounds(points([])), undefined);
  });
  await check("geocoding candidates reject malformed geometry and retain valid address coordinates", () => {
    const { parsePlaceSearch } = require("../lib/modules/planning/place-search.ts");
    const feature = (coordinates, properties = {}) => ({ geometry: { type: "Point", coordinates }, properties });
    const results = parsePlaceSearch({ features: [null, feature([2.2945, 48.8584], { name: "Tower", street: "Avenue", town: "Paris", postcode: "75007", country: "France" }), feature([181, 40]), feature([5, 91]), feature(["2", "48"]), feature([NaN, 30])] }, "query");
    assert.deepEqual(results, [{ name: "Tower", address: "Avenue, Paris, 75007, France", latitude: 48.8584, longitude: 2.2945 }]);
    assert.deepEqual(parsePlaceSearch({ features: [] }, "query"), []);
    assert.throws(() => parsePlaceSearch({ error: "unavailable" }, "query"), /unexpected/);
  });
  await check("expanded data catalog preserves source units, latest values and country-only scope", async () => {
    const { MAP_CATALOG } = require("../lib/modules/planning/map-catalog.ts");
    const { demographics } = require("../lib/modules/planning/map-providers.ts");
    const original = global.fetch;
    try {
      global.fetch = async url => new Response(JSON.stringify(String(url).includes("/indicator/") ? [{}, [
        {countryiso3code:"USA", value: 10, date:"2022"},
        {countryiso3code:"USA", value: null, date:"2025"},
        {countryiso3code:"USA", value: 15, date:"2024"},
        {countryiso3code:"CAN", value: null, date:"2025"},
        {countryiso3code:"WLD", value: 99, date:"2025"}
      ]] : [{}, [
        {id:"USA", iso2Code:"US", name:"United States", region:{id:"NAC"}, longitude:"-100", latitude:"40"},
        {id:"CAN", iso2Code:"CA", name:"Canada", region:{id:"NAC"}, longitude:"-100", latitude:"60"},
        {id:"WLD", name:"World", region:{id:"NA"}}
      ]]), {headers:{"content-type":"application/json"}});
      for (const metric of Object.keys(MAP_CATALOG).filter(key => key.startsWith("world-"))) {
        const data = await demographics(metric, "country", "");
        assert.equal(data.unit, MAP_CATALOG[metric].unit);
        assert.equal(data.rows.find(r => r.id === "USA").value, 15);
        assert.equal(data.rows.find(r => r.id === "USA").year, "2024");
        assert.equal(data.rows.find(r => r.id === "CAN").value, null);
        assert(!data.rows.some(r => r.id === "WLD"));
        await assert.rejects(() => demographics(metric, "county", "39"), /country level/);
      }
    } finally { global.fetch = original; }
  });
  await check("map palettes and cross filters survive saving without converting missing values to zero", () => {
    const { mapAnalysis } = require("../lib/modules/planning/map-analysis.ts");
    const { MAP_PALETTES } = require("../lib/modules/planning/map-catalog.ts");
    const data = values => ({source:"Fixture", sourceUrl:"https://example.com", period:"2024", unit:"%", geography:"Country", geometry:{type:"FeatureCollection", features:[]}, rows:values.map((value, i) => ({id:String(i), name:String(i), value, year:"2024"}))});
    const settings = {metrics:[{metric:"world-internet", min:40}, {metric:"world-electricity", min:50}], match:"all", scale:"quantile", palette:"indigo"};
    assert.equal(mapAnalysis([data([60, null, 20]), data([70, 80, 90])], settings).matched, 1);
    assert.equal(mapAnalysis([data([60, null, 20]), data([70, 80, 90])], {...settings, match:"any"}).rows[1].comparisons[0].value, null);
    assert.deepEqual(mapAnalysis([data([60, null, 20]), data([70, 80, 90])], settings).colors, MAP_PALETTES.indigo.colors);
    const saved = normalizePlanningRecord("savedViews", {id:"data-view", createdAt:stamp, updatedAt:stamp, name:"Access", center:[0,0], zoom:2, layer:"world-internet", level:"country", analysis:settings});
    assert.equal(saved.analysis.palette, "indigo");
    assert.deepEqual(saved.analysis.metrics, settings.metrics);
  });
  await check("country address layouts preserve international order and entered fields", () => {
    const { formatPlaceAddress, addressFields, normalizeAddressCountry, addressCountries } = require("../lib/modules/planning/place-address.ts");
    const us = {street:"123 Main St", city:"Cincinnati", region:"OH", postalCode:"45202", district:""};
    assert.equal(formatPlaceAddress(us, "US"), "123 Main St, Cincinnati, OH 45202, United States");
    assert.equal(formatPlaceAddress({...us, street:"10 Downing Street", city:"London", region:"", postalCode:"SW1A 2AA"}, "GB"), "10 Downing Street, London, SW1A 2AA, United Kingdom");
    assert.equal(formatPlaceAddress({...us, street:"Unter den Linden 1", city:"Berlin", region:"", postalCode:"10117"}, "DE"), "Unter den Linden 1, 10117 Berlin, Germany");
    assert(!addressFields("HK").includes("postalCode"));
    assert(formatPlaceAddress(us, "GB").includes("OH"), "Country changes must not discard an entered region");
    assert(addressCountries.length >= 249);
    assert.throws(() => normalizeAddressCountry("__proto__"), /valid address country/);
    assert.equal(normalizeAddressCountry("us"), "US");
  });
  await check("place address details persist and survive coordinate-only changes", async () => {
    const parts = {street:"123 Main St", city:"Cincinnati", region:"OH", postalCode:"45202", district:""};
    const address = "123 Main St, Cincinnati, OH 45202, United States";
    const saved = await savePlanningRecord("places", {name:"Address fixture", address, countryCode:"US", addressParts:parts, latitude:39.1, longitude:-84.5, notes:"", tags:[], linkedRefs:[]});
    const updated = await savePlanningRecord("places", {id:saved.id, latitude:39.2}, saved.updatedAt);
    assert.equal(updated.address, address);
    assert.equal(updated.countryCode, "US");
    assert.deepEqual(updated.addressParts, parts);
    assert.deepEqual((await readPlanningState()).places.find(p => p.id === saved.id).addressParts, parts);
    const { planningWritableKeys } = require("../lib/modules/planning/ownership.ts");
    assert(planningWritableKeys("places").includes("addressParts"));
    assert(planningWritableKeys("places").includes("countryCode"));
  });
  await check("individual birthday visibility persists without changing People records", async () => {
    const { defaultObservances, calendarObservances } = require("../lib/modules/planning/observances.ts");
    const { normalizeObservances } = require("../lib/modules/planning/observance-settings.ts");
    const person = id => ({ ref: { module:"people", objectType:"person", objectId:id, label:id, route:`/admin/people/${id}` }, birthday:"--10-05" });
    const people = [person("hidden-person"), person("visible-person")];
    const settings = normalizeObservances({...defaultObservances(), hiddenBirthdays:["hidden-person", "hidden-person"]});
    assert.deepEqual(settings.hiddenBirthdays, ["hidden-person"]);
    assert.deepEqual(calendarObservances(people, [], settings, "2026-10-01", "2026-11-01", "UTC").map(x => x.ownerRef.objectId), ["visible-person"]);
    const calendar = (await readPlanningState()).calendars.find(x => x.id === "native");
    await savePlanningRecord("calendars", {id:calendar.id, observances:settings}, calendar.updatedAt);
    assert.deepEqual((await readPlanningState()).calendars.find(x => x.id === "native").observances.hiddenBirthdays, ["hidden-person"]);
    assert.equal(people[0].birthday, "--10-05");
    assert.equal(calendarObservances(people, [], {...settings, hiddenBirthdays:[]}, "2026-10-01", "2026-11-01", "UTC").length, 2);
    assert.throws(() => normalizeObservances({...settings, hiddenBirthdays:[123]}), /selection/);
  });
  await check("time undo preserves linked objects and unrelated edits and rejects changed times", async () => {
    const { timeChange, timeChangePatch, canUndoTimeChange } = require("../lib/modules/planning/event-time-history.ts");
    for (const recurring of [false, true]) {
      const original = event({ id: `undo-${recurring}`, recurrence: recurring ? "FREQ=WEEKLY;COUNT=3" : "" });
      const occurrence = eventOccurrences([original], "2026-03-01", "2026-03-20", "America/New_York")[0];
      const change = timeChange(original, occurrence, "2026-03-02T10:00:00", "2026-03-02T12:00:00");
      const moved = { ...original, ...timeChangePatch(original, change) };
      assert(canUndoTimeChange(moved, change));
      assert(canUndoTimeChange({...moved, ...timeChangePatch(moved, {...change, after:{start:"2026-03-02T10:00", end:"2026-03-02T12:00"}})}, change), "Equivalent minute/second precision permits consecutive undo");
      const edited = { ...moved, title: "Updated title", description: "Keep these notes", linkedRefs: [{module:"people",objectType:"organization",objectId:"org-test",label:"Organization",route:"/admin/people/org-test"}] };
      const restored = {...edited, ...timeChangePatch(edited, change, true)};
      const result = eventOccurrences([restored], "2026-03-01", "2026-03-20", "America/New_York")[0];
      assert.equal(result.startMs, occurrence.startMs);
      assert.equal(result.endMs, occurrence.endMs);
      assert.equal(result.title, "Updated title");
      assert.equal(result.linkedRefs[0].objectId, "org-test");
      assert.equal(result.description, "Keep these notes");
      const newer = {...moved, ...timeChangePatch(moved, {...change, after:{...change.after, end:"2026-03-02T13:00:00"}})};
      assert(!canUndoTimeChange(newer, change));
      assert(!canUndoTimeChange({...moved, archivedAt:stamp}, change));
      // Imported events retain their provider data while changing local timing overrides.
      if (!recurring) assert(canUndoTimeChange({...original, overrides:change.after}, change));
    }
  });
  console.log(
    `${passed} planning behavior checks passed. Isolated fixture: ${fixture}`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
