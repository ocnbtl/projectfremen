"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { metadataFreePhoto } from "../../lib/modules/media/upload-privacy";
import { photoTypes, previewByteLimit } from "../../lib/modules/media/workspace-photos";
import SettingsSwitch from "../writing/SettingsSwitch";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { WorkspaceButton as Button } from "../admin-shell/WorkspaceKit";
import styles from "../writing/WritingSettings.module.css";
import StoragePlan from "./StoragePlan";
import type {StorageOffer} from "../../lib/settings/storage-offer";

type Entry = {
  id: string;
  recordId: string;
  name: string;
  mime: string;
  bytes: number;
  audience: "private" | "workspace";
  state: string;
  own: boolean;
};
type Directory = {
  files: Entry[];
  more: boolean;
  canUpload: boolean;
  cleanUploads: boolean;
  usage: { used_bytes: number; reserved_bytes: number; included_bytes: number; pooled_addon_bytes: number };
};
function size(bytes: number) {
  return bytes < 1024
    ? bytes + " B"
    : bytes < 1048576
      ? (bytes / 1024).toFixed(1) + " KiB"
      : (bytes / 1048576).toLocaleString(undefined, { maximumFractionDigits: 1 }) + " MiB";
}
export default function WorkspaceMedia({ workspaceId,offer=null }: { workspaceId: string;offer?:StorageOffer|null }) {
  return <Library key={workspaceId} workspaceId={workspaceId} offer={offer}/>;
}
function Library({ workspaceId,offer }: { workspaceId: string;offer:StorageOffer|null }) {
  const base = "/api/workspaces/" + encodeURIComponent(workspaceId) + "/media";
  const [directory, setDirectory] = useState<Directory | null>(null),
    [offset, setOffset] = useState(0);
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState("");

  const input = useRef<HTMLInputElement>(null),
    resumeId = useRef(""),
    operation = useRef<AbortController | null>(null);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch(base + "?offset=" + offset, { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) {
        setDirectory(null);
        setPreview("");
        throw new Error(data.error || "Could not open media.");
      }
      if (!signal?.aborted) setDirectory(data);
    },
    [base, offset],
  );
  useEffect(() => {
    const life = new AbortController();
    setDirectory(null);
    setPreview("");
    refresh(life.signal).catch((e) => {
      if (!life.signal.aborted) setNotice(e.message);
    });
    return () => {
      life.abort();
      operation.current?.abort();
    };
  }, [refresh]);
  async function post(action: string, id: string, fields: Record<string, unknown>, signal?: AbortSignal) {
    const response = await fetch(base, {
      method: "POST",
      headers: buildJsonHeadersWithCsrf(),
      body: JSON.stringify({ action, id, ...fields }),
      signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not save this change.");
    return data;
  }
  async function upload(file: File) {
    if (!file.size || file.size > 268435456) {
      setNotice("Choose a nonempty file up to 256 MiB.");
      return;
    }
    if (operation.current) return;
    const controller = new AbortController(),
      signal = controller.signal;
    operation.current = controller;
    setBusy(true);
    const id = resumeId.current || crypto.randomUUID();
    resumeId.current = "";
    try {
      setNotice("Checking file…");
      if (directory?.cleanUploads) file = await metadataFreePhoto(file);
      if (file.size > 268435456) throw new Error("The prepared image exceeds the 256 MiB upload limit.");
      const sha256 = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())),
        (x) => x.toString(16).padStart(2, "0"),
      ).join("");
      const session = await post(
        "start",
        id,
        { bytes: file.size, name: file.name, mime: file.type || "application/octet-stream", sha256 },
        signal,
      );
      if (session.state !== "ready") {
        const count = Math.ceil(file.size / session.chunkSize);
        for (let i = 0; i < count; i++) {
          setNotice(`Uploading part ${i + 1} of ${count}…`);
          const grant = await post("part", id, { index: i }, signal);
          if (!grant.uploaded) {
            const part = file.slice(i * session.chunkSize, Math.min(file.size, (i + 1) * session.chunkSize));
            const response = await fetch(grant.url, {
              method: "PUT",
              headers: grant.headers,
              body: part,
              credentials: "omit",
              referrerPolicy: "no-referrer",
              signal,
            });
            if (!response.ok && response.status !== 412)
              throw new Error("Upload interrupted. Choose Resume and select the same file.");
          }
        }
        setNotice("Verifying the original…");
        await post("finish", id, {}, signal);
      }
      setNotice("File saved privately.");
    } catch (error) {
      setNotice(
        signal.aborted ? "Upload paused. Choose Resume and select the same file." : (error as Error).message,
      );
    } finally {
      operation.current = null;
      setBusy(false);
      await refresh().catch((e) => setNotice(e.message));
    }
  }
  async function act(item: Entry, action: "share" | "discard") {
    setBusy(true);
    try {
      const response = await post(
        action,
        item.id,
        action === "share" ? { audience: item.audience === "private" ? "workspace" : "private" } : {},
      );
      setPreview("");
      setNotice(
        response.pendingUntil
          ? "Upload stopped. Finish cleanup after " +
              new Date(response.pendingUntil).toLocaleTimeString() +
              "."
          : action === "share"
            ? "File audience updated."
            : "Upload reservation released.",
      );
      await refresh();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function select(id = "") {
    resumeId.current = id;
    input.current?.click();
  }
  return (
    <section className={styles.panel} aria-label="Workspace media">
      <div className={styles.panelHeader}>
        <h2>Media</h2>
        {directory?.canUpload && (
          <Button disabled={busy} onClick={() => select()} icon="photo-upload">
            Upload file
          </Button>
        )}
      </div>
      {directory?.canUpload && (
        <SettingsSwitch
          label="Upload photos without metadata"
          detail="Create a still PNG copy on this device before uploading. This removes embedded location and camera metadata, and flattens animated images."
          checked={directory.cleanUploads}
          onChange={async value=>{
            if (busy) return;
            setBusy(true);
            try {await post("privacy","",{metadataFree:value});await refresh();}
            catch(error){setNotice((error as Error).message);}
            finally{setBusy(false);}
          }}
        />
      )}
      <input
        type="file"
        hidden
        ref={input}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
      {directory && (
        <StoragePlan row={directory.usage} offer={offer}/>
      )}
      {notice && <p role="status">{notice}</p>}
      {operation.current && <Button onClick={() => operation.current?.abort()}>Pause upload</Button>}
      {!directory && !notice && <p>Loading files…</p>}
      {directory && !directory.files.length && <p>No files on this page.</p>}
      <ul className={styles.skills}>
        {directory?.files.map((item) => (
          <li key={item.id}>
            <strong>{item.name}</strong>
            <small>
              {size(item.bytes)} ·{" "}
              {item.state === "ready"
                ? item.audience === "private"
                  ? "Private"
                  : "Shared with workspace"
                : item.state === "discarding"
                  ? "Cleanup pending"
                  : "Upload incomplete"}
            </small>
            <div className={styles.buttons}>
              {item.state === "ready" ? (
                <>
                  <a href={base + "?id=" + item.id} download={item.name}>
                    Download
                  </a>
                  {photoTypes.includes(item.mime) && item.bytes <= previewByteLimit && (
                    <>
                      <a href={base + "?view=photo-copy&id=" + item.id} download>
                        Export without metadata
                      </a>
                      <Button onClick={() => setPreview(preview === item.id ? "" : item.id)}>
                        {preview === item.id ? "Close preview" : "Preview image"}
                      </Button>
                    </>
                  )}
                  {directory.canUpload && item.own && (
                    <Button disabled={busy} onClick={() => void act(item, "share")}>
                      {item.audience === "private" ? "Share with workspace" : "Make private"}
                    </Button>
                  )}
                </>
              ) : (
                directory.canUpload && (
                  <>
                    {item.state === "uploading" && (
                      <Button disabled={busy} onClick={() => select(item.id)}>
                        Resume
                      </Button>
                    )}
                    <Button disabled={busy} onClick={() => void act(item, "discard")}>
                      {item.state === "discarding" ? "Finish cleanup" : "Discard upload"}
                    </Button>
                  </>
                )
              )}
            </div>
            {preview === item.id && (
              <img
                alt={item.name}
                style={{ maxWidth: "100%", maxHeight: 240 }}
                src={base + "?view=thumbnail&id=" + item.id}
                onError={() => {
                  setPreview("");
                  setNotice("A preview is unavailable for this file.");
                }}
              />
            )}
          </li>
        ))}
      </ul>
      <div className={styles.buttons}>
        {offset > 0 && (
          <Button disabled={busy} onClick={() => setOffset(Math.max(0, offset - 50))}>
            Previous files
          </Button>
        )}
        {directory?.more && (
          <Button disabled={busy} onClick={() => setOffset(offset + 50)}>
            More files
          </Button>
        )}
      </div>
    </section>
  );
}
