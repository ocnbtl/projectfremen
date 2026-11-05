import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { ADDRESS_COUNTRIES } from "./place-address";

const norm = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
type Row = [string, string, string, string, number, number];
type Index = { names: Map<string, Row[]>; regions: Record<string,string> };
let cached: Promise<Index> | undefined;
function index(): Promise<Index> {
  return cached ??= readFile(path.join(process.cwd(), "lib/modules/planning/locality-centers.gz")).then(bytes => {
    const { cities, regions } = JSON.parse(gunzipSync(bytes).toString()) as {cities: Row[]; regions: Index["regions"]};
    const names = new Map<string, Row[]>();
    for (const row of cities) for (const key of new Set([norm(row[0]), norm(row[1])].filter(Boolean))) {
      const rows = names.get(key); if (rows) rows.push(row); else names.set(key, [row]);
    }
    return {names,regions};
  }).catch(err => { cached = undefined; throw err; });
}
// Match the entire locality, including a supplied state/country. Do not choose
// between distant cities with the same name on the strength of population.
export async function resolveVenueLocality(text: string, country?: string) {
  const {names,regions} = await index();
  const words = norm(text).split(" ");
  for (let n = words.length; n > 0; n--) {
    const rows = names.get(words.slice(0,n).join(" "));
    if (!rows) continue;
    const suffix = words.slice(n).join(" ");
    const hits = rows.filter(([, , cc, admin]) => {
      if (country && cc !== country) return false;
      const countries = [cc, ADDRESS_COUNTRIES[cc]?.name, ...(cc === "US" ? ["USA"] : cc === "GB" ? ["UK"] : [])].filter(Boolean).map(norm);
      const areas = [admin, regions[cc + "." + admin]].filter(Boolean).map(norm);
      return !suffix || [...countries,...areas,...areas.flatMap(a => countries.map(c => a + " " + c))].includes(suffix);
    });
    const h = hits[0];
    if (h && hits.every(r => r[2] === h[2] && Math.abs(r[4] - h[4]) < .015 && Math.abs(r[5] - h[5]) < .015))
      return { latitude:h[4], longitude:h[5], countryCode:h[2], city:h[0] };
  }
}
