"use client";

import { useEffect, useRef, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import UnigentamosIcon from "../icons/UnigentamosIcon";

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

type PhotoEditorDraft = {
  source: Blob;
  previewUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  zoom: number;
  panX: number;
  panY: number;
  outputSize: 256 | 512 | 1024;
};

const PROFILE_PHOTO_UPLOAD_BUDGET = 700_000;
const PROFILE_PHOTO_QUALITY_STEPS = [0.86, 0.78, 0.7, 0.62, 0.54, 0.46] as const;

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

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

async function prepareProfilePhoto(editor: PhotoEditorDraft): Promise<File> {
  const source = editor.source;
  if (!source.type.startsWith("image/")) throw new Error("Choose an image from your device or clipboard.");
  const bitmap = await createImageBitmap(source);
  try {
    const side = Math.min(bitmap.width, bitmap.height) / editor.zoom;
    const sourceX = ((editor.panX + 1) / 2) * Math.max(0, bitmap.width - side);
    const sourceY = ((editor.panY + 1) / 2) * Math.max(0, bitmap.height - side);
    const canvas = document.createElement("canvas");
    canvas.width = editor.outputSize;
    canvas.height = editor.outputSize;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the picture.");
    context.drawImage(bitmap, sourceX, sourceY, side, side, 0, 0, editor.outputSize, editor.outputSize);
    let prepared: Blob | null = null;
    for (const quality of PROFILE_PHOTO_QUALITY_STEPS) {
      prepared = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (prepared && prepared.size <= PROFILE_PHOTO_UPLOAD_BUDGET) break;
    }
    if (!prepared) throw new Error("This browser could not prepare the picture.");
    if (prepared.size > PROFILE_PHOTO_UPLOAD_BUDGET) {
      throw new Error("This picture is still too detailed after preparation. Choose 512 px and try again.");
    }
    return new File([prepared], "profile-picture.jpg", { type: "image/jpeg" });
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
  const previewUrlRef = useRef("");
  const dragRef = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number; width: number; height: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [photoDraft, setPhotoDraft] = useState<PhotoEditorDraft | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError("");
    setConfirmRemove(false);
    window.setTimeout(() => dialogRef.current?.focus(), 0);
    return () => returnFocusRef.current?.focus();
  }, [open]);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  if (!open) return null;

  function releasePreview() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
  }

  function closeDialog(force = false) {
    if (saving && !force) return;
    releasePreview();
    setPhotoDraft(null);
    onClose();
  }

  async function beginEditing(source: Blob) {
    setError("");
    if (!source.type.startsWith("image/")) {
      setError("Choose an image from your device or clipboard.");
      return;
    }
    if (source.size > 20_000_000) {
      setError("Choose an image smaller than 20 MB before editing.");
      return;
    }
    try {
      const bitmap = await createImageBitmap(source);
      const sourceWidth = bitmap.width;
      const sourceHeight = bitmap.height;
      bitmap.close();
      releasePreview();
      const previewUrl = URL.createObjectURL(source);
      previewUrlRef.current = previewUrl;
      setPhotoDraft({ source, previewUrl, sourceWidth, sourceHeight, zoom: 1, panX: 0, panY: 0, outputSize: 512 });
    } catch {
      setError("This browser could not open that picture.");
    }
  }

  async function uploadEditedPhoto() {
    if (!photoDraft) return;
    setSaving(true);
    setError("");
    try {
      const photo = await prepareProfilePhoto(photoDraft);
      const formData = new FormData();
      formData.append("photo", photo);
      const response = await fetch(`/api/people/photos/${encodeURIComponent(personId)}`, {
        method: "POST",
        headers: csrfHeadersWithoutJson(),
        body: formData
      });
      const payload = (await response.json().catch(() => ({ ok: false, error: "Invalid server response" }))) as PhotoResponse;
      if (!response.ok || !payload.ok || !payload.photo) throw new Error(payload.error || "Profile picture could not be saved.");
      if (!(await onSaved(payload.photo))) throw new Error("The picture was stored, but the profile could not be refreshed. Try saving it again.");
      closeDialog(true);
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
          await beginEditing(await item.getType(imageType));
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
      if (!(await onRemoved())) throw new Error("The picture was removed, but the profile could not be refreshed. Try removing it again.");
      closeDialog(true);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Profile picture could not be removed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="people-photo-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) closeDialog();
    }}>
      <div
        ref={dialogRef}
        className="people-photo-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="people-photo-dialog-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !saving) closeDialog();
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
            void beginEditing(image);
          }
        }}
      >
        <header>
          <div>
            <span>Profile picture</span>
            <h2 id="people-photo-dialog-title">{personName}</h2>
          </div>
          <button type="button" aria-label="Close profile picture options" onClick={() => closeDialog()} disabled={saving}><UnigentamosIcon role="close" size={18} /></button>
        </header>
        <p>{photoDraft ? "Place the picture inside the square, then choose its saved size." : "Choose a picture to crop before it is saved to this private profile."}</p>
        {!photoDraft && <div className="people-photo-options">
          <button type="button" onClick={() => uploadInputRef.current?.click()} disabled={saving}>
            <span aria-hidden="true"><UnigentamosIcon role="photo-upload" size={19} /></span><strong>Upload</strong><small>Choose a saved picture</small>
          </button>
          <button type="button" onClick={() => void pasteFromClipboard()} disabled={saving}>
            <span aria-hidden="true"><UnigentamosIcon role="photo-paste" size={19} /></span><strong>Paste</strong><small>Use the clipboard</small>
          </button>
          <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={saving}>
            <span aria-hidden="true"><UnigentamosIcon role="photo-camera" size={19} /></span><strong>Take picture</strong><small>Open the camera</small>
          </button>
        </div>}
        {!photoDraft && <div className="people-photo-paste-hint" tabIndex={0}>You can also paste a picture here with Ctrl+V or Command+V.</div>}
        {photoDraft && <section className="people-photo-editor" aria-label="Crop and resize profile picture">
          <div
            className="people-photo-crop-frame"
            role="img"
            aria-label={`Square crop preview for ${personName}. Drag to reposition.`}
            tabIndex={0}
            onPointerDown={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: photoDraft.panX, panY: photoDraft.panY, width: bounds.width, height: bounds.height };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag || drag.pointerId !== event.pointerId) return;
              setPhotoDraft((current) => current ? {
                ...current,
                panX: clamp(drag.panX - ((event.clientX - drag.x) / Math.max(1, drag.width)) * 2, -1, 1),
                panY: clamp(drag.panY - ((event.clientY - drag.y) / Math.max(1, drag.height)) * 2, -1, 1)
              } : current);
            }}
            onPointerUp={(event) => {
              if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => { dragRef.current = null; }}
            onKeyDown={(event) => {
              const next = event.key === "ArrowLeft" ? { panX: -0.05, panY: 0 }
                : event.key === "ArrowRight" ? { panX: 0.05, panY: 0 }
                  : event.key === "ArrowUp" ? { panX: 0, panY: -0.05 }
                    : event.key === "ArrowDown" ? { panX: 0, panY: 0.05 }
                      : null;
              if (!next) return;
              event.preventDefault();
              setPhotoDraft((current) => current ? { ...current, panX: clamp(current.panX + next.panX, -1, 1), panY: clamp(current.panY + next.panY, -1, 1) } : current);
            }}
          >
            <img
              src={photoDraft.previewUrl}
              alt=""
              draggable={false}
              style={{
                objectPosition: `${(photoDraft.panX + 1) * 50}% ${(photoDraft.panY + 1) * 50}%`,
                transform: `scale(${photoDraft.zoom})`
              }}
            />
            <span className="people-photo-crop-grid" aria-hidden="true" />
          </div>
          <div className="people-photo-editor-controls">
            <label>
              <span>Zoom</span>
              <div className="people-photo-zoom-control">
                <button type="button" aria-label="Zoom out" onClick={() => setPhotoDraft((current) => current ? { ...current, zoom: clamp(Number((current.zoom - 0.1).toFixed(2)), 1, 3) } : current)}>−</button>
                <input aria-label="Zoom" type="range" min="1" max="3" step="0.05" value={photoDraft.zoom} onChange={(event) => setPhotoDraft((current) => current ? { ...current, zoom: Number(event.target.value) } : current)} />
                <button type="button" aria-label="Zoom in" onClick={() => setPhotoDraft((current) => current ? { ...current, zoom: clamp(Number((current.zoom + 0.1).toFixed(2)), 1, 3) } : current)}>+</button>
              </div>
            </label>
            <label><span>Horizontal crop</span><input aria-label="Horizontal crop" type="range" min="-1" max="1" step="0.01" value={photoDraft.panX} onChange={(event) => setPhotoDraft((current) => current ? { ...current, panX: Number(event.target.value) } : current)} /></label>
            <label><span>Vertical crop</span><input aria-label="Vertical crop" type="range" min="-1" max="1" step="0.01" value={photoDraft.panY} onChange={(event) => setPhotoDraft((current) => current ? { ...current, panY: Number(event.target.value) } : current)} /></label>
            <label><span>Resize output</span><select aria-label="Resize output" value={photoDraft.outputSize} onChange={(event) => setPhotoDraft((current) => current ? { ...current, outputSize: Number(event.target.value) as PhotoEditorDraft["outputSize"] } : current)}><option value="256">256 px</option><option value="512">512 px</option><option value="1024">1024 px</option></select></label>
          </div>
          <div className="people-photo-editor-meta"><span>{photoDraft.sourceWidth} × {photoDraft.sourceHeight} source</span><button type="button" onClick={() => setPhotoDraft((current) => current ? { ...current, zoom: 1, panX: 0, panY: 0 } : current)}>Center crop</button></div>
        </section>}
        <input
          ref={uploadInputRef}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void beginEditing(file);
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
            if (file) void beginEditing(file);
          }}
        />
        {error && <p className="personal-record-error" role="alert">{error}</p>}
        {saving && <p className="people-photo-status" role="status">Preparing and saving picture…</p>}
        {photoDraft ? (
          <footer className="people-photo-editor-actions">
            <button type="button" onClick={() => { releasePreview(); setPhotoDraft(null); }} disabled={saving}>Choose another</button>
            <button type="button" className="is-primary" onClick={() => void uploadEditedPhoto()} disabled={saving}>{saving ? "Saving…" : "Save picture"}</button>
          </footer>
        ) : hasPhoto && (
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
