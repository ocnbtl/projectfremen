"use client";
import SelectField from "../ui/SelectField";

import { useEffect, useRef, useState } from "react";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { organizationLogoStyle } from "./organization-logo";
import { movePhotoCrop, photoCrop, zoomPhotoCrop } from "../../lib/modules/people/photo-crop";

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
  savedVersion?: string;
};

const PROFILE_PHOTO_UPLOAD_BUDGET = 700_000;
const PROFILE_PHOTO_QUALITY_STEPS = [0.86, 0.78, 0.7, 0.62, 0.54, 0.46] as const;

export function PeopleProfileAvatar({
  label,
  initials,
  photoUrl,
  photoUpdatedAt,
  compact = false,
  organization = false,
  onSelect
}: {
  label: string;
  initials: string;
  photoUrl?: string;
  photoUpdatedAt?: string;
  compact?: boolean;
  organization?: boolean;
  onSelect?: () => void;
}) {
  const source = photoUrl ? `${photoUrl}${photoUpdatedAt ? `${photoUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(photoUpdatedAt)}` : ""}` : "";
  const [loadedSource, setLoadedSource] = useState("");
  const [failedSource, setFailedSource] = useState("");
  const photoState = !source ? "empty" : failedSource === source ? "failed" : loadedSource === source ? "ready" : "loading";
  const image = source && photoState !== "failed" ? (
    <img
      key={source}
      src={source}
      alt=""
      ref={element => {
        // Cached images can finish before hydration attaches load/error handlers.
        if (element?.complete) {
          if (element.naturalWidth > 0) setLoadedSource(source);
          else setFailedSource(source);
        }
      }}
      data-organization-logo={organization || undefined}
      style={{ ...(organization ? organizationLogoStyle : {}), visibility: photoState === "ready" ? "visible" : "hidden" }}
      onLoad={() => setLoadedSource(source)}
      onError={() => setFailedSource(source)}
    />
  ) : <span aria-hidden="true">{initials}</span>;

  if (onSelect) {
    return (
      <button
        type="button"
        className={`people-avatar people-profile-photo-trigger${compact ? " is-compact" : ""}`}
        data-photo-state={photoState}
        aria-label={`${photoUrl ? "Change" : "Add"} profile picture for ${label}`}
        onClick={onSelect}
      >
        {image}
        <span className={`people-profile-photo-badge${photoUrl ? " is-edit" : ""}`} aria-hidden="true"><UnigentamosIcon role={photoUrl ? "edit" : "plus"} size={12} /></span>
      </button>
    );
  }
  return <span className={`people-row-avatar people-profile-photo${compact ? " is-compact" : ""}`} data-photo-state={photoState}>{image}</span>;
}

async function prepareProfilePhoto(editor: PhotoEditorDraft): Promise<File> {
  const source = editor.source;
  if (!source.type.startsWith("image/")) throw new Error("Choose an image from your device or clipboard.");
  const bitmap = await createImageBitmap(source);
  try {
    const { side, x: sourceX, y: sourceY } = photoCrop(editor);
    const canvas = document.createElement("canvas");
    canvas.width = editor.outputSize;
    canvas.height = editor.outputSize;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the picture.");
    context.drawImage(bitmap, sourceX, sourceY, side, side, 0, 0, editor.outputSize, editor.outputSize);
    let prepared: Blob | null = null;
    for (const quality of PROFILE_PHOTO_QUALITY_STEPS) {
      prepared = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (prepared && prepared.size <= PROFILE_PHOTO_UPLOAD_BUDGET) break;
    }
    if (!prepared) throw new Error("This browser could not prepare the picture.");
    if (prepared.size > PROFILE_PHOTO_UPLOAD_BUDGET) {
      throw new Error("This picture is still too detailed after preparation. Choose 512 px and try again.");
    }
    return new File([prepared], "profile-picture", { type: prepared.type });
  } finally {
    bitmap.close();
  }
}

