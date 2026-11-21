import { randomUUID } from "node:crypto";
import { listJsonFileSummaries, mutateJsonFile, readJsonFile } from "../../file-store";
import { boardContents, boardNames, boardSummary, CanvasError, canvasId, type Board, type BoardSummary } from "./model";
import { BOARD_PREFIX, boardSourceIndex } from "./placements";

const PREFIX = BOARD_PREFIX;
type SavedBoard = { board: Board; summary: BoardSummary };
const key = (id: unknown) => PREFIX + canvasId(id) + ".json";
const document = (board: Board) => ({board, summary: boardSummary(board), sourceIndexVersion:1, sourceIndex:boardSourceIndex(board)});

export const listBoardSummaries = () => listJsonFileSummaries<BoardSummary>(PREFIX);
export async function getBoard(id: unknown) {
  const saved = await readJsonFile<SavedBoard | null>(key(id), null);
  if (!saved) throw new CanvasError("Board not found.", 404);
  return saved.board;
}
export async function createBoard(input: Record<string, unknown>) {
  const id = input.id === undefined ? randomUUID() : canvasId(input.id);
  const names = boardNames(input);
  return mutateJsonFile<SavedBoard | null, Board>(key(id), null, current => {
    // A retried create returns the existing board, including any subsequent edits.
    if (current) return { value: current, result: current.board, changed: false };
    const board: Board = { id, ...names, revision: 1, updatedAt: new Date().toISOString(), nodes: [], edges: [], views: [] };
    return { value: document(board), result: board };
  });
}
export async function updateBoard(input: Record<string, unknown>, expectedRevision: unknown) {
  const id = canvasId(input.id);
  if (typeof expectedRevision !== "number" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new CanvasError("A saved board revision is required.");
  }
  const contents = boardContents(input);
  return mutateJsonFile<SavedBoard | null, Board>(key(id), null, current => {
    if (!current) throw new CanvasError("Board not found.", 404);
    const previous = current.board;
    if (previous.revision !== expectedRevision) {
      // A successful write whose response was lost can be retried without a false conflict.
      if (previous.revision === expectedRevision + 1 && JSON.stringify(contents) === JSON.stringify(boardContents(previous))) {
        return { value: current, result: previous, changed: false };
      }
      throw new CanvasError("This board was updated in another window. Load the latest version to continue.", 409);
    }
    const board = { ...previous, ...contents, revision: previous.revision + 1, updatedAt: new Date().toISOString() };
    return { value: document(board), result: board };
  });
}
