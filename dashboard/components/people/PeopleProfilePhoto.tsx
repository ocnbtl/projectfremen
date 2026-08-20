"use client";

import { useEffect, useRef, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";

type PhotoMetadata = {
  url: string;
  updatedAt: string;
  byteLength: number;
};

type PhotoResponse = {
  ok: boolean;
  photo?: PhotoMetadata;
  error?: string;
};

export function PeopleProfileAvatar({
  label,
  initials,
  photoUrl,
  photoUpdatedAt,
  compact = false,
  onSelect
}: {
  label: string;
  initials: string;
  photoUrl?: string;
  photoUpdatedAt?: string;
  compact?: boolean;
  onSelect?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoUrl, photoUpdatedAt]);
  const image = photoUrl && !failed ? (
    <img
      src={`${photoUrl}${photoUpdatedAt ? `?v=${encodeURIComponent(photoUpdatedAt)}` : ""}`}
      alt=""
      onError={() => setFailed(true)}
    />
  ) : <span aria-hidden="true">{initials}</span>;

  if (onSelect) {
    return (
      <button
        type="button"
        className={`people-avatar people-profile-photo-trigger${compact ? " is-compact" : ""}`}
        aria-label={`${photoUrl ? "Change" : "Add"} profile picture for ${label}`}
        onClick={onSelect}
      >
        {image}
        <span className="people-profile-photo-badge" aria-hidden="true">+</span>
      </button>
    );
  }
  return <span className={`people-row-avatar people-profile-photo${compact ? " is-compact" : ""}`}>{image}</span>;
}

async function prepareProfilePhoto(source: Blob): Promise<File> {
  if (!source.type.startsWith("image/")) throw new Error("Choose an image from your device or clipboard.");
  const bitmap = await createImageBitmap(source);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sourceX = Math.max(0, (bitmap.width - side) / 2);
    const sourceY = Math.max(0, (bitmap.height - side) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the picture.");
    context.drawImage(bitmap, sourceX, sourceY, side, side, 0, 0, 512, 512);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.84));
    if (!blob) throw new Error("This browser could not prepare the picture.");
    return new File([blob], "profile-picture.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

function csrfHeadersWithoutJson(): Record<string, string> {
  const headers = { ...buildJsonHeadersWithCsrf() };
  delete headers["Content-Type"];
  delete headers["content-type"];
  return headers;
}

export default function PeopleProfilePhotoDialog({
  open,
  personId,
  personName,
  hasPhoto,
  onClose,
  onSaved,
  onRemoved
}: {
  open: boolean;
  personId: string;
  personName: string;
  hasPhoto: boolean;
  onClose: () => void;
  onSaved: (photo: PhotoMetadata) => Promise<boolean>;
  onRemoved: () => Promise<boolean>;
}) {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError("");
    setConfirmRemove(false);
    window.setTimeout(() => dialogRef.current?.focus(), 0);
    return () => returnFocusRef.current?.focus();
  }, [open]);

  if (!open) return null;

  async function upload(source: Blob) {
    setSaving(true);
    setError("");
    try {
      const photo = await prepareProfilePhoto(source);
      const formData = new FormData();
      formData.append("photo", photo);
      const response = await fetch(`/api/people/photos/${encodeURIComponent(personId)}`, {
        method: "POST",
        headers: csrfHeadersWithoutJson(),
        body: formData
      });
      const payload = (await response.json().catch(() => ({ ok: false, error: "Invalid server response" }))) as PhotoResponse;
      if (!response.ok || !payload.ok || !payload.photo) throw new Error(payload.error || "Profile picture could not be saved.");
      if (await onSaved(payload.photo)) onClose();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Profile picture could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function pasteFromClipboard() {
    setError("");
    try {
      if (!navigator.clipboard?.read) throw new Error("Use Ctrl+V or Command+V inside this window to paste a picture.");
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (imageType) {
          await upload(await item.getType(imageType));
          return;
        }
      }
      throw new Error("The clipboard does not contain a picture.");
    } catch (clipboardError) {
      setError(clipboardError instanceof Error ? clipboardError.message : "The clipboard picture could not be read.");
    }
  }

  async function removePhoto() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/people/photos/${encodeURIComponent(personId)}`, {
        method: "DELETE",
        headers: buildJsonHeadersWithCsrf()
      });
      const payload = (await response.json().catch(() => ({ ok: false, error: "Invalid server response" }))) as PhotoResponse;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Profile picture could not be removed.");
      if (await onRemoved()) onClose();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Profile picture could not be removed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="people-photo-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <div
        ref={dialogRef}
        className="people-photo-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="people-photo-dialog-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !saving) onClose();
          if (event.key === "Tab") {
            const controls = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])')
            ).filter((control) => control.offsetParent !== null);
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (!first || !last) {
              event.preventDefault();
              return;
            }
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
        onPaste={(event) => {
          const image = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"))?.getAsFile();
          if (image) {
            event.preventDefault();
            void upload(image);
          }
        }}
      >
        <header>
          <div>
            <span>Profile picture</span>
            <h2 id="people-photo-dialog-title">{personName}</h2>
          </div>
          <button type="button" aria-label="Close profile picture options" onClick={onClose} disabled={saving}>×</button>
        </header>
        <p>Pictures are cropped to a private square portrait and remain available only inside your authenticated workspace.</p>
        <div className="people-photo-options">
          <button type="button" onClick={() => uploadInputRef.current?.click()} disabled={saving}>
            <span aria-hidden="true">↑</span><strong>Upload</strong><small>Choose a saved picture</small>
          </button>
          <button type="button" onClick={() => void pasteFromClipboard()} disabled={saving}>
            <span aria-hidden="true">⌘</span><strong>Paste</strong><small>Use the clipboard</small>
          </button>
          <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={saving}>
            <span aria-hidden="true">○</span><strong>Take picture</strong><small>Open the camera</small>
          </button>
        </div>
        <div className="people-photo-paste-hint" tabIndex={0}>You can also paste a picture here with Ctrl+V or Command+V.</div>
        <input
          ref={uploadInputRef}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void upload(file);
          }}
        />
        <input
          ref={cameraInputRef}
          className="sr-only"
          type="file"
          accept="image/*"
          capture="user"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void upload(file);
          }}
        />
        {error && <p className="personal-record-error" role="alert">{error}</p>}
        {saving && <p className="people-photo-status" role="status">Preparing and saving picture…</p>}
        {hasPhoto && (
          <footer>
            {confirmRemove ? (
              <div className="people-photo-remove-confirm">
                <span>Remove this profile picture?</span>
                <button type="button" onClick={() => setConfirmRemove(false)} disabled={saving}>Cancel</button>
                <button type="button" className="is-danger" onClick={() => void removePhoto()} disabled={saving}>Remove</button>
              </div>
            ) : <button type="button" className="people-photo-remove" onClick={() => setConfirmRemove(true)} disabled={saving}>Remove current picture</button>}
          </footer>
        )}
      </div>
    </div>
  );
}
