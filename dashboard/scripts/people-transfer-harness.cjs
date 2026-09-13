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
const { findPeopleDuplicates, createPeopleDuplicateIndex } = require("../lib/modules/people/duplicates.ts");
const store = require("../lib/personal-records-store.ts");
(async () => {
  const fixture = (id, title, profile = {}, extra = {}) => ({ id, title, className: "person", profile, ...extra });
  const directory = [
    fixture("saved-name", "José Santos"),
    fixture("saved-email", "Email owner", { primaryEmail: "SHARED@example.com " }),
    fixture("saved-phone", "Phone owner", { phoneNumber: "6145550142", phoneCountryCode: "+1" }),
    fixture("saved-social", "Social owner", { x: "https://twitter.com/example" }),
    fixture("saved-org", "Studio", { website: "https://www.studio.example/?ref=import" }, { className: "org" }),
    fixture("archived", "Archived contact", {}, { archivedAt: "2026-09-01" }),
    fixture("note", "A note", { primaryEmail: "note@example.com" }, { className: "note" }),
  ];
  const candidates = [
    fixture("draft-name", "Jose Santos", { emails: [{ address: "shared@example.com" }] }),
    fixture("draft-phone", "Different name", { phones: [{ number: "+1 614-555-0142", countryCode: "+1" }] }),
    fixture("draft-social", "Another name", { x: "https://x.com/example/" }),
    fixture("draft-org", "Studio Incorporated", { website: "http://studio.example" }, { className: "org" }),
    fixture("draft-person", "Studio", { website: "https://studio.example" }),
    fixture("draft-archived", "Archived contact"),
    fixture("draft-note", "Not a note", { primaryEmail: "note@example.com" }),
    fixture("draft-within-file", "A second incoming contact", { primaryEmail: "shared@example.com" }),
  ];
  const snapshot = JSON.stringify([directory, candidates]);
  const index = createPeopleDuplicateIndex(directory), seen = [...directory];
  for (const candidate of candidates) {
    const expected = findPeopleDuplicates([...seen, candidate]).filter(match => match.right.id === candidate.id);
    assert.deepEqual(index.find(candidate), expected, `indexed matching preserves rules for ${candidate.id}`);
    index.add(candidate);
    seen.push(candidate);
  }
  assert.equal(JSON.stringify([directory, candidates]), snapshot, "review does not mutate records");
  // Count source reads instead of relying on machine-dependent wall-clock thresholds.
  let profileReads = 0;
  const largeDirectory = Array.from({ length: 1000 }, (_, i) => ({
    ...fixture(`existing-${i}`, `Existing ${i}`),
    get profile() { profileReads++; return { primaryEmail: `existing-${i}@example.com` }; },
  }));
  const largeCsv = t.readCsv("Name,Email\n" + Array.from({ length: 500 }, (_, i) => `Incoming ${i},incoming-${i}@example.com`).join("\n"));
  const largeDrafts = t.csvContacts(largeCsv.rows, t.suggestCsvMapping(largeCsv.headers));
  largeDrafts[1].profile.emails[0].address = "existing-1@example.com";
  largeDrafts[2].profile.emails[0].address = largeDrafts[0].profile.emails[0].address;
  const reviewed = t.reviewContactDrafts(largeDrafts, largeDirectory);
  assert.equal(profileReads, 1000, "a 500-contact review indexes the saved directory once");
  assert.deepEqual(reviewed[1].matches, [{ id: "existing-1", reasons: ["Same email"] }]);
  assert.deepEqual(reviewed[2].matches, [{ id: "csv-0", reasons: ["Same email"] }]);
  assert.equal(reviewed.filter(row => !row.matches.length).length, 498);
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
  const largePhoto = "A".repeat(40_960);
  const largeVcard = Array.from({ length: 235 }, (_, i) =>
    `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Large Export ${i}\r\nPHOTO;ENCODING=b;TYPE=JPEG:${largePhoto}\r\nEND:VCARD\r\n`,
  ).join("");
  assert(Buffer.byteLength(largeVcard) > 9 * 1024 * 1024);
  assert(Buffer.byteLength(largeVcard) <= t.CONTACT_FILE_MAX_BYTES);
  const largeDraftsFromVcard = t.vcardContacts(largeVcard);
  assert.equal(largeDraftsFromVcard.length, 235, "large files preserve every contact in the preview");
  assert.equal(largeDraftsFromVcard[234].name, "Large Export 234");
  assert.equal(largeDraftsFromVcard[234].photo, `data:image/jpeg;base64,${largePhoto}`);
  assert.throws(() => t.vcardContacts(Array.from({ length: 501 }, (_, i) =>
    `BEGIN:VCARD\nFN:Contact ${i}\nEND:VCARD\n`,
  ).join("")), /500/, "the contact count cap is independent of file size");
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
  const bulk = await store.importPeopleContacts(largeDrafts, [], "bulk-index-00000001");
  assert.equal(bulk.createdIds.length, 499, "transaction index sees earlier contacts from its own batch");
  assert.equal(bulk.skipped, 1);
  const allowed = await store.importPeopleContacts([
    { ...largeDrafts[2], name: "Intentionally separate person", allowDuplicate: true },
  ], [], "bulk-index-00000002");
  assert.equal(allowed.createdIds.length, 1, "explicit duplicate creation remains available");
  const bulkRetry = await store.importPeopleContacts(largeDrafts, [], "bulk-index-00000001");
  assert.equal(bulkRetry.createdIds.length, 0, "bulk retries do not create more profiles");
  assert.equal(bulkRetry.skipped, 500);
  const sharedPhoneDrafts = t.vcardContacts([
    "BEGIN:VCARD", "VERSION:3.0", "FN:Shared phone labels",
    "TEL;TYPE=HOME:(202) 555-0142", "TEL;TYPE=WORK:+1 202-555-0142",
    "TEL;TYPE=CELL:+1 202-555-0143", "TEL;TYPE=CELL:+1 202-555-0144",
    "END:VCARD",
    "BEGIN:VCARD", "VERSION:3.0", "FN:Household member",
    "TEL;TYPE=HOME:+1 202-555-0142", "END:VCARD",
  ].join("\r\n"));
  const importedPhones = sharedPhoneDrafts[0].profile.phones;
  assert.deepEqual(importedPhones.map(entry => entry.category), ["personal", "work", "primary", "personal"]);
  assert.equal(importedPhones[0].number, importedPhones[1].number, "different formats normalize to the same number");
  const phoneReview = t.reviewContactDrafts(sharedPhoneDrafts, []);
  assert.deepEqual(phoneReview[1].matches, [{ id: sharedPhoneDrafts[0].key, reasons: ["Same phone"] }]);
  const selectedPhoneDrafts = sharedPhoneDrafts.map(draft => ({ ...draft, allowDuplicate: true }));
  const sharedImport = await store.importPeopleContacts(selectedPhoneDrafts, [], "shared-phone-00000001");
  assert.equal(sharedImport.createdIds.length, 2, "explicitly selected people may share a phone number");
  let sharedRecords = (await store.readPersonalRecords()).filter(record => sharedImport.createdIds.includes(record.id));
  const labelledContact = sharedRecords.find(record => record.title === "Shared phone labels");
  const savedPhones = importedPhones.map(entry => ({ ...entry, customLabel: undefined }));
  assert.deepEqual(labelledContact.profile.phones, savedPhones, "all numbers and labels survive persistence and reload");
  assert.equal(labelledContact.profile.phoneNumber, importedPhones[2].number, "legacy display uses the single primary number");
  assert.deepEqual(findPeopleDuplicates([labelledContact]), [], "repeated fields do not create a self-duplicate");
  const phoneMatches = findPeopleDuplicates(sharedRecords);
  assert.equal(phoneMatches.length, 1);
  assert.deepEqual(phoneMatches[0].reasons, ["Same phone"], "repeated fields yield one duplicate reason between people");
  const sharedRetry = await store.importPeopleContacts(selectedPhoneDrafts, [], "shared-phone-00000001");
  assert.equal(sharedRetry.createdIds.length, 0);
  assert.equal(sharedRetry.skipped, 2, "retry protection still applies to explicitly accepted duplicates");
  const editedPhones = [...savedPhones, {
    id: "shared-office", category: "custom", customLabel: "Shared office",
    number: importedPhones[0].number, countryCode: "+1",
  }];
  await store.updatePersonalRecord(labelledContact.id, { profile: { phones: editedPhones } });
  sharedRecords = await store.readPersonalRecords();
  assert.deepEqual(sharedRecords.find(record => record.id === labelledContact.id).profile.phones, editedPhones,
    "editing also preserves repeated numbers with distinct labels");
  await assert.rejects(() => store.updatePersonalRecord(labelledContact.id, {
    profile: { phones: [{ ...editedPhones[0], number: "not-a-phone" }] },
  }), /Phone 1/, "phone format validation remains enforced");
  await assert.rejects(() => store.updatePersonalRecord(labelledContact.id, {
    profile: { phones: [editedPhones[0], editedPhones[0]] },
  }), /unique id/i, "entry identifiers remain unique even when numbers repeat");
  console.log(
    "PASS: CSV/vCard parsing, shared phone import/edit/reload, primary phone selection, private-field exclusion, formula protection, atomic employer linking, indexed 500-contact review/import, retries, duplicates, rollback, and undo.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
