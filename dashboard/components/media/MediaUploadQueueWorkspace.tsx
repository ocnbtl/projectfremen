"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import DirectoryPane from "../admin-shell/DirectoryPane";
import ModuleShell from "../admin-shell/ModuleShell";
import ModuleSidebar, { type ModuleSidebarSection } from "../admin-shell/ModuleSidebar";
import SharedAIDock from "../admin-shell/SharedAIDock";
import DenseObjectRow from "../operational/DenseObjectRow";
import MetricStrip from "../operational/MetricStrip";
import QuickActionBar from "../operational/QuickActionBar";
import ConfirmationSheet from "../operational/ConfirmationSheet";
import SystemState from "../operational/SystemState";
import {
  createLocalUploadCandidates,
  formatLocalFileSize,
  localDuplicateCandidates,
  matchesLocalUploadFilter,
  matchesLocalUploadQuery,
  sortLocalUploadCandidates,
  type LocalUploadCandidate,
  type LocalUploadOrigin
} from "../../lib/modules/media/upload-intake";
import { getModuleRoute, getModuleViewRoute } from "../../lib/native-objects/routes";
import {
  parseMediaUploadUrlState,
  serializeMediaUploadUrlState,
  type MediaUploadFilter,
  type MediaUploadSort,
  type MediaUploadTab,
  type MediaUploadUrlState
} from "../../lib/native-objects/url-state";
import baseStyles from "../content-graph/ContentGraphWorkspace.module.css";
import MediaUploadInspector from "./MediaUploadInspector";
import styles from "./MediaUploadQueueWorkspace.module.css";

const FILTERS: ReadonlyArray<{
  id: MediaUploadFilter;
  label: string;
  tone: "blue" | "amber" | "pink";
}> = [
  { id: "all", label: "All local", tone: "blue" },
  { id: "needs-type", label: "Browser type missing", tone: "pink" },
  { id: "possible-duplicate", label: "Possible local match", tone: "amber" }
];

const SORT_LABELS: Readonly<Record<MediaUploadSort, string>> = {
  "added-desc": "Added — newest",
  filename: "Filename — A–Z",
  "size-desc": "Size — largest"
};

type RemovedSnapshot = {
  candidates: LocalUploadCandidate[];
  previousSelectedId: string;
};

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

function formatAddedTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "this session";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

