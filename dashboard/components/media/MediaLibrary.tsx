"use client";
import { accountFile, mediaSnapshot, openMediaFile, saveMediaDetails, uploadAccountFile } from "../../lib/modules/media/account-client";
import ModuleShell from "../admin-shell/ModuleShell";
import ModuleSidebar from "../admin-shell/ModuleSidebar";
import LogoLoader from "../operational/LogoLoader";
import Link from "next/link";
import {
  smallPreview,
  clearThumbnailCache,
} from "../../lib/modules/media/thumbnail";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { browserVault } from "../../lib/local-first/browser-engine";
import { mirrorPersonalRecord } from "../../lib/local-first/domain-mirror";
import { pendingCanonicalCommands } from "../../lib/local-first/canonical-record";
import type {
  VaultObjectSnapshot,
  VaultMediaManifest,
} from "../../lib/local-first/types";
import type { PersonalRecord } from "../../lib/personal-records-store";
import type { MediaProfile } from "../../lib/modules/media/profile";
import type { PlanningSnapshot } from "../../lib/modules/planning/repository";
import {
  WorkspaceHeader,
  WorkspaceToolbar,
  WorkspaceButton as Button,
  WorkspaceFeedback,
  WorkspaceEmpty,
} from "../admin-shell/WorkspaceKit";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import RecordLinks from "../planning/RecordLinks";
import styles from "./MediaLibrary.module.css";

type MediaDraft = { title: string; description: string; profile: MediaProfile };
const mediaDrafts = new Map<string, MediaDraft>();
if (typeof window !== "undefined")
  window.addEventListener("unigentamos-vault-locked", () =>
    mediaDrafts.clear(),
  );

const manifestFor = (object: VaultObjectSnapshot) =>
  object.fields.mediaManifest as unknown as VaultMediaManifest;
const profileFor = (object: VaultObjectSnapshot): MediaProfile =>
  (object.fields.mediaProfile as unknown as MediaProfile) || {
    version: 1,
    manifest: manifestFor(object),
    linkedRefs: [],
    altText: "",
  };
