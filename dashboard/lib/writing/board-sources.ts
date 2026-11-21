import type { Board } from "../modules/canvas/model";
import { sourceObjectId } from "../modules/canvas/source-reference";
import type { PersonalRecord } from "../personal-records-store";
import type { WritingSource } from "./usage";
import { legacyAdPrompt } from "./legacy-prompt";

export function boardWritingSources(board: Board, media: Map<string, PersonalRecord>): WritingSource[] {
  const result: WritingSource[] = [];
  for (const [i, node] of board.nodes.entries()) {
    const href = "/admin/personal/canvas?" + new URLSearchParams({board:board.id, card:node.id});
    const mediaId = node.ref?.module === "media" ? sourceObjectId(node.ref) : undefined;
    const file = mediaId ? media.get(mediaId) : undefined;
    const title = [board.title, file?.title || (!mediaId && node.title) || "Card " + (i + 1)].join(" / ");
    const add = (field: string, text?: string, fieldId = field) => {
      if (text) result.push({key:["canvas", board.id, node.id, fieldId].join(":"), title, area:"Canvas", field, href, text, updatedAt:board.updatedAt,
        ...(field === "Notes" ? {legacyPrompt:legacyAdPrompt(text)} : {})});
    };
    if (!mediaId) {
      add("Title", node.title);
      add("Text", node.body);
      add("Notes", node.notes);
    } else if (file && !file.archivedAt && !file.mediaProfile?.archivedAt) {
      // Media owns these fields. Only include distinct board-only overrides that
      // Canvas still displays, never cached copies of edited or cleared Media text.
      if (!file.mediaTitleEdited && file.title === node.ref?.label && node.title !== file.title) add("Board title", node.title);
      if (!file.mediaCaptionEdited && !file.body) add("Board caption", node.body);
    }
    node.imagePins?.forEach((pin, index) => add("Pin " + (index + 1), pin.text, "pin:" + pin.id));
  }
  return result;
}
