export type LinkedImagePreview = { imageUrl?: string; imageUpdatedAt?: string };

/** Only known private picture routes and HTTPS assets may render as linked identities. */
export function linkedImageSource(preview?: LinkedImagePreview) {
  const raw = preview?.imageUrl || "";
  const safe = /^\/api\/people\/photos\/personal-[0-9a-f-]+$/i.test(raw)
    || /^\/api\/projects\/photos\/[a-z0-9_-]+$/i.test(raw)
    || /^https:\/\//.test(raw);
  return safe ? raw + (preview?.imageUpdatedAt ? (raw.includes("?") ? "&" : "?") + "v=" + encodeURIComponent(preview.imageUpdatedAt) : "") : "";
}