const size = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
function AssetThumbnail({ object }: { object: VaultObjectSnapshot }) {
  const container = useRef<HTMLDivElement>(null),
    [url, setUrl] = useState(""),
    [failed, setFailed] = useState(false);
  const manifest = manifestFor(object);
  useEffect(() => {
    if (!container.current || !manifest?.mimeType.startsWith("image/")) return;
    let active = true,
      visible = false,
      objectUrl = "",
      loading = false;
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        if (!visible) {
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = "";
            setUrl("");
          }
          return;
        }
        if (loading || objectUrl) return;
        loading = true;
        void smallPreview(object)
          .then((blob) => {
            if (active && visible) {
              objectUrl = URL.createObjectURL(blob);
              setUrl(objectUrl);
            }
          })
          .catch(() => {
            if (active) setFailed(true);
          })
          .finally(() => {
            loading = false;
          });
      },
      { rootMargin: "100px" },
    );
    observer.observe(container.current);
    return () => {
      active = false;
      observer.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [object.objectId, manifest?.contentRoot]);
  return (
    <div className={styles.thumbnail} ref={container}>
      {url ? (
        <img src={url} alt="" />
      ) : (
        <>
          <UnigentamosIcon role="module-media" size={28} />
          <span>
            {failed
              ? "Preview unavailable"
              : manifest?.mimeType.startsWith("image/")
                ? "Image"
                : manifest?.mimeType.split("/")[0] || "File"}
          </span>
        </>
      )}
    </div>
  );
}
export default function MediaLibrary({
  records,
  initialError = "",
  initialSelected = "",
}: {
  records: PersonalRecord[];
  initialError?: string;
  initialSelected?: string;
}) {
  const params = useSearchParams(),
    fileInput = useRef<HTMLInputElement>(null),
    controller = useRef<AbortController | null>(null);
  const [transfers, setTransfers] = useState<
    Array<{
      object: VaultObjectSnapshot;
      uploaded: number;
      total: number;
      local: number;
      paused: boolean;
    }>
  >([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [catalogueLoaded, setCatalogueLoaded] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [undoBatch, setUndoBatch] = useState<
    Array<{ id: string; previous: string; applied: string }>
  >([]);
  const [readLocation, setReadLocation] = useState(false);
  const [objects, setObjects] = useState<VaultObjectSnapshot[]>([]),
    [unlocked, setUnlocked] = useState(false),
    [query, setQuery] = useState(""),
    [view, setView] = useState("gallery"),
    [archive, setArchive] = useState(false);
  const [error, setError] = useState(initialError),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<{
      name: string;
      phase: string;
      done: number;
      total: number;
    }>();
  const [selected, setSelected] = useState<VaultObjectSnapshot>(),
    [profile, setProfile] = useState<MediaProfile>(),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [preview, setPreview] = useState(""),
    [context, setContext] = useState<PlanningSnapshot>();
  const refresh = useCallback(async () => {
    setUnlocked(browserVault.isUnlocked());
    if (!browserVault.isUnlocked()) clearThumbnailCache();
    let canonical = records;
    try {
      const response = await fetch("/api/personal/records", { cache: "no-store" });
      if (!response.ok) throw new Error("Media catalogue could not be loaded");
      canonical = (await response.json()).items;
    } catch (error) { if (!browserVault.isUnlocked()) throw error; }
    const catalogue = canonical.filter(item => item.className === "file" && item.mediaProfile).map(mediaSnapshot);
    const local = browserVault.isUnlocked() ? await browserVault.listObjects(["media"]) : [];
    const media = catalogue.map(item => accountFile(item) ? item : local.find(other => other.fields.id === item.fields.id && !other.tombstone) || item);
    media.push(...local.filter(item => !item.tombstone && manifestFor(item) && !media.some(other => other.fields.id === item.fields.id)));
    setObjects(media);
    setCatalogueLoaded(true);
    const pending = [];
    for (const object of media) {
      if (accountFile(object) || !browserVault.isUnlocked()) continue;
      const state = await browserVault.mediaTransferState(object);
      if (state && state.local > state.uploaded)
        pending.push({ object, ...state });
    }
    setTransfers(pending);
  }, [records]);
  useEffect(() => {
    let active = true;
    void (async () => {
      if (browserVault.isUnlocked())
        for (const record of records)
          if (record.mediaProfile && !record.mediaProfile.accountFile) await mirrorPersonalRecord(record);
      if (active) await refresh();
    })().catch((e) => setError(e.message));
    const update = () => void refresh().catch((e) => setError(e.message));
    window.addEventListener("unigentamos-vault-data-changed", update);
    void fetch("/api/planning")
      .then(async (response) => {
        if (!response.ok) throw new Error("Context unavailable");
        return response.json() as Promise<PlanningSnapshot>;
      })
      .then((result) => {
        if (active) setContext(result);
      })
      .catch(() => {});
    return () => {
      active = false;
      window.removeEventListener("unigentamos-vault-data-changed", update);
      controller.current?.abort();
    };
  }, [records, refresh]);
  const open = useCallback((object: VaultObjectSnapshot) => {
    const draft = mediaDrafts.get(object.objectId);
    setSelected(object);
    setProfile(draft?.profile || profileFor(object));
    setTitle(
      draft?.title ??
        String(object.fields.title || manifestFor(object).fileName),
    );
    setDescription(draft?.description ?? String(object.fields.body || ""));
    setError("");
  }, []);
  useEffect(() => {
    if (!browserVault.isUnlocked()) {
      mediaDrafts.clear();
      return;
    }
    if (!selected || !profile) return;
    const changed =
      title !==
        String(selected.fields.title || manifestFor(selected).fileName) ||
      description !== String(selected.fields.body || "") ||
      JSON.stringify(profile) !== JSON.stringify(profileFor(selected));
    if (changed)
      mediaDrafts.set(selected.objectId, { title, description, profile });
    else mediaDrafts.delete(selected.objectId);
  }, [selected, profile, title, description]);
  useEffect(() => {
    const id = params.get("selected") || initialSelected;
    const item = objects.find((o) => o.fields.id === id || o.objectId === id);
    if (item) open(item);
  }, [params, initialSelected, objects.length, open]);
  useEffect(() => {
    setPreview("");
    if (!selected) return;
    let active = true,
      url = "";
    if (!accountFile(selected) && !browserVault.isUnlocked()) return;
    void openMediaFile(selected)
      .then((result) => {
        if (active) {
          url = URL.createObjectURL(result.blob);
          setPreview(url);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [selected?.objectId, selected && accountFile(selected)?.id, unlocked]);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    controller.current = new AbortController();
    try {
      for (const file of Array.from(files)) {
        controller.current.signal.throwIfAborted();
        setProgress({ name: file.name, phase: "Reading", done: 0, total: 1 });
        const uploaded = await uploadAccountFile(file, (done, total) => setProgress({ name: file.name, phase: "Uploading", done, total }), controller.current.signal);
        if (readLocation) {
          const location = await (await import("../../lib/modules/media/exif-gps")).embeddedPhotoLocation(file);
          if (location) await saveMediaDetails(uploaded, { mediaProfile: { ...profileFor(uploaded), location } });
        }
        setNotice("File saved to Media.");
        await refresh();
      }
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "AbortError"
          ? "Upload stopped. Files already saved remain in Media."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
      setProgress(undefined);
      controller.current = null;
    }
  }
  async function save(archivedAt?: string) {
    if (!selected || !profile) return;
    setBusy(true);
    setError("");
    try {
      const saved = await saveMediaDetails(selected, {
        title,
        body: description,
        mediaProfile: {
          ...profile,
          ...(archivedAt !== undefined ? { archivedAt } : {}),
        } as never,
      });
      const pendingDraft = mediaDrafts.get(selected.objectId);
      if (
        pendingDraft &&
        JSON.stringify(pendingDraft) ===
          JSON.stringify({ title, description, profile })
      )
        mediaDrafts.delete(selected.objectId);
      setSelected((current) =>
        current?.objectId === saved.objectId ? saved : current,
      );
      setNotice(
        accountFile(saved) ? "Saved." : "Saved on this device. Changes sync when connected.",
      );
      await refresh();
      if (archivedAt !== undefined)
        setSelected((current) =>
          current?.objectId === selected.objectId ? undefined : current,
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function archiveSelection(undo = false) {
    setBusy(true);
    setError("");
    const completed: Array<{ id: string; previous: string; applied: string }> =
      [];
    const failed = new Set<string>();
    try {
      const latest = objects;
      const targets = undo ? undoBatch.map((item) => item.id) : [...checked];
      for (const id of targets) {
        try {
          const object = latest.find((item) => item.objectId === id);
          if (!object || object.tombstone)
            throw new Error("File no longer available");
          const prior = profileFor(object);
          const previous = prior.archivedAt || "";
          const undoItem = undoBatch.find((item) => item.id === id);
          if (undo && previous !== undoItem?.applied)
            throw new Error("Archive state changed since this action");
          const applied = undo
            ? undoItem!.previous
            : archive
              ? ""
              : new Date().toISOString();
          await saveMediaDetails(object, {
            mediaProfile: { ...prior, archivedAt: applied } as never,
          });
          completed.push({ id, previous, applied });
        } catch {
          failed.add(id);
        }
      }
      if (undo)
        setUndoBatch((items) => items.filter((item) => failed.has(item.id)));
      else {
        setUndoBatch(completed);
        setChecked(failed);
      }
      setNotice(
        `${completed.length} file${completed.length === 1 ? "" : "s"} ${undo ? "returned to their previous archive state" : archive ? "restored" : "archived"}.`,
      );
      if (failed.size)
        setError(
          `${failed.size} file${failed.size === 1 ? " could" : "s could"} not be updated. Their state is unchanged; retry after checking synchronization.`,
        );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visible = objects.filter(
    (object) =>
      Boolean(profileFor(object).archivedAt) === archive &&
      `${object.fields.title} ${object.fields.body}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const known = new Set(objects.map((o) => String(o.fields.id)));
  const legacy = records.filter(
    (record) =>
      !known.has(record.id) &&
      !record.mediaProfile &&
      !archive &&
      record.title.toLowerCase().includes(query.toLowerCase()),
  );
  const position = selected
    ? visible.findIndex((x) => x.objectId === selected.objectId)
    : -1;
  return (
    <ModuleShell module="media" detailOpen={Boolean(selected)} onBack={() => setSelected(undefined)} sidebar={<ModuleSidebar title="Media" sections={[]} />} inspector={<section className="media-detail-page">        {selected && profile && (
          <div className="work-form">
            <div className={styles.viewer}>
              {preview ? (
                profile.manifest.mimeType.startsWith("image/") ? (
                  <img src={preview} alt={profile.altText || title} />
                ) : profile.manifest.mimeType.startsWith("video/") ? (
                  <video src={preview} controls />
                ) : profile.manifest.mimeType.startsWith("audio/") ? (
                  <audio src={preview} controls />
                ) : (
                  <p>Download to open this file.</p>
                )
              ) : (
                !accountFile(selected) && !unlocked ? <div className={styles.unlock}><strong>Encrypted original</strong><p>Unlock Vault once to copy this file into account-accessible Media. Its encrypted original stays intact.</p><Link href="/vault" className="work-button">Unlock Vault</Link></div> : <LogoLoader label="Loading file" />
              )}
            </div>
            <div className="work-actions">
              <Button
                disabled={position <= 0}
                onClick={() => open(visible[position - 1])}
              >
                Previous
              </Button>
              <Button
                disabled={position < 0 || position >= visible.length - 1}
                onClick={() => open(visible[position + 1])}
              >
                Next
              </Button>
              {preview && (
                <a
                  className="work-button"
                  href={preview}
                  download={profile.manifest.fileName}
                >
                  Download
                </a>
              )}
            </div>
            {!accountFile(selected) && unlocked && <Button busy={busy} onClick={async () => { setBusy(true); setError(""); try { const { blob } = await browserVault.openMedia(selected); const copy = await uploadAccountFile(new File([blob], profile.manifest.fileName, { type: profile.manifest.mimeType }), () => {}, undefined, selected); setSelected(copy); setProfile(profileFor(copy)); await refresh(); setNotice("Available through your account. Encrypted original preserved."); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>Enable account access</Button>}
            <WorkspaceFeedback error={error} />
            <label>
              Name
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label>
              Description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label>
              Image description
              <input
                value={profile.altText}
                onChange={(e) =>
                  setProfile({ ...profile, altText: e.target.value })
                }
              />
            </label>
            {profile.location && (
              <p className="work-muted">
                Photo location: {profile.location.latitude.toFixed(5)},{" "}
                {profile.location.longitude.toFixed(5)} ·{" "}
                <Link
                  href={`/admin/map?${new URLSearchParams({ latitude: String(profile.location.latitude), longitude: String(profile.location.longitude), name: title })}`}
                >
                  Open location in Map
                </Link>
              </p>
            )}
            <RecordLinks
              refs={profile.linkedRefs}
              available={context?.refs.filter(
                (ref) => ref.objectId !== selected.fields.id,
              )}
              onChange={(refs) => setProfile({ ...profile, linkedRefs: refs })}
            />
            <div className="work-actions">
              <Button intent="primary" busy={busy} onClick={() => void save()}>
                Save details
              </Button>
              <Button
                busy={busy}
                onClick={() =>
                  void save(profile.archivedAt ? "" : new Date().toISOString())
                }
              >
                {profile.archivedAt ? "Restore" : "Archive"}
              </Button>
            </div>
          </div>
        )}
</section>}>
    <div className="work-surface" aria-busy={!catalogueLoaded}>
      <WorkspaceHeader
        title="Media"
        count={visible.length + legacy.length}
      >
        {<>
            <Button
              intent="primary"
              icon="photo-upload"
              disabled={busy || !catalogueLoaded}
              onClick={() => fileInput.current?.click()}
            >
              Add files
            </Button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                void upload(e.target.files);
                e.target.value = "";
              }}
            />
          </>}
      </WorkspaceHeader>
      <WorkspaceToolbar
        query={query}
        onQuery={(value) => {
          setQuery(value);
          setChecked(new Set());
        }}
        placeholder="Search media"
        filters={
          <>
            <label className="work-check">
              <input
                type="checkbox"
                checked={readLocation}
                onChange={(e) => setReadLocation(e.target.checked)}
              />
              Read embedded JPEG locations on upload
            </label>
            <Button
              aria-pressed={!archive}
              onClick={() => {
                setArchive(false);
                setChecked(new Set());
              }}
            >
              Library
            </Button>
            <Button
              aria-pressed={archive}
              onClick={() => {
                setArchive(true);
                setChecked(new Set());
              }}
            >
              Archive
            </Button>
          </>
        }
        activeFilters={archive ? 1 : 0}
      >
        <select
          className="work-compact-select"
          aria-label="Media view"
          value={view}
          onChange={(e) => setView(e.target.value)}
        >
          <option value="gallery">Gallery</option>
          <option value="list">List</option>
        </select>
        {(<Button
            aria-pressed={selectionMode}
            onClick={() => {
              setSelectionMode(!selectionMode);
              setChecked(new Set());
            }}
          >
            Select files
          </Button>
        )}
      </WorkspaceToolbar>
      <WorkspaceFeedback error={error} message={notice} />
      {undoBatch.length > 0 && (
        <div className={styles.undo}>
          <Button busy={busy} onClick={() => void archiveSelection(true)}>
            Undo archive change
          </Button>
        </div>
      )}
      {selectionMode && (
        <aside className={styles.selectionBar} aria-label="Selected files">
          <strong>{checked.size} selected</strong>
          <Button
            onClick={() =>
              setChecked(new Set(visible.map((item) => item.objectId)))
            }
          >
            Select all {visible.length}
          </Button>
          <Button
            disabled={!checked.size}
            busy={busy}
            onClick={() => void archiveSelection()}
          >
            {archive ? "Restore selected" : "Archive selected"}
          </Button>
          <Button
            onClick={() => {
              setSelectionMode(false);
              setChecked(new Set());
            }}
          >
            Done
          </Button>
        </aside>
      )}
      {unlocked && transfers.length > 0 && (
        <details
          className={styles.pending}
          open={queueOpen}
          onToggle={(e) => setQueueOpen(e.currentTarget.open)}
        >
          <summary>
            {transfers.length} file{" "}
            {transfers.length === 1 ? "upload" : "uploads"} pending
          </summary>
          {transfers.map((transfer) => (
            <div className={styles.transfer} key={transfer.object.objectId}>
              <div>
                <strong>
                  {String(transfer.object.fields.title || "File")}
                </strong>
                <span>
                  {transfer.paused
                    ? "Paused"
                    : !navigator.onLine
                      ? "Saved on this device"
                      : "Ready to upload"}{" "}
                  · {transfer.uploaded} of {transfer.total} encrypted chunks
                  uploaded
                </span>
              </div>
              <Button
                disabled={busy}
                onClick={() => {
                  controller.current = new AbortController();
                  setBusy(true);
                  void browserVault
                    .retryMediaUpload(
                      transfer.object,
                      (done, total) =>
                        setProgress({
                          name: String(transfer.object.fields.title),
                          phase: "uploading",
                          done,
                          total,
                        }),
                      controller.current.signal,
                    )
                    .then(() =>
                      setNotice(
                        "Encrypted file upload completed. Record synchronization is checked in Vault.",
                      ),
                    )
                    .catch((e) =>
                      setError(
                        e.name === "AbortError"
                          ? "Upload stopped. Saved chunks remain available."
                          : e.message,
                      ),
                    )
                    .finally(() => {
                      setBusy(false);
                      setProgress(undefined);
                      void refresh();
                    });
                }}
              >
                Retry upload
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void browserVault
                    .pauseMediaUpload(transfer.object, !transfer.paused)
                    .then(refresh)
                    .catch((e) => setError(e.message))
                }
              >
                {transfer.paused ? "Resume automatic upload" : "Pause upload"}
              </Button>
            </div>
          ))}
        </details>
      )}
      {progress && (
        <div className={styles.upload} role="status">
          <div>
            <strong>{progress.name}</strong>
            <span>
              {progress.phase} · {progress.done} of {progress.total} chunks
            </span>
            <progress value={progress.done} max={progress.total} />
          </div>
          <Button onClick={() => controller.current?.abort()}>
            Stop upload
          </Button>
        </div>
      )}
      {unlocked &&
        objects.some(
          (object) => pendingCanonicalCommands(object).length > 0,
        ) && (
          <div className={styles.pending}>
            <span>Changes saved on this device are waiting to sync.</span>
            <Button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void browserVault
                  .syncOnce()
                  .then(refresh)
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              Retry sync
            </Button>
          </div>
        )}
      <div className={view === "gallery" ? styles.gallery : styles.list}>
        {visible.map((object) => (
          <div
            className={styles.assetFrame}
            key={object.objectId}
            data-selected={checked.has(object.objectId)}
          >
            <label className={styles.selectionCheck} hidden={!selectionMode}>
              <input
                type="checkbox"
                aria-label={`Select ${String(object.fields.title || manifestFor(object).fileName)}`}
                checked={checked.has(object.objectId)}
                onChange={(event) =>
                  setChecked((prior) => {
                    const next = new Set(prior);
                    if (event.target.checked) next.add(object.objectId);
                    else next.delete(object.objectId);
                    return next;
                  })
                }
              />
            </label>
            <button
              type="button"
              className={styles.asset}
              key={object.objectId}
              onClick={() => open(object)}
            >
              <AssetThumbnail object={object} />
              <span className={styles.caption}>
                <strong>
                  {String(object.fields.title || manifestFor(object).fileName)}
                </strong>
                <small>
                  {size(manifestFor(object).byteLength)} ·{" "}
                  {pendingCanonicalCommands(object).length
                    ? "Saved on this device"
                    : "Saved"}
                </small>
              </span>
            </button>
          </div>
        ))}
        {legacy.map((record) => (
          <Link
            className={styles.asset}
            key={record.id}
            href={`/admin/media/${encodeURIComponent(record.id)}`}
          >
            <div className={styles.thumbnail}>
              <UnigentamosIcon role="module-media" size={28} />
              <span>File reference</span>
            </div>
            <span className={styles.caption}>
              <strong>{record.title}</strong>
              <small>No encrypted file attached</small>
            </span>
          </Link>
        ))}
      </div>
      {!catalogueLoaded && !error && <LogoLoader label="Loading Media" />}
      {!visible.length && !legacy.length && catalogueLoaded && (
        <WorkspaceEmpty
          title={
            query
              ? "No matching media"
              : archive
                ? "No archived files"
                : "Add your first file"
          }
        >
          {query
            ? "Try a filename or a word from its description."
            : "Images, video, audio, and documents, available when you sign in."}
        </WorkspaceEmpty>
      )}

    </div></ModuleShell>
  );
}
