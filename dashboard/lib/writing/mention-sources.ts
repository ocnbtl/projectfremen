import { providerDocumentVersions, withReadOnlyDocuments } from "../file-store";
import type { Board, BoardSummary } from "../modules/canvas/model";
import { getBoard, listBoardSummaries } from "../modules/canvas/store";
import { BOARD_PREFIX } from "../modules/canvas/placements";
import { WELLNESS_SECTIONS } from "../modules/personal-wellness/types";
import { readStoredPersonalRecords, type PersonalRecord } from "../personal-records-store";
import { boardWritingSources } from "./board-sources";
import { readExtraWritingSources } from "./extra-sources";
import type { MentionSources } from "./mentions";
import { recordWritingSources } from "./record-sources";
import type { WritingSource } from "./usage";

const marked = (text?: string) => text?.includes("](/admin/");
type MarkedBoard = Pick<Board,"id"|"revision"|"updatedAt"|"title"|"nodes"> & { cardNumbers: number[] };

// Cache only cards with writing markers. Reapply current Media ownership on every lookup.
const cache = new Map<string,{board: MarkedBoard; size: number}>();
const loading = new Map<string,Promise<MarkedBoard>>();
let cacheSize = 0;
async function readMarkedBoard(summary: BoardSummary) {
  const key = JSON.stringify([summary.id, summary.revision, summary.updatedAt]);
  const cached = cache.get(key);
  if (cached) return cached.board;
  const pending = loading.get(key);
  if (pending) return pending;
  const read = getBoard(summary.id).then(board => {
    const {id, revision, updatedAt, title} = board;
    const data: MarkedBoard = {id, revision, updatedAt, title, nodes:[], cardNumbers:[]};
    board.nodes.forEach((node, i) => {
      if (!(marked(node.title) || marked(node.body) || marked(node.notes) || node.imagePins?.some(pin => marked(pin.text)))) return;
      data.nodes.push(node);
      data.cardNumbers.push(i + 1);
    });
    if (revision === summary.revision && updatedAt === summary.updatedAt && Number.isSafeInteger(revision)) {
      const size = JSON.stringify(data).length;
      if (size <= 1_000_000) {
        cache.set(key, {board:data, size});
        cacheSize += size;
        while (cache.size > 1024 || cacheSize > 2_000_000) {
          const [oldest, entry] = cache.entries().next().value!;
          cache.delete(oldest);
          cacheSize -= entry.size;
        }
      }
    }
    return data;
  }).finally(() => loading.delete(key));
  loading.set(key, read);
  return read;
}

function scanMentionSources(): Promise<MentionSources> {
  return withReadOnlyDocuments(async () => {
    const aliases = new Map<string,string>(), unavailable = new Set<string>();
    const [records, boards, extra] = await Promise.allSettled([
      readStoredPersonalRecords(), listBoardSummaries(), readExtraWritingSources(unavailable,"object",aliases)
    ]);
    const sources: WritingSource[] = [];
    const media = new Map<string,PersonalRecord>();
    if (records.status === "fulfilled") {
      for (const row of records.value) {
        if (row.className === "file") {
          media.set(row.id, row);
          if (row.mediaProfile?.manifest.objectId) media.set(row.mediaProfile.manifest.objectId, row);
        }
        if (row.className === "interaction" && row.domain === "notes-docs" && row.status !== "inactive" && !row.archivedAt) {
          aliases.set("/admin/people?interaction="+encodeURIComponent(row.id), "/admin/notes/"+encodeURIComponent(row.id));
        }
      }
      sources.push(...recordWritingSources(records.value,true).filter(source => marked(source.text)));
    } else unavailable.add("Notes, Media, People and Resources");
    if (extra.status === "fulfilled") sources.push(...extra.value);
    else unavailable.add("other workspaces");
    if (boards.status === "fulfilled") {
      for (let start = 0; start < boards.value.length; start += 4) {
        const batch = await Promise.allSettled(boards.value.slice(start,start+4).map(readMarkedBoard));
        for (const result of batch) {
          if (result.status === "rejected") { unavailable.add("some Canvas boards"); continue; }
          const board = result.value;
          sources.push(...boardWritingSources(board,media,board.cardNumbers).filter(source => marked(source.text)));
        }
      }
    } else unavailable.add("Canvas");
    return {sources, aliases, unavailable:[...unavailable].sort()};
  });
}

// The provider updates app_state.updated_at on every write. A warm lookup checks the
// relevant versions only. Bundled fallbacks are immutable within a deployment.
const documents = ["personal-records.json","projects.json","planning-records.json","personal-ops.json","entity-goals.json",
  "review-runs.json","finance.json","personal-life.json","personal-dog-tracker.json","map-travel-records.json",
  ...WELLNESS_SECTIONS.map(section => "personal-"+section+".v1.json")];
let previous: {version:string; snapshot:MentionSources} | undefined;
const scans = new Map<string,Promise<MentionSources>>();

export async function readMentionSources() {
  const version = await providerDocumentVersions(documents, BOARD_PREFIX).catch(() => null);
  if (version === null) return scanMentionSources();
  if (previous?.version === version) return previous.snapshot;
  const pending = scans.get(version);
  if (pending) return pending;
  const read = scanMentionSources().then(snapshot => {
    const chars = snapshot.sources.reduce((sum,row) => sum + row.text.length + row.title.length + row.href.length + row.key.length, 0);
    if (!snapshot.unavailable.length && chars <= 2_000_000 && snapshot.aliases.size < 20_000) previous = {version,snapshot};
    return snapshot;
  }).finally(() => scans.delete(version));
  scans.set(version, read);
  return read;
}
