"use client";
import { useState } from "react";
import Link from "next/link";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import PeopleObjectPicker, { objectTargetKey } from "../people/PeopleObjectPicker";
import { PersonAvatar } from "./EventPeople";
import { EventObjectIdentity } from "./EventObjects";
import type { NativeObjectRef } from "../../lib/native-objects/types";
export default function RecordLinks({
  refs,
  available = [],
  onChange,
  objectPicker = false,
  pickerLabel,
}: {
  refs: NativeObjectRef[];
  available?: NativeObjectRef[];
  onChange?: (refs: NativeObjectRef[]) => void;
  objectPicker?: boolean;
  pickerLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const key = (ref: NativeObjectRef) =>
    `${ref.module}:${ref.objectType}:${ref.objectId}`;
  const options = query.trim()
    ? available
        .filter(
          (ref) =>
            ref.label.toLowerCase().includes(query.toLowerCase()) &&
            !refs.some((x) => key(x) === key(ref)),
        )
        .slice(0, 12)
    : [];
  return (
    <div className={objectPicker ? `work-object-links${pickerLabel ? " work-object-links--labeled" : ""}` : undefined}>
      {onChange && objectPicker && <div className="work-object-link-trigger"><PeopleObjectPicker iconOnly showTriggerLabel={Boolean(pickerLabel)} triggerIcon="object-add" triggerLabel={pickerLabel} targets={available.filter((ref) => !refs.some((linked) => key(linked) === key(ref)))} value="" onChange={(value) => {
        const ref = available.find((candidate) => objectTargetKey(candidate) === value);
        if (ref && !refs.some((linked) => key(linked) === key(ref))) onChange([...refs, ref]);
      }} /></div>}
      <div className="work-links">
        {refs.map((ref) => (
          <span key={key(ref)}>
            <Link href={ref.route}>
              {ref.module === "people" && ref.objectType === "person" ? <PersonAvatar person={available.find(x => x.module === "people" && x.objectId === ref.objectId) || ref} /> : <EventObjectIdentity record={available.find(x => x.module === ref.module && x.objectType === ref.objectType && x.objectId === ref.objectId) || ref} />}
              {ref.label}
            </Link>
            {onChange && (
              <button
                type="button"
                className="work-button work-button--quiet"
                onClick={() =>
                  onChange(refs.filter((x) => key(x) !== key(ref)))
                }
                aria-label={`Unlink ${ref.label}`}
              >
                <UnigentamosIcon role="close" size={14} />
              </button>
            )}
          </span>
        ))}
      </div>
      {onChange && !objectPicker && (
        <label>
          Link a record
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a person, project, note, place…"
          />
        </label>
      )}
      {options.length > 0 && (
        <div aria-label="Matching records">
          {options.map((ref) => (
            <button
              type="button"
              className="work-row"
              key={key(ref)}
              onClick={() => {
                onChange?.([...refs, ref]);
                setQuery("");
              }}
            >
              <RecordIdentity record={ref} />

              <div>
                <strong>{ref.label}</strong>
                <small>
                  {ref.objectType.replaceAll("_", " ")} ·{" "}
                  {ref.module.replace("_", " ")}
                </small>
                {(ref as PreviewRef).preview?.detail && (
                  <small>{(ref as PreviewRef).preview?.detail}</small>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
      {query && options.length === 0 && (
        <p className="work-muted">No matching records.</p>
      )}
    </div>
  );
}

type PreviewRef = NativeObjectRef & {
  preview?: { imageUrl?: string; detail?: string };
};
function RecordIdentity({ record }: { record: PreviewRef }) {
  const [failed, setFailed] = useState(false),
    url = record.preview?.imageUrl || "";
  const safe =
    /^\/api\/people\/photos\/personal-[0-9a-f-]+$/i.test(url) ||
    /^https:\/\//.test(url);
  return (
    <span className="work-record-identity">
      {safe && !failed ? (
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : record.module === "people" ? (
        <span>
          {record.label
            .split(/\s+/)
            .slice(0, 2)
            .map((x) => x[0])
            .join("")}
        </span>
      ) : (
        <UnigentamosIcon
          role={`module-${record.module === "personal_ops" ? "personal" : record.module}`}
          size={20}
        />
      )}
    </span>
  );
}