async function preparePhotoSource(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the picture.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of PROFILE_PHOTO_QUALITY_STEPS) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality));
      if (blob && blob.size <= 1_500_000) return blob;
    }
    throw new Error("This picture is too detailed. Try a smaller image.");
  } finally { bitmap.close(); }
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
  currentPhotoUrl,
  onClose,
  onSaved,
  onRemoved,
  onPrepared
}: {
  open: boolean;
  personId: string;
  personName: string;
  hasPhoto: boolean;
  currentPhotoUrl?: string;
  onClose: () => void;
  onSaved: (photo: PhotoMetadata) => Promise<boolean>;
  onRemoved: () => Promise<boolean>;
  onPrepared?: (dataUrl: string) => void;
}) {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const previewUrlRef = useRef("");
  const cropFrameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const loadVersionRef = useRef(0);
  const [loading, setLoading] = useState(false);
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

  const editing = Boolean(photoDraft);
  useEffect(() => {
    const frame = cropFrameRef.current;
    if (!frame || !open || !editing) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (saving) return;
      const bounds = frame.getBoundingClientRect();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? frame.clientHeight : 1;
      setPhotoDraft(current => current ? zoomPhotoCrop(current, current.zoom * Math.exp(-event.deltaY * unit * .002),
        (event.clientX - bounds.left - frame.clientLeft) / frame.clientWidth,
        (event.clientY - bounds.top - frame.clientTop) / frame.clientHeight) : current);
    };
    frame.addEventListener("wheel", wheel, { passive: false });
    return () => frame.removeEventListener("wheel", wheel);
  }, [open, editing, saving]);

  if (!open) return null;
  const crop = photoDraft ? photoCrop(photoDraft) : null;

  function releasePreview() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
  }

  function closeDialog(force = false) {
    if (saving && !force) return;
    releasePreview();
    loadVersionRef.current++;
    setLoading(false);
    setPhotoDraft(null);
    onClose();
  }

  async function beginEditing(source: Blob, initial?: { zoom: number; panX: number; panY: number; outputSize: PhotoEditorDraft["outputSize"]; savedVersion?: string }) {
    if (saving) return;
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
      const version = ++loadVersionRef.current;
      const bitmap = await createImageBitmap(source);
      const sourceWidth = bitmap.width;
      const sourceHeight = bitmap.height;
      bitmap.close();
      if (version !== loadVersionRef.current) return;
      releasePreview();
      const previewUrl = URL.createObjectURL(source);
      previewUrlRef.current = previewUrl;
      setPhotoDraft({ source, previewUrl, sourceWidth, sourceHeight, zoom: 1, panX: 0, panY: 0, outputSize: 512, ...initial });
    } catch {
      setError("This browser could not open that picture.");
    }
  }

  async function editCurrentPhoto() {
    const version = ++loadVersionRef.current;
    setLoading(true);
    setError("");
    try {
      if (onPrepared && currentPhotoUrl) {
        const response = await fetch(currentPhotoUrl);
        if (!response.ok) throw new Error("The current picture could not be loaded.");
        const blob = await response.blob();
        if (version === loadVersionRef.current) await beginEditing(blob);
      } else {
        const response = await fetch(`/api/people/photos/${encodeURIComponent(personId)}?edit=1`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || "The current picture could not be loaded.");
        const blob = await (await fetch(payload.source)).blob();
        if (version === loadVersionRef.current) await beginEditing(blob, { ...payload.crop, savedVersion: payload.updatedAt });
      }
    } catch (error) {
      if (version === loadVersionRef.current) setError(error instanceof Error ? error.message : "The current picture could not be loaded.");
    } finally { setLoading(false); }
  }

  async function uploadEditedPhoto() {
    if (!photoDraft) return;
    setSaving(true);
    setError("");
    try {
      if (onPrepared) {
        const photo = await prepareProfilePhoto(photoDraft);
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("The picture could not be prepared."));
          reader.readAsDataURL(photo);
        });
        onPrepared(dataUrl);
        closeDialog(true);
        return;
      }
      const formData = new FormData();
      const crop = { zoom: photoDraft.zoom, panX: photoDraft.panX, panY: photoDraft.panY, outputSize: photoDraft.outputSize };
      if (!photoDraft.savedVersion) {
        formData.append("source", await preparePhotoSource(photoDraft.source), "profile-source.webp");
        formData.append("crop", JSON.stringify(crop));
      }
      const response = await fetch(`/api/people/photos/${encodeURIComponent(personId)}`, {
        method: photoDraft.savedVersion ? "PATCH" : "POST",
        headers: photoDraft.savedVersion ? buildJsonHeadersWithCsrf() : csrfHeadersWithoutJson(),
        body: photoDraft.savedVersion ? JSON.stringify({ crop, expectedUpdatedAt: photoDraft.savedVersion }) : formData
      });
      const payload = (await response.json().catch(() => ({ ok: false, error: "Invalid server response" }))) as PhotoResponse;
      if (!response.ok || !payload.ok || !payload.photo) throw new Error(payload.error || "Profile picture could not be saved.");
      setPhotoDraft(current => current ? { ...current, savedVersion: payload.photo!.updatedAt } : current);
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
    if (onPrepared) { onPrepared(""); closeDialog(true); return; }
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
              event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')
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
          <button type="button" aria-label="Close profile picture options" onClick={() => closeDialog()} disabled={saving} data-icon-button="standard"><UnigentamosIcon role="close" size={18} /></button>
        </header>
        <p>{photoDraft ? "Drag to reposition and adjust the zoom. Your saved crop is used across People, Calendar, and Map." : "Adjust your current picture or choose a new one."}</p>
        {!photoDraft && hasPhoto && <button type="button" className="people-photo-adjust" onClick={() => void editCurrentPhoto()} disabled={saving || loading}>
          <UnigentamosIcon role="edit" size={20} /><span><strong>{loading ? "Opening picture…" : "Adjust crop"}</strong><small>Zoom and reposition the current picture</small></span>
        </button>}
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
            ref={cropFrameRef}
            className="people-photo-crop-frame"
            role="img"
            aria-label={`Square crop preview for ${personName}. Drag to reposition.`}
            tabIndex={0}
            onPointerDown={(event) => {
              if (saving || event.button !== 0 || dragRef.current) return;
              event.preventDefault();
              event.currentTarget.focus();
              dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (saving || !drag || drag.pointerId !== event.pointerId) return;
              const dx = (event.clientX - drag.x) / event.currentTarget.clientWidth;
              const dy = (event.clientY - drag.y) / event.currentTarget.clientHeight;
              dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
              setPhotoDraft(current => current ? movePhotoCrop(current, dx, dy) : current);
            }}
            onPointerUp={(event) => {
              if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => { dragRef.current = null; }}
            onLostPointerCapture={() => { dragRef.current = null; }}
            onKeyDown={(event) => {
              const next = event.key === "ArrowLeft" ? { panX: -0.05, panY: 0 }
                : event.key === "ArrowRight" ? { panX: 0.05, panY: 0 }
                  : event.key === "ArrowUp" ? { panX: 0, panY: -0.05 }
                    : event.key === "ArrowDown" ? { panX: 0, panY: 0.05 }
                      : null;
              if (!next || saving) return;
              event.preventDefault();
              setPhotoDraft((current) => current ? movePhotoCrop(current, next.panX, next.panY) : current);
            }}
          >
            <img
              src={photoDraft.previewUrl}
              alt=""
              draggable={false}
              style={{
                width: `${photoDraft.sourceWidth / crop!.side * 100}%`,
                height: `${photoDraft.sourceHeight / crop!.side * 100}%`,
                left: `${-crop!.x / crop!.side * 100}%`,
                top: `${-crop!.y / crop!.side * 100}%`
              }}
            />
            <span className="people-photo-crop-grid" aria-hidden="true" />
          </div>
          <fieldset className="people-photo-editor-controls" disabled={saving}>
            <label>
              <span>Zoom</span>
              <div className="people-photo-zoom-control">
                <button type="button" aria-label="Zoom out" disabled={photoDraft.zoom <= 1} onClick={() => setPhotoDraft((current) => current ? zoomPhotoCrop(current, current.zoom - .1) : current)} data-icon-button="compact"><UnigentamosIcon role="minus" size={16} /></button>
                <input aria-label="Zoom" type="range" min="1" max="3" step="0.01" value={photoDraft.zoom} onChange={(event) => setPhotoDraft((current) => current ? zoomPhotoCrop(current, Number(event.target.value)) : current)} />
                <button type="button" aria-label="Zoom in" disabled={photoDraft.zoom >= 3} onClick={() => setPhotoDraft((current) => current ? zoomPhotoCrop(current, current.zoom + .1) : current)} data-icon-button="compact"><UnigentamosIcon role="plus" size={14} /></button>
              </div>
            </label>
            <label><span>Horizontal crop</span><input aria-label="Horizontal crop" type="range" min="-1" max="1" step="0.01" value={photoDraft.panX} onChange={(event) => setPhotoDraft((current) => current ? { ...current, panX: Number(event.target.value) } : current)} /></label>
            <label><span>Vertical crop</span><input aria-label="Vertical crop" type="range" min="-1" max="1" step="0.01" value={photoDraft.panY} onChange={(event) => setPhotoDraft((current) => current ? { ...current, panY: Number(event.target.value) } : current)} /></label>
            <label><span>Resize output</span><SelectField aria-label="Resize output" value={photoDraft.outputSize} onChange={(event) => setPhotoDraft((current) => current ? { ...current, outputSize: Number(event.target.value) as PhotoEditorDraft["outputSize"] } : current)}><option value="256">256 px</option><option value="512">512 px</option><option value="1024">1024 px</option></SelectField></label>
          </fieldset>
          <div className="people-photo-editor-meta"><span>{photoDraft.sourceWidth} × {photoDraft.sourceHeight} source</span><button type="button" disabled={saving} onClick={() => setPhotoDraft((current) => current ? { ...current, zoom: 1, panX: 0, panY: 0 } : current)}>Center crop</button></div>
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
            <button type="button" className="is-primary" onClick={() => void uploadEditedPhoto()} disabled={saving}>{saving ? "Preparing…" : onPrepared ? "Use picture" : "Save picture"}</button>
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
