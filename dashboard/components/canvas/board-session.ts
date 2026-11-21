import { boardContents,type Board } from "../../lib/modules/canvas/model";
import { buildCsrfHeaders, buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { notifyWritingSourcesChanged } from "../../lib/writing/source-changes";

const endpoint = "/api/personal/canvas";
export class BoardRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function canvasRequest<T>(suffix = "", method = "GET", input?: unknown): Promise<T> {
  const response = await fetch(endpoint + suffix, {
    method,
    cache: "no-store",
    headers: input ? buildJsonHeadersWithCsrf() : undefined,
    body: input ? JSON.stringify(input) : undefined
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    throw new BoardRequestError(typeof result?.error === "string" ? result.error : "Canvas couldn’t reach your saved boards.", response.status);
  }
  return result;
}

export async function getBoard(id: string) {
  return (await canvasRequest<{ board: Board }>("?id=" + encodeURIComponent(id))).board;
}

function sameContent(a: Board, b: Board) {
  // A retried save can return the same frame fields in the server's canonical key order.
  return JSON.stringify(boardContents(a)) === JSON.stringify(boardContents(b));
}

// Moving and resizing cards do not change where a mention was written.
function mentionedText(board: Board) {
  const marked = board.nodes.flatMap(node => {
    const fields = [node.title,node.body,node.notes,...(node.imagePins ?? []).map(pin => pin.text)];
    if (!fields.some(value => value?.includes("](/admin/"))) return [];
    return [[node.id,node.title,node.ref?.route,...fields]];
  });
  return marked.length ? JSON.stringify([board.title,marked]) : "";
}

export class BoardSession {
  board: Board;
  private saved: Board;
  private timer?: ReturnType<typeof setTimeout>;
  private saving?: Promise<boolean>;
  private copyId?: string;
  status = "Saved";
  error = "";
  conflict = false;

  constructor(board: Board, private changed: () => void) {
    this.board = this.saved = board;
  }

  listen(callback: () => void) { this.changed = callback; }

  get dirty() { return this.board !== this.saved; }

  edit(board: Board) {
    if (board.id !== this.board.id) return;
    this.board = board;
    clearTimeout(this.timer);
    if (!this.conflict) {
      this.status = "Saving…";
      this.timer = setTimeout(() => { void this.flush(); }, 450);
    }
    this.changed();
  }

  async flush(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.conflict) return false;
    if (!this.dirty) return true;
    if (!this.saving) this.saving = this.drain().finally(() => { this.saving = undefined; });
    return this.saving;
  }

  private async drain() {
    this.error = "";
    this.status = "Saving…";
    this.changed();
    while (this.dirty) {
      const snapshot = this.board;
      try {
        let result: Board;
        try {
          const response = await canvasRequest<{ board: Board }>("", "PUT", {board:snapshot, expectedRevision:this.saved.revision});
          result = response.board;
        } catch (error) {
          if (!(error instanceof BoardRequestError) || error.status !== 409) throw error;
          // An interrupted response can follow a successful write. Read once to distinguish it from a real conflict.
          result = await getBoard(snapshot.id);
          if (!sameContent(snapshot,result)) {
            this.conflict = true;
            throw new Error("This board changed in another tab. Save your edits as a separate board to keep both versions.");
          }
        }
        if (mentionedText(this.saved) !== mentionedText(result)) notifyWritingSourcesChanged();
        this.saved = result;
        this.board = this.board === snapshot ? result : {...this.board, revision:result.revision, updatedAt:result.updatedAt};
      } catch (error) {
        this.status = "Unsaved changes";
        this.error = error instanceof Error ? error.message : "Your edits are still open. Try saving again.";
        this.changed();
        return false;
      }
    }
    this.status = "Saved";
    this.changed();
    return true;
  }

  /** Keep a stable destination across retries, including an interrupted response after creation. */
  async saveCopy() {
    this.copyId ||= crypto.randomUUID();
    const title = this.board.title.slice(0, 151) + " (copy)";
    const { board: empty } = await canvasRequest<{board:Board}>("", "POST", {id:this.copyId, title, folder:this.board.folder});
    const copy = {...this.board, title, id:empty.id, revision:empty.revision};
    if (sameContent(empty,copy)) return empty;
    if (empty.revision !== 1) throw new Error("The recovery copy has also changed. Your edits are still open.");
    const savedCopy = (await canvasRequest<{board:Board}>("", "PUT", {board:copy, expectedRevision:empty.revision})).board;
    if (mentionedText(savedCopy)) notifyWritingSourcesChanged();
    return savedCopy;
  }
}

// A browser Back navigation can unmount the editor while offline. Keep that tab's
// pending edits in memory until the user returns, bounded by the login session.
const detached = new Map<string, BoardSession>();
let login = "";
function currentDrafts() {
  const token = buildCsrfHeaders()["x-csrf-token"] || "";
  if (login !== token) { detached.clear(); login = token; }
  return token ? detached : null;
}

export function takePendingBoard(id: string) {
  const drafts = currentDrafts();
  const session = drafts?.get(id);
  drafts?.delete(id);
  return session?.dirty ? session : undefined;
}

export function keepPendingBoard(session: BoardSession) {
  const drafts = currentDrafts();
  const id = session.board.id;
  if (session.dirty) drafts?.set(id, session);
  session.listen(() => {});
  void session.flush().then(saved => {
    if (saved && drafts?.get(id) === session) drafts.delete(id);
  });
}
