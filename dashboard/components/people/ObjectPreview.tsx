"use client";
import { useEffect, useRef, useState } from "react";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import type { VaultObjectSnapshot, VaultMediaManifest } from "../../lib/local-first/types";
import type { PersonalResourceGradient } from "../../lib/personal-records-store";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { resourceGradientStyle } from "../resources/ResourceVisual";
import { readCanonicalMetadata } from "../../lib/local-first/canonical-record";

export type ObjectPreviewData = { id: string; imageUrl?: string; updatedAt?: string; gradient?: PersonalResourceGradient; mediaType?: string };
let mediaLookup: Promise<VaultObjectSnapshot[]> | undefined;
function visibleMedia() {
  return mediaLookup ??= import("../../lib/local-first/browser-engine").then(({ browserVault }) => browserVault.isUnlocked() ? browserVault.listObjects(["media"]) : [])
    .finally(() => { mediaLookup = undefined; });
}
export default function ObjectPreview({ target, preview, icon }: { target: NativeObjectRef; preview?: ObjectPreviewData; icon: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const [mediaUrl, setMediaUrl] = useState("");
  const [failed, setFailed] = useState("");
  useEffect(() => {
    if (target.module !== "media" || !box.current) return;
    let active = true, started = false, url = "";
    const clear = () => { if (url) URL.revokeObjectURL(url); url = ""; setMediaUrl(""); };
    const observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting || started) return;
      started = true;
      void import("../../lib/local-first/browser-engine").then(async ({ browserVault }) => {
        if (!active || !browserVault.isUnlocked()) return;
        const objects = await visibleMedia();
        const object = objects.find(item => !item.tombstone && (readCanonicalMetadata(item.fields)?.recordId === target.objectId || item.fields.canonicalRecordId === target.objectId || item.objectId === target.objectId));
        if (!(object?.fields.mediaManifest as unknown as VaultMediaManifest)?.mimeType.startsWith("image/")) return;
        const { smallPreview } = await import("../../lib/modules/media/thumbnail");
        const blob = await smallPreview(object as VaultObjectSnapshot);
        if (active && browserVault.isUnlocked()) { url = URL.createObjectURL(blob); setMediaUrl(url); }
      }).catch(() => undefined);
    });
    observer.observe(box.current);
    window.addEventListener("unigentamos-vault-locked", clear);
    return () => { active = false; observer.disconnect(); clear(); window.removeEventListener("unigentamos-vault-locked", clear); };
  }, [target.module, target.objectId]);
  const source = mediaUrl || (preview?.imageUrl ? preview.imageUrl + (preview.updatedAt ? `?v=${encodeURIComponent(preview.updatedAt)}` : "") : "");
  const initials = target.label.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("");
  const type = preview?.mediaType?.startsWith("video/") ? "Video" : preview?.mediaType?.startsWith("audio/") ? "Audio" : preview?.mediaType === "application/pdf" ? "PDF" : "File";
  return <span ref={box} className="people-object-picker-result-icon" data-preview-kind={target.objectType} style={preview?.gradient ? resourceGradientStyle(preview.gradient) : undefined}>
    {source && failed !== source ? <img src={source} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(source)} />
      : target.module === "people" || target.module === "projects" ? <span className="object-preview-initials">{initials}</span>
      : <><UnigentamosIcon role={icon} size={20} />{target.module === "media" && <small>{type}</small>}</>}
  </span>;
}
