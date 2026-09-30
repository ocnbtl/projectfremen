// Refresh the small, public place-level extract; never runs during a build.
// Source: https://www.census.gov/programs-surveys/acs/data/summary-file.2024.html
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const tables = ["b01003", "b01002", "b19013"];
const root =
  "https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/";
const number = (value) => (/^\d+(\.\d+)?$/.test(value) ? Number(value) : null);
const sources = await Promise.all(
  tables.map(async (table) => {
    const url = `${root}acsdt5y2024-${table}.dat`;
    const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
    assert(response.ok, `${table}: HTTP ${response.status}`);
    const hash = createHash("sha256"),
      decoder = new TextDecoder(),
      rows = new Map();
    let buffer = "",
      header = false,
      bytes = 0;
    function line(text) {
      const fields = text.trimEnd().split("|");
      if (!header) {
        assert.equal(fields[0], "GEO_ID");
        assert.equal(fields[1], `${table.toUpperCase()}_E001`);
        assert.equal(fields[2], `${table.toUpperCase()}_M001`);
        header = true;
      } else if (/^1600000US\d{7}$/.test(fields[0])) {
        const id = fields[0].slice(9);
        assert(!rows.has(id), `Duplicate ${id}`);
        rows.set(id, [number(fields[1]), number(fields[2])]);
      }
    }
    for await (const chunk of response.body) {
      bytes += chunk.length;
      hash.update(chunk);
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      lines.forEach(line);
    }
    buffer += decoder.decode();
    if (buffer.trim()) line(buffer);
    assert(
      rows.size > 30000 && rows.size < 40000,
      `Unexpected ${table} place count: ${rows.size}`,
    );
    console.log(`${table}: ${rows.size} places, ${bytes} bytes`);
    return { url, sha256: hash.digest("hex"), bytes, rows };
  }),
);
const ids = [...sources[0].rows.keys()].sort();
for (const source of sources)
  assert.deepEqual([...source.rows.keys()].sort(), ids);
const data = {
  period: "2020–2024",
  geography: "place",
  source: "US Census ACS 5-year summary files",
  sourceUrl:
    "https://www.census.gov/programs-surveys/acs/data/summary-file.2024.html",
  fields: [
    "GEOID",
    "population",
    "populationMOE",
    "age",
    "ageMOE",
    "income",
    "incomeMOE",
  ],
  sources: sources.map(({ rows, ...metadata }) => metadata),
  rows: ids.map((id) => [
    id,
    ...sources.flatMap((source) => source.rows.get(id)),
  ]),
};
const output = new URL("../data/map/census-places-2024.json", import.meta.url);
await mkdir(new URL("../data/map/", import.meta.url), { recursive: true });
await writeFile(output, JSON.stringify(data) + "\n");
console.log(
  `Wrote ${ids.length} reconciled places to ${fileURLToPath(output)}`,
);