export default function MediaUploadQueueWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [initialUrlState] = useState(() => parseMediaUploadUrlState(searchParams));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MediaUploadFilter>(initialUrlState.filter);
  const [sort, setSort] = useState<MediaUploadSort>(initialUrlState.sort);
  const [activeTab, setActiveTab] = useState<MediaUploadTab>(initialUrlState.tab);
  const [aiOpen, setAiOpen] = useState(initialUrlState.ai);
  const [candidates, setCandidates] = useState<LocalUploadCandidate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [batchSelection, setBatchSelection] = useState<Set<string>>(() => new Set());
  const [lastRemoved, setLastRemoved] = useState<RemovedSnapshot | null>(null);
  const [announcement, setAnnouncement] = useState(
    "Local intake preview is empty. Nothing has been uploaded."
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [clearConfirmationOpen, setClearConfirmationOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const localIdSequence = useRef(0);
  const dragDepth = useRef(0);
  const searchParamKey = searchParams.toString();
  const isMobile = useMediaQuery("(max-width: 760px)");
  const isInspectorOverlay = useMediaQuery("(max-width: 1240px)");

  const duplicateMatches = useMemo(() => localDuplicateCandidates(candidates), [candidates]);
  const queryScope = useMemo(
    () => candidates.filter((candidate) => matchesLocalUploadQuery(candidate, query)),
    [candidates, query]
  );
  const visibleCandidates = useMemo(
    () =>
      sortLocalUploadCandidates(
        queryScope.filter((candidate) =>
          matchesLocalUploadFilter(candidate, filter, duplicateMatches)
        ),
        sort
      ),
    [duplicateMatches, filter, queryScope, sort]
  );
  const visibleIds = useMemo(
    () => new Set(visibleCandidates.map((candidate) => candidate.localId)),
    [visibleCandidates]
  );
  const selected = candidates.find((candidate) => candidate.localId === selectedId) || null;
  const selectedDuplicateMatches = selected
    ? (duplicateMatches.get(selected.localId) || [])
        .map((id) => candidates.find((candidate) => candidate.localId === id))
        .filter((candidate): candidate is LocalUploadCandidate => Boolean(candidate))
    : [];

  useEffect(() => {
    const next = parseMediaUploadUrlState(searchParams);
    setFilter(next.filter);
    setSort(next.sort);
    setActiveTab(next.tab);
    setAiOpen(next.ai);
  }, [searchParamKey]);

  useEffect(() => {
    if (!["query", "selected", "upload"].some((param) => searchParams.has(param))) return;
    const safeParams = new URLSearchParams(searchParams);
    safeParams.delete("query");
    safeParams.delete("selected");
    safeParams.delete("upload");
    const safeQuery = safeParams.toString();
    router.replace(`${pathname}${safeQuery ? `?${safeQuery}` : ""}`, { scroll: false });
  }, [pathname, router, searchParamKey, searchParams]);

  useEffect(() => {
    if (selectedId && visibleIds.has(selectedId)) return;
    setSelectedId(visibleCandidates[0]?.localId || "");
    if (!visibleCandidates.length) setInspectorOpen(false);
  }, [selectedId, visibleCandidates, visibleIds]);

  function updateUrl(
    partial: Partial<MediaUploadUrlState>,
    method: "push" | "replace" = "replace"
  ) {
    const params = serializeMediaUploadUrlState(
      { filter, sort, tab: activeTab, ai: aiOpen, ...partial },
      searchParams
    );
    params.delete("query");
    params.delete("selected");
    params.delete("upload");
    const nextQuery = params.toString();
    const href = `${pathname}${nextQuery ? `?${nextQuery}` : ""}`;
    if (method === "push") router.push(href, { scroll: false });
    else router.replace(href, { scroll: false });
  }

  function createLocalId() {
    localIdSequence.current += 1;
    return `local_${Date.now().toString(36)}_${localIdSequence.current.toString(36)}`;
  }

  function stageFiles(files: readonly File[], uploadSource: LocalUploadOrigin) {
    if (!files.length) return;
    const next = createLocalUploadCandidates(files, uploadSource, createLocalId);
    setCandidates((current) => [...current, ...next]);
    setSelectedId((current) => current || next[0]?.localId || "");
    setLastRemoved(null);
    setQuery("");
    setFilter("all");
    updateUrl({ filter: "all", tab: "intake" });
    setActiveTab("intake");
    setAnnouncement(
      `${next.length} file${next.length === 1 ? "" : "s"} added to local preview. File contents were not read and nothing was uploaded.`
    );
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    stageFiles(Array.from(event.dataTransfer.files), "drag_drop");
  }

  function removeCandidates(ids: ReadonlySet<string>) {
    const removed = candidates.filter((candidate) => ids.has(candidate.localId));
    if (!removed.length) return;
    const remaining = candidates.filter((candidate) => !ids.has(candidate.localId));
    const nextSelected = ids.has(selectedId)
      ? remaining.find((candidate) => visibleIds.has(candidate.localId))?.localId || remaining[0]?.localId || ""
      : selectedId;
    setLastRemoved({ candidates: removed, previousSelectedId: selectedId });
    setCandidates(remaining);
    setSelectedId(nextSelected);
    setBatchSelection((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    setAnnouncement(
      `${removed.length} local preview item${removed.length === 1 ? "" : "s"} removed. No file on your device was changed.`
    );
    if (!remaining.length) setInspectorOpen(false);
  }

  function undoRemoval() {
    if (!lastRemoved) return;
    setCandidates((current) => [...current, ...lastRemoved.candidates]);
    setSelectedId(lastRemoved.previousSelectedId || lastRemoved.candidates[0]?.localId || "");
    setAnnouncement(
      `${lastRemoved.candidates.length} local preview item${lastRemoved.candidates.length === 1 ? "" : "s"} restored.`
    );
    setLastRemoved(null);
  }

  function clearPreview() {
    if (!candidates.length) return;
    setLastRemoved({ candidates: [...candidates], previousSelectedId: selectedId });
    setCandidates([]);
    setSelectedId("");
    setBatchSelection(new Set());
    setInspectorOpen(false);
    setClearConfirmationOpen(false);
    setAnnouncement(
      "Local intake preview cleared. No file on your device was changed, and nothing was uploaded."
    );
  }

  function selectCandidate(candidate: LocalUploadCandidate) {
    setSelectedId(candidate.localId);
    setActiveTab("intake");
    updateUrl({ tab: "intake" });
    if (isInspectorOverlay) setInspectorOpen(true);
  }

  function selectVisible() {
    setBatchSelection((current) => {
      const allSelected =
        visibleCandidates.length > 0 &&
        visibleCandidates.every((candidate) => current.has(candidate.localId));
      const next = new Set(current);
      visibleCandidates.forEach((candidate) => {
        if (allSelected) next.delete(candidate.localId);
        else next.add(candidate.localId);
      });
      return next;
    });
  }

  const sidebarSections: readonly ModuleSidebarSection[] = [
    {
      id: "media",
      label: "Media",
      items: [
        { id: "all", label: "All Media", href: getModuleRoute("media") },
        { id: "recent", label: "Recent Uploads", disabled: true, disabledReason: "Durable upload history is not connected." },
        { id: "pinned", label: "Pinned", disabled: true, disabledReason: "Pinned state is not stored by the legacy Media adapter." },
        { id: "needs-review", label: "Needs Review", href: getModuleViewRoute("media", "needs-review") },
        { id: "in-use", label: "In Use", href: getModuleViewRoute("media", "in-use") },
        { id: "archived", label: "Archived", disabled: true, disabledReason: "Native Media lifecycle state is not connected." }
      ]
    },
    {
      id: "types",
      label: "Types",
      items: ["Images", "Video", "Audio", "Screenshots", "Design Files", "Documents / PDFs", "Source Files"].map((label) => ({
        id: `type-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        label,
        disabled: true,
        disabledReason: "Canonical Media type counts require native records. Browser type hints stay inside this local preview."
      }))
    },
    {
      id: "context",
      label: "Context",
      items: ["Linked to Projects", "Linked to People", "Linked to Notes", "Linked to Resources", "Linked to Reviews"].map((label) => ({
        id: `context-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        label,
        disabled: true,
        disabledReason: "A local filename is not enough evidence to infer or create a native link."
      }))
    },
    {
      id: "data",
      label: "Data",
      items: [
        { id: "upload-queue", label: "Upload Queue", count: candidates.length, active: true, href: getModuleViewRoute("media", "upload-queue") },
        { id: "missing-metadata", label: "Missing Metadata", href: getModuleViewRoute("media", "missing-metadata") },
        { id: "duplicates", label: "Duplicates", href: getModuleViewRoute("media", "duplicates") },
        { id: "rights", label: "Rights / Usage", href: getModuleViewRoute("media", "rights-usage") },
        { id: "settings", label: "Settings", disabled: true, disabledReason: "Native Media settings remain an open product decision." }
      ]
    }
  ];

  const sidebar = (
    <ModuleSidebar
      title="Media"
      description="Binary intake, provenance, rights, versions, duplicates, and usage."
      sections={sidebarSections}
      mobileOpen={mobileSidebarOpen}
      onClose={() => setMobileSidebarOpen(false)}
      className={baseStyles.sidebar}
      footer={
        <p className={baseStyles.sidebarFootnote}>
          Local preview items disappear on refresh. Native Media records are unchanged.
        </p>
      }
    />
  );

  const inspector = (
    <MediaUploadInspector
      selected={selected}
      duplicateMatches={selectedDuplicateMatches}
      activeTab={activeTab}
      onTabChange={(tab) => {
        setActiveTab(tab);
        updateUrl({ tab }, "push");
      }}
      onRemove={(id) => removeCandidates(new Set([id]))}
      overlay={isInspectorOverlay}
      overlayOpen={inspectorOpen}
      onRequestClose={() => setInspectorOpen(false)}
    />
  );

  const aiDock = (
    <SharedAIDock
      open={aiOpen}
      className={styles.aiDock}
      onOpenChange={(open) => {
        setAiOpen(open);
        updateUrl({ ai: open });
      }}
      context={{
        module: "media",
        activeTab,
        visibleScope: "Local intake preview"
      }}
    />
  );

  const possibleDuplicateCount = duplicateMatches.size;
  const browserTypeCount = candidates.filter((candidate) => candidate.browserMimeType).length;
  const needsTypeCount = candidates.length - browserTypeCount;
  const filterCounts: Readonly<Record<MediaUploadFilter, number>> = {
    all: queryScope.length,
    "needs-type": queryScope.filter((candidate) => !candidate.browserMimeType).length,
    "possible-duplicate": queryScope.filter((candidate) => duplicateMatches.has(candidate.localId)).length
  };
  const groups = [
    {
      id: "possible-local-matches",
      label: "Possible local matches",
      description: "Filename, size, and modified time match inside this browser selection; binary equality is not established.",
      candidates: visibleCandidates.filter((candidate) => duplicateMatches.has(candidate.localId))
    },
    {
      id: "local-preview",
      label: "Local intake preview",
      description: "Browser-reported metadata only. These rows are not uploads, RawFiles, UploadQueueItems, or MediaAssets.",
      candidates: visibleCandidates.filter((candidate) => !duplicateMatches.has(candidate.localId))
    }
  ].filter((group) => group.candidates.length > 0);

  return (
    <>
      <ModuleShell
        module="media"
        sidebar={sidebar}
        inspector={inspector}
        aiDock={isInspectorOverlay && inspectorOpen ? null : aiDock}
        mode="directory"
        ariaLabel="Media local upload intake preview"
        className={baseStyles.shell}
      >
        <button
          className={`${baseStyles.button} ${baseStyles.mobileMenuButton}`}
          type="button"
          onClick={() => {
            setInspectorOpen(false);
            setMobileSidebarOpen(true);
          }}
          aria-label="Open Media navigation"
        >
          Menu
        </button>
        {selected && (
          <button
            className={`${baseStyles.button} ${baseStyles.mobileInspectorButton}`}
            type="button"
            onClick={() => {
              setMobileSidebarOpen(false);
              setInspectorOpen(true);
            }}
            aria-label={`Inspect ${selected.originalFilename}`}
          >
            Details
          </button>
        )}
        {(mobileSidebarOpen || (isInspectorOverlay && inspectorOpen)) && (
          <button
            type="button"
            className={baseStyles.scrim}
            aria-label="Close open panel"
            onClick={() => {
              setMobileSidebarOpen(false);
              setInspectorOpen(false);
            }}
          />
        )}

        <DirectoryPane className={baseStyles.directory} ariaLabel="Local Media intake queue">
          <div className={baseStyles.mainScroll}>
            <header className={baseStyles.directoryHeader}>
              <div>
                <span className={baseStyles.eyebrow}>Media</span>
                <h1>Upload Queue</h1>
                <p>{candidates.length} local preview · 0 uploaded · resets on refresh</p>
              </div>
              <QuickActionBar
                ariaLabel="Media local intake actions"
                actions={[
                  { id: "filter", label: "Filter", disabled: true, disabledReason: "The implemented local evidence segments below are the available filters." },
                  { id: "process", label: "Process batch", disabled: true, disabledReason: "No upload, validation, security, or extraction service is connected." },
                  { id: "import", label: "Import source", disabled: true, disabledReason: "Resource import requires native source and RawFile persistence." },
                  { id: "choose", label: "+ Choose files", intent: "primary", onSelect: () => inputRef.current?.click() }
                ]}
              />
            </header>

            <MetricStrip
              ariaLabel="Local intake evidence metrics"
              className={styles.metricStrip}
              items={[
                { id: "local", label: "Local preview", value: candidates.length, detail: "session only" },
                { id: "typed", label: "Browser type reported", value: browserTypeCount, detail: "candidate" },
                { id: "needs-type", label: "Browser type missing", value: needsTypeCount, detail: "not inferred", tone: needsTypeCount ? "attention" : "default" },
                { id: "duplicates", label: "Possible local matches", value: possibleDuplicateCount, detail: "metadata only", tone: possibleDuplicateCount ? "attention" : "default" },
                { id: "source", label: "Source unassigned", value: candidates.length, detail: "Resources owns URLs" },
                { id: "rights", label: "Rights unconfirmed", value: candidates.length, detail: "no local default" },
                { id: "queue", label: "Native queue records", value: 0, detail: "repository absent" },
                { id: "uploaded", label: "Uploaded", value: 0, detail: "no transport" }
              ]}
            />

            <section className={styles.boundaryBanner} aria-labelledby="local-intake-boundary-title">
              <div>
                <span className={styles.boundaryMarker} aria-hidden="true">LOCAL</span>
                <div>
                  <h2 id="local-intake-boundary-title">Preflight files without uploading them</h2>
                  <p>
                    This page copies browser-reported name, type, size, and modified time into memory.
                    It does not read file contents, transmit bytes, create storage keys, or write Media records.
                  </p>
                </div>
              </div>
              <strong>Refresh clears this preview</strong>
            </section>

            <section
              className={styles.dropZone}
              data-active={dragActive || undefined}
              aria-label="Choose or drop local files"
              onDragEnter={(event) => {
                event.preventDefault();
                dragDepth.current += 1;
                setDragActive(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                event.preventDefault();
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (dragDepth.current === 0) setDragActive(false);
              }}
              onDrop={onDrop}
            >
              <input
                ref={inputRef}
                className="sr-only"
                type="file"
                multiple
                aria-label="Choose local files for Media intake preview"
                onChange={(event) => {
                  stageFiles(Array.from(event.currentTarget.files || []), "manual_upload");
                  event.currentTarget.value = "";
                }}
              />
              <span className={styles.dropIcon} aria-hidden="true">↓</span>
              <div>
                <strong>{dragActive ? "Drop to add metadata to this preview" : "Choose or drop files"}</strong>
                <span>Any file type · metadata only · no byte read · no network request</span>
              </div>
              <button className={baseStyles.button} data-primary="true" type="button" onClick={() => inputRef.current?.click()}>
                Choose files
              </button>
            </section>

            <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

            <label className={baseStyles.search}>
              <span aria-hidden="true">/</span>
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  const next = event.target.value;
                  setQuery(next);
                }}
                placeholder="Search local filenames, browser types, extensions…"
                aria-label="Search local intake preview"
              />
              <kbd>local</kbd>
            </label>

            <div className={baseStyles.chipRow} aria-label="Local intake evidence segments">
              {FILTERS.map((segment) => (
                <button
                  className={baseStyles.chip}
                  data-active={filter === segment.id || undefined}
                  data-tone={segment.tone}
                  type="button"
                  onClick={() => {
                    setFilter(segment.id);
                    updateUrl({ filter: segment.id }, "push");
                  }}
                  aria-pressed={filter === segment.id}
                  key={segment.id}
                >
                  {segment.label} · {filterCounts[segment.id]}
                </button>
              ))}
            </div>

            <div className={baseStyles.sortRow}>
              <label className={baseStyles.field}>
                Sort
                <select
                  value={sort}
                  onChange={(event) => {
                    const next = event.target.value as MediaUploadSort;
                    setSort(next);
                    updateUrl({ sort: next });
                  }}
                >
                  {(Object.keys(SORT_LABELS) as MediaUploadSort[]).map((value) => (
                    <option value={value} key={value}>{SORT_LABELS[value]}</option>
                  ))}
                </select>
              </label>
              <span>Scope · <strong>{visibleCandidates.length} shown</strong></span>
              <button
                className={baseStyles.button}
                type="button"
                disabled={!visibleCandidates.length}
                title={!visibleCandidates.length ? "No visible local rows to select." : undefined}
                onClick={selectVisible}
              >
                {visibleCandidates.length > 0 && visibleCandidates.every((candidate) => batchSelection.has(candidate.localId))
                  ? "Clear visible"
                  : "Select visible"}
              </button>
              <button
                className={baseStyles.button}
                type="button"
                disabled={!candidates.length}
                title={!candidates.length ? "The local preview is already empty." : undefined}
                onClick={() => setClearConfirmationOpen(true)}
              >
                Clear preview
              </button>
            </div>

            {lastRemoved && (
              <div className={styles.undoBar} role="status">
                <span>{lastRemoved.candidates.length} local preview item{lastRemoved.candidates.length === 1 ? "" : "s"} removed.</span>
                <button className={baseStyles.button} type="button" onClick={undoRemoval}>Undo</button>
              </div>
            )}

            {batchSelection.size > 0 && (
              <div className={baseStyles.batchBar} role="toolbar" aria-label="Selected local intake actions">
                <strong>{batchSelection.size} selected</strong>
                <button className={baseStyles.button} type="button" onClick={() => setBatchSelection(new Set())}>Clear selection</button>
                <button className={baseStyles.button} type="button" onClick={() => removeCandidates(batchSelection)}>Remove from preview</button>
                <QuickActionBar
                  ariaLabel="Unavailable selected local intake actions"
                  actions={[
                    { id: "metadata", label: "Set metadata", disabled: true, disabledReason: "A native UploadQueueItem draft does not exist." },
                    { id: "rights", label: "Set rights", disabled: true, disabledReason: "Rights evidence and audit persistence are not connected." },
                    { id: "links", label: "Link object", disabled: true, disabledReason: "No persisted UploadQueueItem or ObjectLink exists." },
                    { id: "create", label: "Create assets", intent: "primary", disabled: true, disabledReason: "No RawFile upload, validation, storage, or MediaAsset creation service is connected." }
                  ]}
                />
              </div>
            )}

            {!candidates.length ? (
              <SystemState
                variant="empty"
                title="No local files in preview"
                description="Choose or drop files above. Only browser-reported metadata will be held in this page's memory."
              />
            ) : groups.length ? (
              <div className={baseStyles.queueGroups} aria-label="Local intake preview groups">
                {groups.map((group) => (
                  <section className={baseStyles.queueGroup} aria-labelledby={`local-upload-group-${group.id}`} key={group.id}>
                    <header className={baseStyles.queueGroupHeader}>
                      <div>
                        <h2 id={`local-upload-group-${group.id}`}>{group.label}</h2>
                        <p>{group.description}</p>
                      </div>
                      <strong>{group.candidates.length}</strong>
                    </header>
                    <div className={baseStyles.list} data-density="compact" role="list">
                      {group.candidates.map((candidate) => {
                        const possibleDuplicate = duplicateMatches.has(candidate.localId);
                        return (
                          <DenseObjectRow
                            id={candidate.localId}
                            title={candidate.originalFilename}
                            leading={<span className={styles.localFileTile} aria-hidden="true">LF</span>}
                            description={`${candidate.browserMimeType || "Browser type missing"} · ${candidate.extension ? `.${candidate.extension}` : "no extension"} · source and rights unassigned`}
                            metadata={`${candidate.localId} · ${formatLocalFileSize(candidate.sizeBytes)} · added ${formatAddedTime(candidate.addedAt)}`}
                            trailing={
                              <>
                                <strong>{possibleDuplicate ? "Possible local match" : "Local preview"}</strong>
                                <span>Not uploaded</span>
                              </>
                            }
                            selected={candidate.localId === selectedId}
                            onSelect={() => selectCandidate(candidate)}
                            checkbox={{
                              checked: batchSelection.has(candidate.localId),
                              onCheckedChange: (checked) => {
                                setBatchSelection((current) => {
                                  const next = new Set(current);
                                  if (checked) next.add(candidate.localId);
                                  else next.delete(candidate.localId);
                                  return next;
                                });
                              },
                              label: `Select ${candidate.originalFilename} for local preview actions`
                            }}
                            key={candidate.localId}
                          />
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <SystemState
                variant="empty"
                title="No local files match this view"
                description="Change the search or local evidence segment. No file or native record was changed."
                action={{
                  label: "Show all local files",
                  onSelect: () => {
                    setQuery("");
                    setFilter("all");
                    updateUrl({ filter: "all" });
                  }
                }}
              />
            )}
          </div>
        </DirectoryPane>
      </ModuleShell>

      <ConfirmationSheet
        open={clearConfirmationOpen}
        onOpenChange={setClearConfirmationOpen}
        onConfirm={clearPreview}
        title="Clear this local intake preview?"
        description="This removes browser-reported metadata from the current page session only."
        consequences={[
          `${candidates.length} local preview item${candidates.length === 1 ? "" : "s"} will leave the list.`,
          "No file on your device will be changed or deleted.",
          "No native Media record exists to archive or delete."
        ]}
        confirmLabel="Clear local preview"
      />
    </>
  );
}
