const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  ts = require("typescript");
process.env.FREMEN_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "fremen-transfer-"),
);
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.FREMEN_REQUIRE_SUPABASE = "false";
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        resolveJsonModule: true,
      },
    }).outputText,
    filename,
  );
const t = require("../lib/modules/people/transfer.ts");
const store = require("../lib/personal-records-store.ts");
(async () => {
  const csv = t.readCsv(
    'Name,Email,Phone,Company,Job Title,Custom\r\n"Jane, Smith",jane@example.com,+61412345678,Acme,Designer,"Line 1\nLine 2"\r\nSam Lee,sam@example.com,,Acme,Director,=SUM(A1)',
  );
  const rows = t.csvContacts(csv.rows, t.suggestCsvMapping(csv.headers));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "Jane, Smith");
  assert.equal(rows[0].employer, "Acme");
  assert.equal(rows[0].extra.Custom, "Line 1\nLine 2");
  assert.equal(rows[0].profile.phones[0].countryCode, "+61");
  const card =
    "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:José Example\r\nN:Example;José;;;\r\nORG:Acme;Design\r\nTITLE:Designer\r\nEMAIL;TYPE=WORK:jose@example.com\r\nTEL;TYPE=CELL:+61412345678\r\nNOTE:Private\\nnotes\\; with commas\\, too\r\nBDAY:--0229\r\nADR;TYPE=HOME:;;1 Main Street;Kent;Ohio;44240;USA\r\nX-SOCIALPROFILE;TYPE=linkedin:https://linkedin.com/in/example\r\nEND:VCARD\r\n";
  const v = t.vcardContacts(card);
  assert.equal(v[0].name, "José Example");
  assert.equal(v[0].profile.notes, "Private\nnotes; with commas, too");
  assert.equal(v[0].profile.birthday, "--02-29");
  assert.equal(v[0].profile.locations[0].location, "Kent, Ohio, USA");
  assert.equal(v[0].profile.linkedin, "https://linkedin.com/in/example");
  const qp = t.vcardContacts(
    "BEGIN:VCARD\nVERSION:2.1\nFN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Jos=C3=A9=\n Example\nEND:VCARD",
  );
  assert.equal(qp[0].name, "JoséExample");
  assert.throws(() => t.vcardContacts("BEGIN:VCARD\nFN:Broken"), /incomplete/);
  assert.throws(
    () =>
      t.readCsv(
        "Name\n" +
          Array.from({ length: 501 }, (_, i) => "Person " + i).join("\n"),
      ),
    /500/,
  );
  const result = await store.importPeopleContacts(
    rows,
    [
      {
        name: "Acme",
        profile: {
          organizationType: "Business",
          industry: "Retail.Current",
          foundedYear: "2000",
        },
      },
    ],
    "test-batch-00000001",
  );
  assert.equal(result.createdIds.length, 3);
  const acme = result.items.find((r) => r.className === "org");
  assert(acme);
  assert.notEqual(acme.profile.industry, "Retail.Current");
  const jane = result.items.find((r) => r.title === "Jane, Smith");
  assert.equal(jane.profile.occupations[0].organizationId, acme.id);
  assert.equal(jane.profile.primaryEmployer, "Acme");
  const retry = await store.importPeopleContacts(
    rows,
    [],
    "test-batch-00000001",
  );
  assert.equal(retry.createdIds.length, 0);
  assert.equal(retry.skipped, 2);
  assert.equal((await store.readPersonalRecords()).length, 3);
  assert.equal(t.draftMatches(rows[0], result.items).length, 1);
  const fresh = {
    ...rows[0],
    name: "Another Name",
    profile: {
      ...rows[0].profile,
      emails: [{ id: "1", category: "work", address: "jane@example.com" }],
    },
  };
  assert.equal(
    (await store.importPeopleContacts([fresh], [], "test-batch-00000002"))
      .createdIds.length,
    0,
  );
  await assert.rejects(() =>
    store.importPeopleContacts(
      [
        { ...rows[0], name: "Valid first", profile: {}, employer: "" },
        { ...rows[1], name: "" },
      ],
      [],
      "test-batch-00000003",
    ),
  );
  assert.equal(
    (await store.readPersonalRecords()).length,
    3,
    "invalid batch does not partially persist",
  );
  const sensitive = {
    ...jane,
    profile: {
      ...jane.profile,
      notes: "SECRET_NOTE",
      lifeDream: "SECRET_DREAM",
      interactions: ["SECRET_LEGACY"],
      memories: [{ text: "SECRET_MEMORY" }],
      associatedPeople: ["SECRET_PERSON"],
      partner: "SECRET_PARTNER",
    },
    projects: ["SECRET_PROJECT"],
    importMeta: { ...jane.importMeta, extra: { raw: "SECRET_EXTRA" } },
  };
  const safe = t.exportContactData(sensitive, t.PRIVATE_EXPORT_DEFAULTS);
  for (const output of [
    JSON.stringify(safe),
    t.contactsCsv([safe]),
    t.contactsVcard([safe]),
  ])
    assert(!/SECRET_/.test(output), "private fields excluded in every format");
  const included = t.exportContactData(sensitive, {
    notes: true,
    dreams: true,
    interactions: true,
    objects: true,
    extras: true,
  });
  for (const secret of [
    "SECRET_NOTE",
    "SECRET_DREAM",
    "SECRET_LEGACY",
    "SECRET_MEMORY",
    "SECRET_PERSON",
    "SECRET_PROJECT",
    "SECRET_EXTRA",
  ])
    assert(JSON.stringify(included).includes(secret));
  const dangerous = t.contactsCsv([{ ...safe, name: '=HYPERLINK("bad")' }]);
  assert(dangerous.includes("'=HYPERLINK"));
  const round = t.vcardContacts(t.contactsVcard([included]));
  assert.equal(round[0].name, jane.title);
  assert.equal(round[0].profile.notes, "SECRET_NOTE");
  const undone = await store.undoPeopleImport("test-batch-00000001");
  assert.equal(undone.filter((r) => r.archivedAt).length, 3);
  const picture =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRuAAAAAASUVORK5CYII=";
  const photoDraft = {
    key: "photo",
    name: "Photo Contact",
    kind: "person",
    profile: {},
    employer: "",
    employerWebsite: "",
    extra: {},
    warnings: [],
    photo: picture,
  };
  const concurrent = await Promise.all([
    store.importPeopleContacts([photoDraft], [], "photo-batch-00000001"),
    store.importPeopleContacts([photoDraft], [], "photo-batch-00000002"),
  ]);
  assert.equal(
    concurrent.reduce((sum, result) => sum + result.createdIds.length, 0),
    1,
    "concurrent imports create one contact",
  );
  const photoContact = (await store.readPersonalRecords()).find(
    (record) => record.title === "Photo Contact",
  );
  assert.equal(
    photoContact.profile.photoUrl,
    `/api/people/photos/${photoContact.id}`,
  );
  assert.equal(
    fs
      .readdirSync(process.env.FREMEN_DATA_DIR)
      .filter((name) => name.startsWith("people-profile-photo-")).length,
    1,
    "unused staged photos are removed",
  );
  await assert.rejects(() =>
    store.importPeopleContacts(
      [
        { ...photoDraft, name: "Valid staged photo" },
        {
          ...photoDraft,
          name: "Invalid photo",
          photo: "data:image/png;base64,YmFk",
        },
      ],
      [],
      "photo-batch-00000003",
    ),
  );
  assert(
    !(await store.readPersonalRecords()).some(
      (record) => record.title === "Valid staged photo",
    ),
  );
  assert.equal(
    fs
      .readdirSync(process.env.FREMEN_DATA_DIR)
      .filter((name) => name.startsWith("people-profile-photo-")).length,
    1,
  );
  await new Promise((resolve) => setTimeout(resolve, 5));
  await store.updatePersonalRecord(photoContact.id, {
    title: "Edited photo contact",
  });
  await assert.rejects(
    () => store.undoPeopleImport(photoContact.importMeta.batch),
    /edited or linked/,
  );
  assert.equal(
    t.vcardContacts(
      "BEGIN:VCARD\nVERSION:3.0\nFN:Leap day\nBDAY;X-APPLE-OMIT-YEAR=1604:1604-02-29\nEND:VCARD",
    )[0].profile.birthday,
    "--02-29",
  );
  console.log(
    "PASS: CSV/vCard parsing, private-field exclusion, formula protection, atomic employer linking, retries, duplicates, rollback, and undo.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
