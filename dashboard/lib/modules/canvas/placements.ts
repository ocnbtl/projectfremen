import { createHash } from "node:crypto";
import { queryJsonFilePage, readJsonFile } from "../../file-store";
import { canvasId, CanvasError, type Board } from "./model";
import { sourceObjectId, type BoardSourceModule, type PlacementPage } from "./source-reference";

export const BOARD_PREFIX = "personal-canvas-board-";
const PAGE_SIZE = 4;
type Card = [id:string, number:number];
type Index = Record<string,Card[]>;
type IndexedBoard = {board:Board; sourceIndex?:Index};
type CompactBoard = {id:string; title:string; index:Index};

function sourceKey(module:BoardSourceModule, id:string) {
  const normalized = module === "projects" ? id.trim().toLowerCase() : id;
  // JSON path identifiers stay short and safe for arbitrary user-owned source IDs.
  return "s" + createHash("sha256").update(module + "\0" + normalized).digest("hex");
}

export function boardSourceIndex(board:Board):Index {
  const index:Index = {};
  board.nodes.forEach((node,position) => {
    if (node.kind !== "object" || !node.ref) return;
    const id = sourceObjectId(node.ref);
    if (!id) return;
    const key = sourceKey(node.ref.module as BoardSourceModule,id);
    (index[key] ??= []).push([node.id,position + 1]);
  });
  return index;
}

// Older boards have no stored projection. Cache only their compact index and
// invalidate by revision. Local files use an atomic replacement token instead.
const cached = new Map<string,{version:string; value:CompactBoard}>();
async function readIndex(fileName:string, version:string) {
  const previous = cached.get(fileName);
  if (previous?.version === version) return previous.value;
  const doc = await readJsonFile<IndexedBoard | null>(fileName,null);
  if (!doc) throw new CanvasError("This board is no longer available.",404);
  const value = {id:doc.board.id,title:doc.board.title,index:doc.sourceIndex ?? boardSourceIndex(doc.board)};
  if (cached.size >= 64) cached.delete(cached.keys().next().value!);
  cached.set(fileName,{version,value});
  return value;
}

type Projected = {
  key:string; id:string; title:string; revision:number; indexed:number | null;
  [column:`hits${number}`]:Card[] | null;
};
function project(board:CompactBoard, keys:string[]) {
  return Object.fromEntries(keys.map((key,i)=>["hits"+i,board.index[key] ?? null]));
}

export async function boardPlacements(module:BoardSourceModule, ids:string[], after:string | null):Promise<PlacementPage> {
  if (!ids.length || ids.length > 3 || ids.some(id=>!id.trim() || id.length > 350)) throw new CanvasError("Choose a valid source object.");
  const keys = [...new Set(ids.map(id=>sourceKey(module,id)))];
  const hits = keys.map((key,i)=>"hits"+i+":value->sourceIndex->"+key);
  const rows = await queryJsonFilePage<Projected>({
    prefix:BOARD_PREFIX, after:after ? BOARD_PREFIX+canvasId(after)+".json" : "", limit:PAGE_SIZE,
    select:["key","id:value->summary->>id","title:value->summary->>title","revision:value->summary->revision","indexed:value->sourceIndexVersion",...hits].join(","),
    or:"("+["value->sourceIndexVersion.is.null",...keys.map(key=>"value->sourceIndex->"+key+".not.is.null")].join(",")+")",
    local:async (fileName,version)=>{
      const board = await readIndex(fileName,version);
      return {key:fileName,id:board.id,title:board.title,indexed:1,revision:0,...project(board,keys)};
    }
  });
  const placements:PlacementPage["placements"] = [];
  for (const row of rows) {
    let matches = row;
    if (!row.indexed) {
      const board = await readIndex(row.key,"revision:"+row.revision);
      matches = {...row,id:board.id,title:board.title,...project(board,keys)};
    }
    for (let i=0; i<keys.length; i++) {
      for (const [cardId,cardNumber] of matches[`hits${i}`] ?? []) {
        placements.push({boardId:matches.id,boardTitle:matches.title,cardId,cardNumber});
      }
    }
  }
  return {placements,next:rows.length === PAGE_SIZE ? rows[rows.length-1].id : null};
}
