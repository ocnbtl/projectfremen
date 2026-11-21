import type { PersonalRecord } from "../personal-records-store";
import { isLegacyNoteRecord } from "../modules/notes/legacy-adapter";
import { getNativeObjectRoute } from "../native-objects/routes";
import type { ModuleId } from "../native-objects/types";
import type { WritingSource } from "./usage";
import { legacyAdPrompt } from "./legacy-prompt";
import { decodeStyleGuideComponent, STYLE_GUIDE_AREA } from "../modules/style-guide/component-resource";

export function recordWritingSources(records: PersonalRecord[], forMentions = false): WritingSource[] {
  const result: WritingSource[] = [];
  for (const record of records) {
    if (record.archivedAt || record.mediaProfile?.archivedAt || record.resourceProfile?.deletedAt) continue;
    let module: ModuleId, area: string, objectType: string;
    const fields: [string, string | undefined][] = [["Title", record.title]];
    if (record.className === "file") {
      module = "media"; area = "Media"; objectType = "media_asset";
      fields.push(["Caption", record.body], ["Notes", record.mediaNotes], ["Alt text", record.mediaProfile?.altText]);
    } else if (record.className === "resource") {
      if (["archived", "merged", "replaced"].includes(record.resourceProfile?.lifecycle ?? "")) continue;
      module = "resources"; area = "Resources"; objectType = "resource";
      if (forMentions && record.areas?.some(area => area.toLowerCase() === STYLE_GUIDE_AREA.toLowerCase())) {
        const component = decodeStyleGuideComponent(record.body);
        fields.push(["Visual", component.visual], ["Animation", component.animation]);
      } else fields.push(["Description", record.body]);
      record.resourceProfile?.notes.forEach((note, i) => fields.push(["Note " + (i + 1), note]));
    } else if (record.className === "person" || record.className === "org") {
      module = "people"; area = "People"; objectType = record.className === "org" ? "organization" : "person";
      fields.push(["Description", record.body], ["Notes", record.profile?.notes], ["Context", record.profile?.context]);
    } else if (isLegacyNoteRecord(record)) {
      if (record.status === "inactive") continue;
      module = "notes"; area = "Notes"; objectType = "note";
      fields.push(["Body", record.body]);
    } else continue;

    const href = getNativeObjectRoute({module, objectType, objectId:record.id});
    for (const [field, text] of fields) {
      if (!text) continue;
      const source: WritingSource = {key:[module, record.id, field].join(":"), title:record.title, field, area, text, href, updatedAt:record.updatedAt};
      if ((module === "notes" && field === "Body") || (module === "resources" && ["Description","Visual","Animation"].includes(field))) source.markdown = true;
      if (module === "media" && field === "Notes") source.legacyPrompt = legacyAdPrompt(text);
      if (module === "notes" && record.className === "prompt" && field === "Body") source.promptRecord = true;
      result.push(source);
    }
  }
  return result;
}
