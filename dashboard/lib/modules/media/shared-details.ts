import type { PersonalRecord } from "../../personal-records-store";

export type SharedMediaDetails = {
  id: string;
  title: string;
  body: string;
  notes: string;
  updatedAt: string;
  captionEdited: boolean;
  titleEdited: boolean;
  storage: "account" | "vault" | "reference";
};
export type MediaText = Pick<SharedMediaDetails,"title" | "body" | "notes">;

export function mediaRecordDetails(record: PersonalRecord): SharedMediaDetails {
  return {
    id: record.id, title: record.title, body: record.body, notes: record.mediaNotes || "",
    updatedAt: record.updatedAt, captionEdited: record.mediaCaptionEdited === true, titleEdited:record.mediaTitleEdited === true,
    storage: record.mediaProfile ? (record.mediaProfile.accountFile ? "account" : "vault") : "reference",
  };
}
