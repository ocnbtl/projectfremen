/* Local preview with an isolated data directory and all providers disabled. */
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawn } = require("node:child_process"),
  ts = require("typescript");
const dir = fs.mkdtempSync(
  path.join(os.tmpdir(), "unigentamos-design-preview-"),
);
Object.assign(process.env, {
  FREMEN_DATA_DIR: dir,
  ADMIN_PASSWORD: "local-design-fixture",
  ADMIN_SESSION_SECRET: "local-design-fixture-session",
  FREMEN_REQUIRE_SUPABASE: "false",
  FREMEN_REQUIRE_PERSISTENT_DATA: "false",
  SUPABASE_URL: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  CENSUS_API_KEY: "",
  MORGEN_API_KEY: "",
  OPENROUTESERVICE_API_KEY: "",
  GITHUB_TOKEN: "",
  NEXT_TELEMETRY_DISABLED: "1",
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
(async () => {
  const { savePlanningRecord } = require("../lib/modules/planning/store.ts");
  const { createPersonalRecord } = require("../lib/personal-records-store.ts");
  const today = new Date().toISOString().slice(0, 10);
  await savePlanningRecord("places", {
    id: "studio",
    name: "Riverside studio and archive",
    address: "Cincinnati, Ohio",
    latitude: 39.1031,
    longitude: -84.512,
    notes: "Entrance through the north courtyard.",
    tags: ["work"],
    linkedRefs: [],
  });
  for (const [i, title] of [
    "Review the Riverside studio proposal with the project team",
    "Site visit",
    "A long, incomplete record with no location or participants yet",
  ].entries())
    await savePlanningRecord("events", {
      id: `fixture-event-${i}`,
      title,
      description: i ? "" : "Discuss the next milestone and record decisions.",
      start: `${today}T${String(9 + i).padStart(2, "0")}:00:00`,
      end: `${today}T${String(10 + i).padStart(2, "0")}:00:00`,
      calendarId: "native",
      timeZone: "America/New_York",
      allDay: false,
      kind: "event",
      reminderMinutes: null,
      recurrence: "",
      exceptions: {},
      linkedRefs: [],
      location: i ? "" : "Riverside studio",
    });
  await createPersonalRecord({
    domain: "notes-docs",
    className: "note",
    title: "Studio review notes",
    body: "# Decisions\n\nKeep the entry **clear and accessible**.\n\n- Check the courtyard entrance\n- Confirm the next milestone\n\n## Open question\n\nWhich source materials need a second review?",
    status: "active",
  });
  await createPersonalRecord({
    domain: "notes-docs",
    className: "person",
    title: "Alexandra Morgan-Williams",
    profile: {
      primaryEmail: "alexandra@example.test",
      primaryOccupation: "Project lead",
    },
  });
  const port = 3198;
  console.log(
    JSON.stringify({ url: `http://localhost:${port}`, fixture: dir }),
  );
  const child = spawn(
    process.execPath,
    [
      path.resolve("node_modules/next/dist/bin/next"),
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    },
  );
  process.on("SIGINT", () => child.kill());
  process.on("SIGTERM", () => child.kill());
  child.on("exit", (code) => process.exit(code || 0));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
