"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import DirectoryPane from "./admin-shell/DirectoryPane";
import InspectorRail from "./admin-shell/InspectorRail";
import ModuleShell from "./admin-shell/ModuleShell";
import ModuleSidebar, { type ModuleSidebarSection } from "./admin-shell/ModuleSidebar";
import SharedAIDock from "./admin-shell/SharedAIDock";
import DenseObjectRow from "./operational/DenseObjectRow";
import DetailTabs, { DetailTabPanel, type DetailTab } from "./operational/DetailTabs";
import EvidenceChecklist from "./operational/EvidenceChecklist";
import ObjectHeader from "./operational/ObjectHeader";
import QuickActionBar from "./operational/QuickActionBar";
import SystemState from "./operational/SystemState";
import {
  contentLinksForObject,
  type LegacyContentGraph
} from "../lib/modules/content-graph/types";
import {
  buildMediaMetadataEvidence,
  matchesMediaMetadataIssue,
  type MediaMetadataIssue
} from "../lib/modules/media/metadata-evidence";
import {
  buildMediaRightsEvidence,
  matchesMediaRightsIssue,
  type MediaRightsIssue
} from "../lib/modules/media/rights-evidence";
import type { MediaAsset } from "../lib/modules/media/types";
import {
  parseMediaUrlState,
  serializeMediaUrlState,
  type MediaIssue,
  type MediaTab,
  type MediaUrlState
} from "../lib/native-objects/url-state";
import { getModuleRoute, getModuleViewRoute, getNativeObjectRoute } from "../lib/native-objects/routes";
import styles from "./content-graph/ContentGraphWorkspace.module.css";

type MediaWorkspaceProps = {
  initialAssets: MediaAsset[];
  contentGraph: LegacyContentGraph;
  initialMode?: "index" | "detail";
  initialSelectedId?: string;
  initialLoadError?: string;
  initialView?: MediaView;
  initialTab?: MediaTab;
  queueMode?: "needs-review" | "missing-metadata" | "rights-usage";
};

type MediaView = MediaUrlState["view"];
type MediaSort = MediaUrlState["sort"];

const REVIEW_ISSUE_SEGMENTS: ReadonlyArray<{
  id: MediaIssue;
  label: string;
  tone: "blue" | "green" | "amber" | "pink" | "purple";
}> = [
  { id: "all", label: "All", tone: "blue" },
  { id: "rights", label: "Rights", tone: "amber" },
  { id: "type", label: "Type", tone: "pink" },
  { id: "binary", label: "Binary", tone: "blue" },
  { id: "no-resource-candidate", label: "No accepted Resource candidate", tone: "amber" },
  { id: "resource-candidate", label: "Resource candidate", tone: "green" },
  { id: "accessibility", label: "Accessibility", tone: "purple" },
  { id: "links", label: "Native links", tone: "blue" }
];

const METADATA_ISSUE_SEGMENTS: ReadonlyArray<{
  id: MediaMetadataIssue;
  label: string;
  tone: "blue" | "green" | "amber" | "pink" | "purple";
}> = [
  { id: "all", label: "All", tone: "blue" },
  { id: "type", label: "Type", tone: "pink" },
  { id: "source", label: "Source", tone: "amber" },
  { id: "binary", label: "Binary facts", tone: "blue" },
  { id: "accessibility", label: "Alt / OCR state", tone: "purple" },
  { id: "rights", label: "Rights", tone: "amber" },
  { id: "links", label: "Linked context", tone: "blue" },
  { id: "owner", label: "Owner / creator", tone: "green" }
];

const RIGHTS_ISSUE_SEGMENTS: ReadonlyArray<{
  id: MediaRightsIssue;
  label: string;
  tone: "blue" | "green" | "amber" | "pink" | "purple";
}> = [
  { id: "all", label: "All", tone: "blue" },
  { id: "needs-confirmation", label: "Needs confirmation", tone: "amber" },
  { id: "confirmed-rights", label: "Confirmed evidence", tone: "green" },
  { id: "resource-candidate", label: "Source candidate", tone: "blue" },
  { id: "no-resource-candidate", label: "Source evidence unavailable", tone: "pink" },
  { id: "usage-unavailable", label: "Usage unavailable", tone: "purple" }
];

const MEDIA_TABS: readonly DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "preview", label: "Preview" },
  { id: "links", label: "Links" },
  { id: "usage", label: "Usage" },
  { id: "review", label: "Review" },
  { id: "properties", label: "Properties" }
];

const METADATA_TABS: readonly DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "metadata", label: "Metadata" },
  { id: "source", label: "Source" },
  { id: "links", label: "Links" },
  { id: "rights", label: "Rights" },
  { id: "usage", label: "Usage" },
  { id: "audit", label: "Audit" },
  { id: "properties", label: "Properties" }
];

const RIGHTS_TABS: readonly DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "rights", label: "Rights" },
  { id: "usage", label: "Usage" },
  { id: "source", label: "Source" },
  { id: "versions", label: "Versions" },
  { id: "audit", label: "Audit" },
  { id: "properties", label: "Properties" }
];

function normalizeMediaTabForQueue(
  tab: MediaTab,
  queueMode: MediaWorkspaceProps["queueMode"],
  fallback?: MediaTab
): MediaTab {
  if (queueMode === "rights-usage" && !RIGHTS_TABS.some((candidate) => candidate.id === tab)) {
    return fallback || "rights";
  }
  return tab;
}

const VIEW_LABELS: Readonly<Record<MediaView, string>> = {
  all: "All Media",
  recent: "Recent Uploads",
  pinned: "Pinned",
  "needs-review": "Needs Review",
  "in-use": "In Use",
  "missing-metadata": "Missing Metadata",
  "rights-usage": "Rights / Usage",
  archived: "Archived"
};

const SORT_LABELS: Readonly<Record<MediaSort, string>> = {
  "uploaded-desc": "Added — newest",
  "updated-desc": "Updated — newest",
  title: "Title — A–Z",
  size: "File size",
  review: "Review state",
  usage: "Usage"
};

function formatDate(value?: string, fallback = "Not recorded") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric"
  }).format(date);
}

function displayLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function summarizeBody(body: string) {
  return body.trim().replace(/\s+/g, " ") || "No legacy description is stored.";
}

function matchesQuery(asset: MediaAsset, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    asset.id,
    asset.title,
    asset.body,
    asset.provenance.domain,
    asset.provenance.status,
    ...asset.source.resourceReferences.map((reference) => reference.value),
    ...asset.provenance.areas,
    ...asset.provenance.subjects,
    ...asset.provenance.projects,
    ...asset.provenance.externalSources,
    ...asset.provenance.nonUrlExternalReferences
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function sortAssets(assets: MediaAsset[], sort: MediaSort) {
  return [...assets].sort((left, right) => {
    if (sort === "title") {
      return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
    }
    if (sort === "uploaded-desc") {
      return right.createdAt.localeCompare(left.createdAt);
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function viewUnavailable(view: MediaView) {
  if (view === "recent") {
    return "Upload events and a verified recency window are not available in the legacy file model.";
  }
  if (view === "pinned") {
    return "Pinned state is not stored by the legacy Media adapter.";
  }
  if (view === "needs-review") {
    return "AssetReview records are not connected, so the system cannot identify a review queue.";
  }
  if (view === "in-use") {
    return "AssetUsage records are not connected, so active dependencies cannot be claimed.";
  }
  if (view === "missing-metadata") {
    return "The canonical Missing Metadata route provides legacy evidence triage; native metadata completion remains disconnected.";
  }
  if (view === "rights-usage") {
    return "The canonical Rights / Usage route provides legacy evidence triage; native rights and usage persistence remain disconnected.";
  }
  if (view === "archived") {
    return "Media lifecycle and archive state are not represented by the legacy file record.";
  }
  return "";
}

function sortUnavailable(sort: MediaSort) {
  if (sort === "size") return "Verified binary size is not available.";
  if (sort === "review") return "AssetReview state is not connected.";
  if (sort === "usage") return "AssetUsage records are not connected.";
  return "";
}

function relationEntries(asset: MediaAsset) {
  return Object.entries(asset.provenance.relations).flatMap(([direction, ids]) =>
    ids.map((id) => ({ direction, id }))
  );
}

function hasConnectedBinary(asset: MediaAsset) {
  return Boolean(asset.source.rawFileId && asset.source.storageKey);
}

function hasConfirmedRights(asset: MediaAsset) {
  return (
    asset.rights.scopeState === "confirmed" &&
    Boolean(asset.rights.confirmedBy) &&
    Boolean(asset.rights.confirmedAt) &&
    asset.rights.state !== "unknown" &&
    asset.rights.state !== "needs_confirmation"
  );
}

function accessibilityIsDetermined(asset: MediaAsset) {
  return (
    asset.accessibility.altTextState !== "unknown" ||
    asset.accessibility.ocrState !== "unknown" ||
    asset.accessibility.transcriptState !== "unknown"
  );
}

function matchesIssue(asset: MediaAsset, issue: MediaIssue) {
  if (issue === "rights") return !hasConfirmedRights(asset);
  if (issue === "type") return asset.type === "unknown";
  if (issue === "binary") return !hasConnectedBinary(asset);
  if (issue === "no-resource-candidate") return asset.source.resourceReferences.length === 0;
  if (issue === "resource-candidate") return asset.source.resourceReferences.length > 0;
  if (issue === "accessibility") return !accessibilityIsDetermined(asset);
  // Native AssetLink records are not part of the legacy adapter, even when
  // untyped relation IDs are retained in provenance.
  if (issue === "links") return true;
  return issue === "all";
}

type LegacyReadinessCheck = {
  id: string;
  label: string;
  detail: string;
  supported: boolean;
};

function legacyReadinessChecks(asset: MediaAsset): LegacyReadinessCheck[] {
  const retainedRelations = relationEntries(asset).length;
  const hasIdentity = Boolean(asset.id.trim() && asset.title.trim());
  const sourceResolved = asset.source.state !== "unknown" && asset.source.state !== "resource_reference_unresolved";

  return [
    {
      id: "identity",
      label: "Legacy identity retained",
      detail: hasIdentity ? "Original ID and title are preserved." : "A stable legacy ID and title are required.",
      supported: hasIdentity
    },
    {
      id: "type",
      label: "Media type verified",
      detail: asset.type === "unknown" ? "The legacy file record does not store a verified Media type." : displayLabel(asset.type),
      supported: asset.type !== "unknown"
    },
    {
      id: "binary",
      label: "Binary identity connected",
      detail: hasConnectedBinary(asset) ? "Raw file and storage identity are connected." : "No raw file ID or storage key is available.",
      supported: hasConnectedBinary(asset)
    },
    {
      id: "source",
      label: "Source provenance resolved",
      detail: sourceResolved
        ? "A native Media source is recorded."
        : asset.source.resourceReferences.length
          ? `${asset.source.resourceReferences.length} URL candidate${asset.source.resourceReferences.length === 1 ? "" : "s"} remain owned by Resources and unresolved.`
          : "No external Resource candidate is retained; native source provenance is not recorded.",
      supported: sourceResolved
    },
    {
      id: "rights",
      label: "Rights confirmed",
      detail: hasConfirmedRights(asset) ? "Rights evidence is confirmed." : "Canonical rights remain Needs confirmation; internal/review scope is provisional.",
      supported: hasConfirmedRights(asset)
    },
    {
      id: "accessibility",
      label: "Accessibility requirement determined",
      detail: accessibilityIsDetermined(asset)
        ? "At least one accessibility workflow state is recorded."
        : "Type and accessibility workflow state are both unverified.",
      supported: accessibilityIsDetermined(asset)
    },
    {
      id: "links",
      label: "Native context links verified",
      detail: retainedRelations
        ? `${retainedRelations} legacy relation entr${retainedRelations === 1 ? "y is" : "ies are"} retained but untyped.`
        : "No native AssetLink records are connected.",
      supported: false
    },
    {
      id: "ready",
      label: "Ready for native review",
      detail: asset.readinessState === "ready" ? "Native readiness is recorded." : "Native readiness and AssetReview persistence are not connected.",
      supported: asset.readinessState === "ready"
    }
  ];
}

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

export default function MediaWorkspace({
  initialAssets,
  contentGraph,
  initialMode = "index",
  initialSelectedId,
  initialLoadError = "",
  initialView,
  initialTab,
  queueMode
}: MediaWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [initialUrlState] = useState(() => parseMediaUrlState(searchParams));
  const [view, setView] = useState<MediaView>(
    queueMode && initialView
      ? initialView
      : searchParams.has("view")
        ? initialUrlState.view
        : initialView || initialUrlState.view
  );
  const [sort, setSort] = useState<MediaSort>(initialUrlState.sort);
  const [query, setQuery] = useState(initialUrlState.query);
  const [selectedId, setSelectedId] = useState(
    initialSelectedId || initialUrlState.selected || initialAssets[0]?.id || ""
  );
  const [activeTab, setActiveTab] = useState<MediaTab>(
    normalizeMediaTabForQueue(
      searchParams.has("tab") && searchParams.get("tab") === initialUrlState.tab
        ? initialUrlState.tab
        : initialTab || initialUrlState.tab,
      queueMode,
      initialTab
    )
  );
  const [issue, setIssue] = useState<MediaIssue>(initialUrlState.issue);
  const [batchSelection, setBatchSelection] = useState<Set<string>>(() => new Set());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(initialUrlState.ai);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useMediaQuery("(max-width: 760px)");
  const isInspectorOverlay = useMediaQuery("(max-width: 1240px)");
  const searchParamKey = searchParams.toString();

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);

  const selectedAsset = useMemo(
    () => initialAssets.find((asset) => asset.id === selectedId) || null,
    [initialAssets, selectedId]
  );
  const isLegacyReadinessQueue = queueMode === "needs-review" && view === "needs-review";
  const isLegacyMetadataQueue = queueMode === "missing-metadata" && view === "missing-metadata";
  const isLegacyRightsQueue = queueMode === "rights-usage" && view === "rights-usage";
  const isLegacyEvidenceQueue = isLegacyReadinessQueue || isLegacyMetadataQueue || isLegacyRightsQueue;
  const normalizeIssue = (nextIssue: MediaIssue): MediaIssue =>
    isLegacyMetadataQueue
      ? (METADATA_ISSUE_SEGMENTS.some((segment) => segment.id === nextIssue) ? nextIssue : "all")
      : isLegacyRightsQueue
        ? (RIGHTS_ISSUE_SEGMENTS.some((segment) => segment.id === nextIssue) ? nextIssue : "all")
        : (REVIEW_ISSUE_SEGMENTS.some((segment) => segment.id === nextIssue) ? nextIssue : "all");
  const effectiveIssue = normalizeIssue(issue);
  const unavailableViewReason = isLegacyEvidenceQueue ? "" : viewUnavailable(view);
  const unavailableSortReason = sortUnavailable(sort);
  const readinessScope = useMemo(
    () => initialAssets.filter((asset) => matchesQuery(asset, query)),
    [initialAssets, query]
  );
  const metadataEvidenceById = useMemo(
    () => new Map(initialAssets.map((asset) => [asset.id, buildMediaMetadataEvidence(asset)])),
    [initialAssets]
  );
  const rightsEvidenceById = useMemo(
    () => new Map(initialAssets.map((asset) => [asset.id, buildMediaRightsEvidence(asset)])),
    [initialAssets]
  );
  const visibleAssets = useMemo(
    () =>
      unavailableViewReason
        ? []
        : sortAssets(
            initialAssets.filter(
              (asset) =>
                matchesQuery(asset, query) &&
                (!isLegacyReadinessQueue || matchesIssue(asset, effectiveIssue)) &&
                (!isLegacyMetadataQueue || matchesMediaMetadataIssue(asset, effectiveIssue as MediaMetadataIssue)) &&
                (!isLegacyRightsQueue || matchesMediaRightsIssue(asset, effectiveIssue as MediaRightsIssue))
            ),
            sort
          ),
    [
      effectiveIssue,
      initialAssets,
      isLegacyMetadataQueue,
      isLegacyReadinessQueue,
      isLegacyRightsQueue,
      query,
      sort,
      unavailableViewReason
    ]
  );
  const readinessMetrics = useMemo(
    () => [
      { id: "records", label: "Legacy records", value: readinessScope.length, note: "triage" },
      { id: "rights", label: "Rights confirmation", value: readinessScope.filter((asset) => !hasConfirmedRights(asset)).length, note: "required" },
      { id: "type", label: "Type unverified", value: readinessScope.filter((asset) => asset.type === "unknown").length, note: "unknown" },
      { id: "binary", label: "Binary not connected", value: readinessScope.filter((asset) => !hasConnectedBinary(asset)).length, note: "boundary" },
      { id: "candidate", label: "Resource candidates", value: readinessScope.filter((asset) => asset.source.resourceReferences.length > 0).length, note: "unresolved" },
      { id: "no-candidate", label: "No accepted Resource candidate", value: readinessScope.filter((asset) => asset.source.resourceReferences.length === 0).length, note: "not inferred" },
      { id: "accessibility", label: "Accessibility unverified", value: readinessScope.filter((asset) => !accessibilityIsDetermined(asset)).length, note: "unknown" },
      { id: "links", label: "Native links unavailable", value: readinessScope.length, note: "legacy" }
    ],
    [readinessScope]
  );
  const metadataMetrics = useMemo(
    () => [
      { id: "records", label: "Legacy records", value: readinessScope.length, note: "evidence" },
      { id: "type", label: "Type unverified", value: readinessScope.filter((asset) => matchesMediaMetadataIssue(asset, "type")).length, note: "not inferred" },
      { id: "source", label: "Source unverified", value: readinessScope.filter((asset) => matchesMediaMetadataIssue(asset, "source")).length, note: "Resources owns URLs" },
      { id: "binary", label: "Binary facts unavailable", value: readinessScope.filter((asset) => matchesMediaMetadataIssue(asset, "binary")).length, note: "no placeholders" },
      { id: "accessibility", label: "Alt / OCR unverified", value: readinessScope.filter((asset) => matchesMediaMetadataIssue(asset, "accessibility")).length, note: "applicability unknown" },
      { id: "rights", label: "Rights confirmation", value: readinessScope.filter((asset) => matchesMediaMetadataIssue(asset, "rights")).length, note: "provisional scope" },
      { id: "links", label: "Native context unavailable", value: readinessScope.filter((asset) => matchesMediaMetadataIssue(asset, "links")).length, note: "legacy refs retained" },
      { id: "owner", label: "Owner / creator unverified", value: readinessScope.filter((asset) => matchesMediaMetadataIssue(asset, "owner")).length, note: "identity" }
    ],
    [readinessScope]
  );
  const rightsMetrics = useMemo(() => {
    const evidence = readinessScope.map((asset) => rightsEvidenceById.get(asset.id) || buildMediaRightsEvidence(asset));
    return [
      { id: "records", label: "Legacy assets", value: readinessScope.length, note: "search scope" },
      { id: "confirmation", label: "Needs confirmation", value: evidence.filter((item) => !item.rightsConfirmed).length, note: "canonical state" },
      { id: "confirmed", label: "Confirmed evidence", value: evidence.filter((item) => item.rightsConfirmed).length, note: "timestamp required" },
      { id: "candidate", label: "Resource candidates", value: evidence.filter((item) => item.sourceState === "candidate").length, note: "URLs stay in Resources" },
      { id: "source-gap", label: "Source evidence unavailable", value: evidence.filter((item) => item.sourceState === "unavailable").length, note: "not proof of absence" },
      { id: "scope", label: "Provisional internal / review", value: evidence.filter((item) => item.hasProvisionalScope).length, note: "not a rights grant" },
      { id: "usage", label: "Native usage registry", value: "—", note: "not connected" }
    ];
  }, [readinessScope, rightsEvidenceById]);
  const readinessGroups = useMemo(
    () => [
      {
        id: "no-resource-candidate",
        label: "No accepted Resource candidate retained",
        description: "Resolve local/import provenance before treating these records as curated Media.",
        assets: visibleAssets.filter((asset) => asset.source.resourceReferences.length === 0)
      },
      {
        id: "resource-candidate",
        label: "Unresolved Resource candidates",
        description: "URLs remain with Resources and require an explicit Media source relationship.",
        assets: visibleAssets.filter((asset) => asset.source.resourceReferences.length > 0)
      }
    ].filter((group) => group.assets.length > 0),
    [visibleAssets]
  );
  const metadataGroups = useMemo(
    () => [
      {
        id: "native-source",
        label: "Native source evidence available",
        description: "A future native Media source record can be inspected without changing asset identity.",
        assets: visibleAssets.filter((asset) => asset.source.id !== null)
      },
      {
        id: "resource-candidates",
        label: "Resource candidates retained",
        description: "Resolve the external-source owner before confirming Media provenance; URLs remain Resources-owned.",
        assets: visibleAssets.filter((asset) => asset.source.id === null && asset.source.resourceReferences.length > 0)
      },
      {
        id: "source-unverified",
        label: "Source evidence unavailable in legacy adapter",
        description: "No accepted HTTP(S) candidate is retained. Invalid or withheld evidence may still exist; this is not proof that the original asset had no source.",
        assets: visibleAssets.filter((asset) => asset.source.id === null && asset.source.resourceReferences.length === 0)
      }
    ].filter((group) => group.assets.length > 0),
    [visibleAssets]
  );
  const rightsGroups = useMemo(
    () => [
      {
        id: "confirmation-native-source",
        label: "Needs confirmation · native source connected",
        description: "Source identity is available, while rights evidence and allowed-use confirmation still require an audited decision.",
        assets: visibleAssets.filter((asset) => {
          const evidence = rightsEvidenceById.get(asset.id) || buildMediaRightsEvidence(asset);
          return !evidence.rightsConfirmed && evidence.sourceState === "native";
        })
      },
      {
        id: "confirmation-source-candidate",
        label: "Needs confirmation · Resource candidate retained",
        description: "A URL candidate can be inspected in Resources, but it is not yet a persisted Media source or rights grant.",
        assets: visibleAssets.filter((asset) => {
          const evidence = rightsEvidenceById.get(asset.id) || buildMediaRightsEvidence(asset);
          return !evidence.rightsConfirmed && evidence.sourceState === "candidate";
        })
      },
      {
        id: "confirmation-source-unavailable",
        label: "Needs confirmation · source evidence unavailable",
        description: "The adapter retained no accepted HTTP(S) source candidate. Treat this as an evidence gap, not proof that the asset has no source.",
        assets: visibleAssets.filter((asset) => {
          const evidence = rightsEvidenceById.get(asset.id) || buildMediaRightsEvidence(asset);
          return !evidence.rightsConfirmed && evidence.sourceState === "unavailable";
        })
      },
      {
        id: "confirmed",
        label: "Confirmed rights evidence",
        description: "Only records with a non-placeholder rights state, confirmation actor, and confirmation timestamp appear here.",
        assets: visibleAssets.filter((asset) => {
          const evidence = rightsEvidenceById.get(asset.id) || buildMediaRightsEvidence(asset);
          return evidence.rightsConfirmed;
        })
      }
    ].filter((group) => group.assets.length > 0),
    [rightsEvidenceById, visibleAssets]
  );

  useEffect(() => {
    const next = parseMediaUrlState(searchParams);
    const nextView = queueMode && initialView
      ? initialView
      : searchParams.has("view")
        ? next.view
        : initialView || next.view;
    const parsedTabIsValid = !searchParams.has("tab") || searchParams.get("tab") === next.tab;
    const requestedTab = searchParams.has("tab") && parsedTabIsValid
      ? next.tab
      : initialTab || next.tab;
    const nextTab = normalizeMediaTabForQueue(requestedTab, queueMode, initialTab);
    const nextIssue = normalizeIssue(next.issue);
    const nextVisibleAssets = initialMode === "index" ? assetsVisibleFor(next.query, nextIssue, next.sort) : [];
    const nextSelectedId = initialMode === "index"
      ? nextVisibleAssets.some((asset) => asset.id === next.selected)
        ? next.selected
        : nextVisibleAssets[0]?.id || ""
      : next.selected;

    setView(nextView);
    setSort(next.sort);
    setQuery(next.query);
    setActiveTab(nextTab);
    setIssue(nextIssue);
    setAiOpen(next.ai);
    if (initialMode === "index") {
      setSelectedId(nextSelectedId);
    }

    const viewConflict = Boolean(queueMode && initialView && searchParams.has("view"));
    const tabConflict = searchParams.has("tab") && (!parsedTabIsValid || nextTab !== next.tab);
    const issueConflict = (
      (searchParams.has("issue") && searchParams.get("issue") !== next.issue) ||
      next.issue !== nextIssue
    );
    const selectionConflict = initialMode === "index" && searchParams.has("selected") && next.selected !== nextSelectedId;
    if (viewConflict || tabConflict || issueConflict || selectionConflict) {
      const canonicalParams = serializeMediaUrlState(
        {
          ...next,
          view: nextView,
          tab: nextTab,
          issue: nextIssue,
          selected: nextSelectedId
        },
        searchParams
      );
      if (queueMode && initialView) canonicalParams.delete("view");
      const canonicalQuery = canonicalParams.toString();
      router.replace(`${pathname}${canonicalQuery ? `?${canonicalQuery}` : ""}`, { scroll: false });
    }
  }, [initialAssets, initialMode, initialTab, initialView, queueMode, searchParamKey]);

  function updateUrl(
    partial: Partial<MediaUrlState>,
    method: "push" | "replace" = "replace",
    targetPath = pathname
  ) {
    const params = serializeMediaUrlState(
      {
        view,
        sort,
        query,
        selected: initialMode === "index" ? selectedId : "",
        tab: activeTab,
        issue,
        ai: aiOpen,
        ...partial
      },
      searchParams
    );
    if (
      queueMode &&
      initialView &&
      (targetPath === pathname || targetPath === getModuleViewRoute("media", initialView))
    ) {
      params.delete("view");
    }
    const nextQuery = params.toString();
    const href = `${targetPath}${nextQuery ? `?${nextQuery}` : ""}`;
    if (method === "push") router.push(href, { scroll: false });
    else router.replace(href, { scroll: false });
  }

  function dismissAiForOverlay() {
    if (aiOpen) updateUrl({ ai: false });
    setAiOpen(false);
  }

  function assetsVisibleFor(nextQuery: string, nextIssue: MediaIssue, nextSort: MediaSort = sort) {
    if (unavailableViewReason) return [];

    return sortAssets(
      initialAssets.filter(
        (asset) =>
          matchesQuery(asset, nextQuery) &&
          (!isLegacyReadinessQueue || matchesIssue(asset, nextIssue)) &&
          (!isLegacyMetadataQueue ||
            matchesMediaMetadataIssue(asset, nextIssue as MediaMetadataIssue)) &&
          (!isLegacyRightsQueue ||
            matchesMediaRightsIssue(asset, nextIssue as MediaRightsIssue))
      ),
      nextSort
    );
  }

  function selectView(nextView: MediaView) {
    setView(nextView);
    const targetPath = nextView === "all" || nextView === "needs-review" || nextView === "in-use" || nextView === "missing-metadata" || nextView === "rights-usage"
      ? getModuleViewRoute("media", nextView)
      : getModuleRoute("media");
    const nextTab: MediaTab = nextView === "needs-review"
      ? "review"
      : nextView === "missing-metadata"
        ? "metadata"
        : nextView === "rights-usage"
          ? "rights"
        : nextView === "in-use"
          ? "usage"
        : "overview";
    updateUrl(
      initialMode === "detail"
        ? { view: nextView, selected: selectedId, tab: nextTab, issue: "all" }
        : { view: nextView, tab: nextTab, issue: "all" },
      targetPath === pathname && initialMode !== "detail" ? "replace" : "push",
      targetPath
    );
    setMobileSidebarOpen(false);
    setInspectorOpen(false);
  }

  function selectIssue(nextIssue: MediaIssue) {
    const partial: Partial<MediaUrlState> = { issue: nextIssue };

    if (initialMode === "index") {
      const nextVisibleAssets = assetsVisibleFor(query, nextIssue);
      const nextSelectedId = nextVisibleAssets.some((asset) => asset.id === selectedId)
        ? selectedId
        : nextVisibleAssets[0]?.id || "";
      setSelectedId(nextSelectedId);
      partial.selected = nextSelectedId;
    }

    setIssue(nextIssue);
    setInspectorOpen(false);
    updateUrl(partial);
  }

  function selectAsset(asset: MediaAsset) {
    if (isMobile) {
      const detailRoute = getNativeObjectRoute(asset.nativeRef);
      const nextTab: MediaTab = isLegacyReadinessQueue
        ? "review"
        : isLegacyMetadataQueue
          ? "metadata"
          : isLegacyRightsQueue
            ? "rights"
            : "overview";
      const returnParams = serializeMediaUrlState(
        { view, sort, query, selected: asset.id, tab: nextTab, issue: effectiveIssue, ai: false },
        searchParams
      );
      const returnTo = `${pathname}${returnParams.toString() ? `?${returnParams.toString()}` : ""}`;
      const detailParams = new URLSearchParams({ tab: nextTab, returnTo });
      if (isLegacyRightsQueue) detailParams.set("context", "rights-usage");
      router.push(
        nextTab === "overview" ? detailRoute : `${detailRoute}?${detailParams.toString()}`
      );
      return;
    }
    setSelectedId(asset.id);
    if (isLegacyReadinessQueue) setActiveTab("review");
    if (isLegacyMetadataQueue) setActiveTab("metadata");
    if (isLegacyRightsQueue) setActiveTab("rights");
    if (isInspectorOverlay) setAiOpen(false);
    setInspectorOpen(isInspectorOverlay);
    updateUrl({
      selected: asset.id,
      ...(isInspectorOverlay ? { ai: false } : {}),
      ...(isLegacyReadinessQueue
        ? { tab: "review" as const }
        : isLegacyMetadataQueue
          ? { tab: "metadata" as const }
          : isLegacyRightsQueue
            ? { tab: "rights" as const }
          : {})
    });
  }

  function selectTab(tabId: string) {
    const nextTab = tabId as MediaTab;
    setActiveTab(nextTab);
    updateUrl({ tab: nextTab });
  }

  function setChecked(id: string, checked: boolean) {
    setBatchSelection((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function selectVisible() {
    setBatchSelection((current) => {
      const allSelected = visibleAssets.length > 0 && visibleAssets.every((asset) => current.has(asset.id));
      if (allSelected) {
        const next = new Set(current);
        visibleAssets.forEach((asset) => next.delete(asset.id));
        return next;
      }
      return new Set([...current, ...visibleAssets.map((asset) => asset.id)]);
    });
  }

  const sidebarSections: readonly ModuleSidebarSection[] = [
    {
      id: "media",
      label: "Media",
      items: (["all", "recent", "pinned", "needs-review", "in-use", "archived"] as const).map(
        (itemView) => ({
          id: itemView,
          label: VIEW_LABELS[itemView],
          count: itemView === "all" ? initialAssets.length : undefined,
          active: view === itemView,
          onSelect: () => selectView(itemView)
        })
      )
    },
    {
      id: "types",
      label: "Types",
      items: ["Images", "Video", "Audio", "Screenshots", "Design Files", "Documents / PDFs", "Source Files"].map(
        (label) => ({
          id: `type-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          label,
          disabled: true,
          disabledReason: "Verified Media type is not stored by the legacy file adapter."
        })
      )
    },
    {
      id: "context",
      label: "Context",
      items: ["Linked to Projects", "Linked to People", "Linked to Notes", "Linked to Resources", "Linked to Reviews"].map(
        (label) => ({
          id: `context-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          label,
          disabled: true,
          disabledReason: "Native AssetLink records are not connected; legacy relation IDs are retained in Properties."
        })
      )
    },
    {
      id: "data",
      label: "Data",
      items: [
        {
          id: "data-upload-queue",
          label: "Upload Queue",
          href: getModuleViewRoute("media", "upload-queue")
        },
        {
          id: "data-missing-metadata",
          label: "Missing Metadata",
          count: initialAssets.length,
          active: view === "missing-metadata",
          onSelect: () => selectView("missing-metadata")
        },
        {
          id: "data-duplicates",
          label: "Duplicates",
          href: getModuleViewRoute("media", "duplicates")
        },
        {
          id: "data-rights-usage",
          label: "Rights / Usage",
          count: initialAssets.filter((asset) => !hasConfirmedRights(asset)).length,
          active: view === "rights-usage",
          onSelect: () => selectView("rights-usage")
        },
        {
          id: "data-settings",
          label: "Settings",
          disabled: true,
          disabledReason: "Native Media settings are an open product decision."
        }
      ]
    }
  ];

  function resourceOwnerRoute(value: string) {
    const params = new URLSearchParams({ query: value });
    return `${getModuleRoute("resources")}?${params.toString()}`;
  }

  function renderSourceReferences(asset: MediaAsset) {
    if (!asset.source.resourceReferences.length) {
      return (
        <SystemState
          variant="empty"
          compact
          title="No accepted Resource candidate"
          description="The adapter retained no accepted HTTP(S) URL candidate. Invalid or withheld evidence may still exist, and no binary source is inferred."
        />
      );
    }
    const ownerMatches = contentLinksForObject(contentGraph, asset.nativeRef).filter(
      (candidate) => candidate.relationship === "media_source_reference_candidate"
    );

    return (
      <ul className={styles.sourceList}>
        {asset.source.resourceReferences.map((reference) => {
          const matches = ownerMatches.filter(
            (candidate) => candidate.evidenceValue === reference.value
          );
          return (
            <li key={`${reference.provenance}-${reference.value}`}>
              <span>
                <strong>Unresolved Resource candidate</strong>
                <br />
                {reference.value}
                <small>
                  {matches.length
                    ? ` · ${matches.length} exact owner record ${matches.length === 1 ? "match" : "matches"}; relationship not persisted`
                    : " · no exact owner record match"}
                </small>
              </span>
              <span className={styles.inlineActions}>
                {matches.map((candidate) => (
                  <Link className={styles.linkButton} href={candidate.target.route} key={candidate.id}>
                    Open Resource
                  </Link>
                ))}
                <Link className={styles.linkButton} href={resourceOwnerRoute(reference.value)}>
                  Search Resources
                </Link>
                <a className={styles.linkButton} href={reference.value} target="_blank" rel="noreferrer">
                  Open URL
                </a>
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  function renderAssetPanels(asset: MediaAsset, tabsId: string) {
    const relations = relationEntries(asset);
    const readinessChecks = legacyReadinessChecks(asset);
    const supportedReadinessChecks = readinessChecks.filter((check) => check.supported).length;
    const metadataEvidence = metadataEvidenceById.get(asset.id) || buildMediaMetadataEvidence(asset);
    const rightsEvidence = rightsEvidenceById.get(asset.id) || buildMediaRightsEvidence(asset);
    const detailTabs = isLegacyRightsQueue
      ? RIGHTS_TABS
      : ["metadata", "source", "rights", "audit"].includes(activeTab)
        ? METADATA_TABS
        : MEDIA_TABS;
    return (
      <>
        <DetailTabs
          id={tabsId}
          tabs={detailTabs}
          activeTab={activeTab}
          onTabChange={selectTab}
          ariaLabel={`${asset.title} details`}
          className={styles.tabs}
        />

        <DetailTabPanel tabsId={tabsId} tabId="overview" active={activeTab === "overview"}>
          <div className={styles.overviewGrid}>
            <section className={styles.panel} data-wide="true">
              <div className={styles.readOnlyNotice}>
                <strong>Read-only legacy record</strong>
                <span>
                  The existing Personal Records file is preserved through an adapter. No binary, version, or native Media mutation is connected.
                </span>
              </div>
              <div className={styles.factGrid}>
                <div className={styles.fact}>
                  <span>Canonical rights</span>
                  <strong>Needs confirmation</strong>
                </div>
                <div className={styles.fact}>
                  <span>Temporary scope</span>
                  <strong>Internal / review · provisional</strong>
                </div>
                <div className={styles.fact}>
                  <span>Binary</span>
                  <strong>Not connected</strong>
                </div>
                <div className={styles.fact}>
                  <span>Media type</span>
                  <strong>Unknown</strong>
                </div>
              </div>
            </section>

            <section className={styles.panel} data-wide="true">
              <div className={styles.panelHeader}>
                <h2>Legacy description</h2>
                <span className={styles.stateChip}>Authored context only</span>
              </div>
              <p>{summarizeBody(asset.body)}</p>
            </section>

            <section className={styles.panel} data-wide="true">
              <div className={styles.panelHeader}>
                <h2>Source ownership boundary</h2>
                <span className={styles.stateChip} data-tone="blue">Resources owns URLs</span>
              </div>
              <div className={styles.sourceBoundary}>
                <strong>A URL is not a Media binary.</strong>
                <span>
                  Legacy HTTP values remain unresolved Resource candidates. They are never promoted to a raw file, storage key, preview, or download.
                </span>
              </div>
              {renderSourceReferences(asset)}
            </section>

            <section className={styles.panel} data-wide="true">
              <h2>Unavailable mutations</h2>
              <div className={styles.inlineActions}>
                {[
                  ["Edit metadata", "Native Media writes are not connected."],
                  ["Replace", "Replacement and version synchronization are unresolved."],
                  ["Archive", "Legacy file lifecycle cannot be changed from Media."],
                  ["Download", "No verified binary is connected."],
                  ["Confirm rights", "Rights confirmation persistence is not connected."]
                ].map(([label, reason]) => (
                  <button
                    className={styles.button}
                    type="button"
                    aria-disabled="true"
                    aria-describedby={`media-unavailable-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    title={reason}
                    key={label}
                  >
                    {label}
                    <span id={`media-unavailable-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className="sr-only">
                      {reason}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </DetailTabPanel>

        <DetailTabPanel tabsId={tabsId} tabId="preview" active={activeTab === "preview"}>
          <div className={styles.overviewGrid}>
            <section className={styles.panel} data-wide="true">
              <h2>Preview</h2>
              <div className={styles.previewPlaceholder}>
                <div>
                  <strong>No verified binary is connected</strong>
                  <p>URLs remain with Resources and are not rendered as file previews.</p>
                </div>
              </div>
            </section>
          </div>
        </DetailTabPanel>

        <DetailTabPanel tabsId={tabsId} tabId="metadata" active={activeTab === "metadata"}>
          <div className={styles.overviewGrid}>
            <section className={styles.panel} data-wide="true">
              <div className={styles.panelHeader}>
                <div>
                  <h2>Legacy metadata evidence</h2>
                  <p>Literal adapter coverage only; this is not a completion percentage or native metadata record.</p>
                </div>
                <strong>{metadataEvidence.supportedCount} available · {metadataEvidence.candidateCount} candidate · {metadataEvidence.unavailableCount} unavailable</strong>
              </div>
              <EvidenceChecklist
                ariaLabel={`${asset.title} metadata evidence`}
                items={metadataEvidence.fields.map((field) => ({
                  id: field.id,
                  label: field.label,
                  detail: `${field.value}. ${field.detail}`,
                  outcome: field.outcome,
                  outcomeLabel: field.outcomeLabel
                }))}
              />
            </section>
            <section className={styles.panel} data-wide="true">
              <h2>Completion boundary</h2>
              <div className={styles.sourceBoundary}>
                <strong>Evidence can be inspected; metadata cannot be completed here yet.</strong>
                <span>Required-field rules, suggestions, validation, save, audit, and dependent-queue updates need native Media persistence. Dirty input is never simulated in client-only state.</span>
              </div>
              <QuickActionBar
                ariaLabel="Unavailable Media metadata actions"
                actions={[
                  { id: "save-metadata", label: "Save metadata", intent: "primary", disabled: true, disabledReason: "Native Media metadata persistence and validation are not connected." },
                  { id: "auto-fill", label: "Auto-fill suggestions", disabled: true, disabledReason: "No extraction or suggestion service is connected; suggested values never become confirmed silently." },
                  { id: "confirm-source", label: "Confirm source", disabled: true, disabledReason: "Media source and ResourceLink persistence are not connected." },
                  { id: "send-review", label: "Send to review", disabled: true, disabledReason: "AssetReview persistence and metadata completion gates are not connected." }
                ]}
              />
            </section>
          </div>
        </DetailTabPanel>

        <DetailTabPanel tabsId={tabsId} tabId="source" active={activeTab === "source"}>
          <div className={styles.overviewGrid}>
            <section className={styles.panel} data-wide="true">
              <div className={styles.panelHeader}>
                <h2>Source / provenance evidence</h2>
                <span className={styles.stateChip} data-tone="amber">Unresolved</span>
              </div>
              {renderSourceReferences(asset)}
            </section>
          </div>
        </DetailTabPanel>

        <DetailTabPanel tabsId={tabsId} tabId="rights" active={activeTab === "rights"}>
          <div className={styles.overviewGrid}>
            <section className={styles.panel} data-wide="true">
              <div className={styles.panelHeader}>
                <div>
                  <h2>Rights evidence</h2>
                  <p>Canonical state and operating scope are separate; provisional scope never becomes a rights grant silently.</p>
                </div>
                <span className={styles.stateChip} data-tone={rightsEvidence.rightsConfirmed ? "green" : "amber"}>
                  {rightsEvidence.canonicalStateLabel}
                </span>
              </div>
              <div className={styles.factGrid}>
                <div className={styles.fact}><span>Canonical state</span><strong>{rightsEvidence.canonicalStateLabel}</strong></div>
                <div className={styles.fact}><span>Scope state</span><strong>{displayLabel(asset.rights.scopeState)}</strong></div>
                <div className={styles.fact}><span>Operating scope</span><strong>{rightsEvidence.scopeLabel}</strong></div>
                <div className={styles.fact}><span>Confirmed by</span><strong>{asset.rights.confirmedBy || "Not recorded"}</strong></div>
                <div className={styles.fact} data-mono="true"><span>Confirmed at</span><strong>{asset.rights.confirmedAt || "Not recorded"}</strong></div>
                <div className={styles.fact}><span>Public use</span><strong>{asset.rights.publicUseAllowed === null ? "Unverified" : asset.rights.publicUseAllowed ? "Allowed" : "Not allowed"}</strong></div>
                <div className={styles.fact}><span>Commercial use</span><strong>{asset.rights.commercialUseAllowed === null ? "Unverified" : asset.rights.commercialUseAllowed ? "Allowed" : "Not allowed"}</strong></div>
                <div className={styles.fact}><span>Modification</span><strong>{asset.rights.modificationAllowed === null ? "Unverified" : asset.rights.modificationAllowed ? "Allowed" : "Not allowed"}</strong></div>
              </div>
              <div className={styles.sourceBoundary}>
                <strong>Internal / review is provisional operational scope.</strong>
                <span>It is not proof of ownership, license, public use, commercial use, modification rights, or a public-safe decision.</span>
              </div>
            </section>
            <section className={styles.panel} data-wide="true">
              <div className={styles.panelHeader}>
                <h2>Source evidence</h2>
                <span className={styles.stateChip} data-tone={rightsEvidence.sourceState === "native" ? "green" : "blue"}>
                  {rightsEvidence.sourceState === "native" ? "Native source" : rightsEvidence.sourceState === "candidate" ? "Resource candidate" : "Unavailable in adapter"}
                </span>
              </div>
              {renderSourceReferences(asset)}
            </section>
            <section className={styles.panel} data-wide="true">
              <h2>Rights actions unavailable</h2>
              <QuickActionBar
                ariaLabel="Unavailable Media rights actions"
                actions={[
                  { id: "confirm-rights", label: "Confirm rights", intent: "primary", disabled: true, disabledReason: "Native rights evidence, actor identity, confirmation audit, and save validation are not connected." },
                  { id: "set-scope", label: "Set allowed use", disabled: true, disabledReason: "Allowed-use persistence and policy validation are not connected." },
                  { id: "link-license", label: "Link license source", disabled: true, disabledReason: "External license sources remain Resource-owned and Media source-link persistence is not connected." },
                  { id: "public-safe", label: "Mark public-safe", disabled: true, disabledReason: "Public-safe requires explicit verified rights evidence and cannot be inferred from provisional scope." },
                  { id: "send-review", label: "Send to review", disabled: true, disabledReason: "AssetReview persistence and rights completion gates are not connected." }
                ]}
              />
            </section>
          </div>
        </DetailTabPanel>

        <DetailTabPanel tabsId={tabsId} tabId="audit" active={activeTab === "audit"}>
          <div className={styles.overviewGrid}>
            <SystemState
              variant="read_only"
              title="Native Media audit is not connected"
              description="Legacy created and updated timestamps remain visible in Properties. No upload, extraction, suggestion, metadata-save, rights, or review events are invented."
              className={styles.panel}
            />
          </div>
        </DetailTabPanel>

        <DetailTabPanel tabsId={tabsId} tabId="links" active={activeTab === "links"}>
          <div className={styles.overviewGrid}>
            <section className={styles.panel} data-wide="true">
              <h2>Resource candidates</h2>
              {renderSourceReferences(asset)}
            </section>
            <section className={styles.panel} data-wide="true">
              <h2>Retained legacy relation IDs</h2>
              {relations.length ? (
                <ul className={styles.objectList}>
                  {relations.map((relation) => (
                    <li key={`${relation.direction}-${relation.id}`}>
                      <span>{relation.id}</span>
                      <span className={styles.mono}>{displayLabel(relation.direction)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <SystemState
                  variant="empty"
                  compact
                  title="No legacy relation IDs"
                  description="No native AssetLink records have been inferred."
                />
              )}
            </section>
          </div>
        </DetailTabPanel>

        <DetailTabPanel tabsId={tabsId} tabId="usage" active={activeTab === "usage"}>
          <div className={styles.overviewGrid}>
            <section className={styles.panel} data-wide="true">
              <SystemState
                variant="read_only"
                title="Usage registry not connected"
                description="No active usage count, dependency map, replace-everywhere action, or removal action is presented without AssetUsage persistence."
                compact
              />
              <div className={styles.factGrid}>
                <div className={styles.fact}><span>Native AssetUsage</span><strong>Unavailable</strong></div>
                <div className={styles.fact}><span>Legacy context candidates</span><strong>{rightsEvidence.legacyContextCount}</strong></div>
              </div>
              <div className={styles.sourceBoundary}>
                <strong>Legacy project and relation values are context candidates only.</strong>
                <span>They do not prove an active dependency, placement, version, public exposure, or safe-to-remove state.</span>
              </div>
            </section>
          </div>
        </DetailTabPanel>

        <DetailTabPanel tabsId={tabsId} tabId="versions" active={activeTab === "versions"}>
          <div className={styles.overviewGrid}>
            <SystemState
              variant="read_only"
              title="Version and derivative inheritance are not connected"
              description="No MediaVersion, derivative lineage, inherited rights decision, rollback, or usage synchronization is presented from a legacy file record."
              className={styles.panel}
            />
          </div>
        </DetailTabPanel>

        <DetailTabPanel tabsId={tabsId} tabId="review" active={activeTab === "review"}>
          <div className={styles.overviewGrid}>
            <section className={styles.panel} data-wide="true">
              <div className={styles.panelHeader}>
                <div>
                  <h2>Legacy readiness evidence</h2>
                  <p>This is a read-only inventory, not a native AssetReview or readiness score.</p>
                </div>
                <strong>{supportedReadinessChecks} supported · {readinessChecks.length - supportedReadinessChecks} unavailable</strong>
              </div>
              <EvidenceChecklist
                ariaLabel="Legacy Media readiness evidence"
                items={readinessChecks.map((check) => ({
                  id: check.id,
                  label: check.label,
                  detail: check.detail,
                  outcome: check.supported ? "supported" : "unavailable",
                  outcomeLabel: check.supported ? "Evidence available" : "Not connected"
                }))}
              />
            </section>
            <SystemState
              variant="read_only"
              title="Native review completion is unavailable"
              description="AssetReview, accessibility approval, metadata readiness, reviewer identity, waivers, and checklist persistence are not connected. Canonical rights remain Needs confirmation."
              className={styles.panel}
            />
          </div>
        </DetailTabPanel>

        <DetailTabPanel tabsId={tabsId} tabId="properties" active={activeTab === "properties"}>
          <div className={styles.overviewGrid}>
            <section className={styles.panel} data-wide="true">
              <h2>Legacy provenance</h2>
              <div className={styles.factGrid}>
                {[
                  ["Record ID", asset.provenance.recordId, true],
                  ["Domain", asset.provenance.domain, true],
                  ["Class", asset.provenance.className, true],
                  ["Legacy status", displayLabel(asset.provenance.status), false],
                  ["Processing stage", displayLabel(asset.provenance.stage), false],
                  ["Privacy", displayLabel(asset.provenance.privacy), false],
                  ["Created", formatDate(asset.createdAt), true],
                  ["Updated", formatDate(asset.updatedAt), true]
                ].map(([label, value, mono]) => (
                  <div className={styles.fact} data-mono={mono || undefined} key={String(label)}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className={styles.panel} data-wide="true">
              <h2>Technical metadata</h2>
              <div className={styles.sourceBoundary}>
                Filename, MIME type, size, checksum, dimensions, duration, page count, storage key, current version, and derivatives are all unavailable. No placeholder values are displayed as facts.
              </div>
            </section>
            {asset.provenance.nonUrlExternalReferences.length > 0 && (
              <section className={styles.panel} data-wide="true">
                <h2>Non-URL legacy references</h2>
                <ul className={styles.sourceList}>
                  {asset.provenance.nonUrlExternalReferences.map((reference) => (
                    <li key={reference}>
                      <span>{reference}</span>
                      <span>Retained, unresolved</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </DetailTabPanel>
      </>
    );
  }

  function renderLegacyReadinessInspector(asset: MediaAsset, tabsId: string) {
    const checks = legacyReadinessChecks(asset);
    const supported = checks.filter((check) => check.supported).length;
    const canonicalDetail = `${getNativeObjectRoute(asset.nativeRef)}?tab=${encodeURIComponent(activeTab)}`;

    return (
      <>
        <DetailTabs
          id={tabsId}
          tabs={MEDIA_TABS}
          activeTab={activeTab}
          onTabChange={selectTab}
          ariaLabel={`${asset.title} legacy readiness details`}
          className={styles.tabs}
        />

        <DetailTabPanel tabsId={tabsId} tabId="review" active={activeTab === "review"}>
          <div className={styles.overviewGrid}>
            <section className={styles.panel} data-wide="true">
              <div className={styles.readinessHeader}>
                <div>
                  <span className={styles.eyebrow}>Legacy readiness evidence</span>
                  <h2>Read-only triage</h2>
                </div>
                <span className={styles.stateChip} data-tone="amber">Not a native AssetReview</span>
              </div>
              <p>
                {supported} of {checks.length} evidence checks are supported by the current adapter. This is an evidence inventory, not a readiness score.
              </p>
            </section>

            <section className={styles.panel} data-wide="true">
              <div className={styles.panelHeader}>
                <h2>Evidence checklist</h2>
                <strong className={styles.mono}>{supported} supported · {checks.length - supported} unavailable</strong>
              </div>
              <EvidenceChecklist
                ariaLabel="Selected Media readiness evidence"
                items={checks.map((check) => ({
                  id: check.id,
                  label: check.label,
                  detail: check.detail,
                  outcome: check.supported ? "supported" : "unavailable",
                  outcomeLabel: check.supported ? "Evidence available" : "Not connected"
                }))}
              />
            </section>

            <section className={styles.panel} data-wide="true">
              <h2>Unavailable mutations</h2>
              <QuickActionBar
                ariaLabel="Unavailable Media readiness actions"
                actions={[
                  { id: "save-metadata", label: "Save metadata", disabled: true, disabledReason: "Native Media metadata persistence is not connected." },
                  { id: "confirm-rights", label: "Confirm rights", disabled: true, disabledReason: "Rights evidence and confirmation audit are not connected." },
                  { id: "link-source", label: "Link source", disabled: true, disabledReason: "Media source and ResourceLink persistence are not connected." },
                  { id: "mark-reviewed", label: "Mark reviewed", disabled: true, disabledReason: "This queue is legacy readiness triage, not a native AssetReview workflow." }
                ]}
              />
            </section>

            <section className={styles.panel} data-wide="true">
              <h2>Ownership boundary</h2>
              <div className={styles.sourceBoundary}>
                <strong>Media still owns the future binary and asset identity.</strong>
                <span>URLs remain unresolved Resource candidates. Retained relation IDs remain untyped provenance. No source, link, review, or binary object is created by this queue.</span>
              </div>
            </section>
          </div>
        </DetailTabPanel>

        {activeTab !== "review" && (
          <DetailTabPanel tabsId={tabsId} tabId={activeTab} active>
            <div className={styles.overviewGrid}>
              <section className={styles.panel} data-wide="true">
                <SystemState
                  variant="read_only"
                  title={`${MEDIA_TABS.find((tab) => tab.id === activeTab)?.label || "Detail"} remains on the canonical asset view`}
                  description="The readiness queue keeps its inspector focused on evidence gaps. Open the canonical detail without losing the legacy record or inventing queue-specific data."
                  compact
                />
                <Link className={styles.linkButton} href={canonicalDetail}>Open canonical detail</Link>
              </section>
            </div>
          </DetailTabPanel>
        )}
      </>
    );
  }

  function renderAssetHeader(asset: MediaAsset, detail = false) {
    const rightsEvidence = rightsEvidenceById.get(asset.id) || buildMediaRightsEvidence(asset);
    const requestedReturnTo = searchParams.get("returnTo") || "";
    const safeReturnTo = (
      requestedReturnTo === "/admin/media" ||
      requestedReturnTo.startsWith("/admin/media?") ||
      requestedReturnTo.startsWith("/admin/media/")
    )
      ? requestedReturnTo
      : `${getModuleRoute("media")}?selected=${encodeURIComponent(asset.id)}`;
    return (
      <ObjectHeader
        objectType="Media asset"
        title={asset.title}
        subtitle={`Legacy file record · Updated ${formatDate(asset.updatedAt)}`}
        identity="M"
        states={
          <>
            <span className={styles.stateChip} data-tone={rightsEvidence.rightsConfirmed ? "green" : "amber"}>
              Rights · {rightsEvidence.canonicalStateLabel}
            </span>
            <span className={styles.stateChip}>{rightsEvidence.scopeLabel}</span>
            <span className={styles.stateChip}>Read-only</span>
          </>
        }
        actions={
          <>
            {detail ? (
              <Link className={styles.linkButton} href={safeReturnTo}>
                Back to directory
              </Link>
            ) : (
              <Link className={styles.linkButton} href={getNativeObjectRoute(asset.nativeRef)}>
                Open detail
              </Link>
            )}
            <button
              className={styles.button}
              type="button"
              aria-disabled="true"
              aria-describedby={`media-edit-${asset.id}-reason`}
              title="Native Media writes are not connected."
            >
              Edit
              <span id={`media-edit-${asset.id}-reason`} className="sr-only">
                Native Media writes are not connected.
              </span>
            </button>
          </>
        }
        metadata={
          <div className={styles.technicalRow}>
            {asset.source.resourceReferences.length} unresolved Resource candidate{asset.source.resourceReferences.length === 1 ? "" : "s"} · Binary unavailable · Type unknown
          </div>
        }
      />
    );
  }

  const sidebar = (
    <ModuleSidebar
      id="media-module-sidebar"
      title="Media"
      description="Binary assets, provenance, rights, versions, and usage."
      sections={sidebarSections}
      mobileOpen={mobileSidebarOpen}
      onClose={() => setMobileSidebarOpen(false)}
      className={styles.sidebar}
      footer={
        <p className={styles.sidebarFootnote}>
          Legacy file records are read-only. URLs remain unresolved Resource candidates.
        </p>
      }
    />
  );

  const inspector = initialMode === "index" ? (
    <InspectorRail
      id="media-inspector-rail"
      readOnly
      overlay={isInspectorOverlay}
      overlayOpen={!isInspectorOverlay || inspectorOpen}
      onRequestClose={() => setInspectorOpen(false)}
      ariaLabel={selectedAsset ? `${selectedAsset.title} inspector` : "Media asset inspector"}
      title={selectedAsset ? <div className={styles.inspectorHeader}>{renderAssetHeader(selectedAsset)}</div> : undefined}
      actions={isInspectorOverlay ? (
        <button className={styles.button} type="button" onClick={() => setInspectorOpen(false)}>
          Close
        </button>
      ) : undefined}
    >
      {selectedAsset ? (
        isLegacyReadinessQueue
          ? renderLegacyReadinessInspector(selectedAsset, `media-readiness-${selectedAsset.id}`)
          : renderAssetPanels(selectedAsset, `media-inspector-${selectedAsset.id}`)
      ) : (
        <div className={styles.emptyInspector}>
          <h2>No asset selected</h2>
          <p>Select a row body to inspect its retained legacy record.</p>
        </div>
      )}
    </InspectorRail>
  ) : (
    <InspectorRail
      id="media-inspector-rail"
      readOnly
      overlay={isInspectorOverlay}
      overlayOpen={!isInspectorOverlay || inspectorOpen}
      onRequestClose={() => setInspectorOpen(false)}
      ariaLabel="Media migration boundary"
      actions={isInspectorOverlay ? (
        <button className={styles.button} type="button" onClick={() => setInspectorOpen(false)}>
          Close
        </button>
      ) : undefined}
      title={
        <div className={styles.inspectorHeader}>
          <ObjectHeader
            objectType="System boundary"
            title="Legacy adapter"
            subtitle={selectedAsset?.title || "Media asset"}
            identity="M"
            states={<span className={styles.stateChip}>Read-only</span>}
          />
        </div>
      }
    >
      <div className={styles.readOnlyNotice}>
        <strong>Native persistence is unresolved</strong>
        <span>
          This route reads the existing Personal Records file and preserves its provenance. It does not create a duplicate Media object.
        </span>
      </div>
      {selectedAsset && (
        <section className={styles.panel}>
          <h2>Adapter record</h2>
          <div className={styles.factGrid}>
            <div className={styles.fact} data-mono="true"><span>ID</span><strong>{selectedAsset.id}</strong></div>
            <div className={styles.fact} data-mono="true"><span>Domain</span><strong>{selectedAsset.provenance.domain}</strong></div>
            <div className={styles.fact}><span>Rights</span><strong>Needs confirmation</strong></div>
            <div className={styles.fact}><span>Binary</span><strong>Not connected</strong></div>
          </div>
        </section>
      )}
    </InspectorRail>
  );

  const aiDock = mobileSidebarOpen || (isInspectorOverlay && inspectorOpen) ? null : (
    <SharedAIDock
      open={aiOpen}
      onOpenChange={(next) => {
        setAiOpen(next);
        updateUrl({ ai: next });
      }}
      context={{
        module: "media",
        object: selectedAsset?.nativeRef,
        activeTab,
        visibleScope: initialMode === "detail" ? "Asset detail" : VIEW_LABELS[view]
      }}
    />
  );

  if (initialMode === "detail") {
    return (
      <ModuleShell
        module="media"
        sidebar={sidebar}
        inspector={inspector}
        aiDock={aiDock}
        mode="detail"
        ariaLabel="Media asset detail"
        className={`${styles.shell} ${styles.detailShell}`}
      >
        <button
          className={`${styles.button} ${styles.mobileMenuButton}`}
          type="button"
          onClick={() => { dismissAiForOverlay(); setInspectorOpen(false); setMobileSidebarOpen(true); }}
          aria-label="Open Media navigation"
          aria-expanded={mobileSidebarOpen}
          aria-controls="media-module-sidebar"
        >
          Menu
        </button>
        <button
          className={`${styles.button} ${styles.mobileInspectorButton}`}
          type="button"
          onClick={() => { dismissAiForOverlay(); setMobileSidebarOpen(false); setInspectorOpen(true); }}
          aria-label="Open migration context"
          aria-expanded={inspectorOpen}
          aria-controls="media-inspector-rail"
        >
          Context
        </button>
        {(mobileSidebarOpen || (isInspectorOverlay && inspectorOpen)) && (
          <button
            type="button"
            className={styles.scrim}
            aria-label="Close open panel"
            onClick={() => {
              setMobileSidebarOpen(false);
              setInspectorOpen(false);
            }}
          />
        )}
        <div className={styles.mainScroll}>
          {initialLoadError ? (
            <SystemState
              variant="error"
              title="Unable to load Media"
              description={initialLoadError}
              action={{ label: "Retry", onSelect: () => router.refresh() }}
            />
          ) : selectedAsset ? (
            <>
              {renderAssetHeader(selectedAsset, true)}
              {renderAssetPanels(selectedAsset, `media-detail-${selectedAsset.id}`)}
            </>
          ) : (
            <SystemState variant="empty" title="Media asset not found" />
          )}
        </div>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell
      module="media"
      sidebar={sidebar}
      inspector={inspector}
      aiDock={aiDock}
      mode="directory"
      ariaLabel="Media directory"
      className={styles.shell}
    >
      <button
        className={`${styles.button} ${styles.mobileMenuButton}`}
        type="button"
        onClick={() => { dismissAiForOverlay(); setInspectorOpen(false); setMobileSidebarOpen(true); }}
        aria-label="Open Media navigation"
        aria-expanded={mobileSidebarOpen}
        aria-controls="media-module-sidebar"
      >
        Menu
      </button>
      {selectedAsset && (
        <button
          className={`${styles.button} ${styles.mobileInspectorButton}`}
          type="button"
          onClick={() => { dismissAiForOverlay(); setMobileSidebarOpen(false); setInspectorOpen(true); }}
          aria-label={`Inspect ${selectedAsset.title}`}
          aria-expanded={inspectorOpen}
          aria-controls="media-inspector-rail"
        >
          Details
        </button>
      )}
      {(mobileSidebarOpen || (isInspectorOverlay && inspectorOpen)) && (
        <button
          type="button"
          className={styles.scrim}
          aria-label="Close open panel"
          onClick={() => {
            setMobileSidebarOpen(false);
            setInspectorOpen(false);
          }}
        />
      )}

      <DirectoryPane className={styles.directory} ariaLabel="Media asset directory">
        <div className={styles.mainScroll}>
          <header className={styles.directoryHeader}>
            <div>
              <span className={styles.eyebrow}>Media</span>
              <h1>{VIEW_LABELS[view]}</h1>
              <p>
                {isLegacyReadinessQueue
                  ? `${visibleAssets.length} shown · ${readinessScope.length} matching query · legacy readiness triage`
                  : isLegacyMetadataQueue
                    ? `${visibleAssets.length} shown · ${readinessScope.length} matching query · legacy metadata evidence`
                    : isLegacyRightsQueue
                      ? `${visibleAssets.length} shown · confirm source, scope, and rights evidence before broader use`
                  : `${initialAssets.length} retained legacy file record${initialAssets.length === 1 ? "" : "s"}`}
              </p>
            </div>
            {isLegacyEvidenceQueue ? (
              <QuickActionBar
                ariaLabel={isLegacyMetadataQueue
                  ? "Media metadata evidence actions"
                  : isLegacyRightsQueue
                    ? "Media rights and usage evidence actions"
                    : "Media readiness queue actions"}
                actions={isLegacyMetadataQueue
                  ? [
                      { id: "metadata-filter", label: "Filter", disabled: true, disabledReason: "The implemented issue segments below are the available filters; an advanced filter drawer is not connected." },
                      { id: "metadata-batch", label: "Batch complete", disabled: true, disabledReason: "Required-field validation and native metadata persistence are not connected." },
                      { id: "metadata-autofill", label: "Auto-fill suggestions", disabled: true, disabledReason: "No extraction or suggestion service is connected; AI never confirms fields silently." },
                      { id: "metadata-upload", label: "Choose files", href: getModuleViewRoute("media", "upload-queue"), intent: "primary" }
                    ]
                  : isLegacyRightsQueue
                    ? [
                        { id: "rights-resources", label: "Open Resources", href: getModuleRoute("resources"), intent: "primary" },
                        { id: "rights-confirm", label: "Confirm rights", disabled: true, disabledReason: "Native rights evidence, actor identity, validation, and audit persistence are not connected." },
                        { id: "rights-batch", label: "Batch update", disabled: true, disabledReason: "Rights are evidence-sensitive and no audited bulk mutation path is connected." },
                        { id: "rights-export", label: "Export", disabled: true, disabledReason: "A rights export contract and stable native fields are not connected." }
                      ]
                  : [
                      { id: "readiness-filter", label: "Filter", disabled: true, disabledReason: "The implemented issue segments below are the available filters; an advanced filter drawer is not connected." },
                      { id: "readiness-batch", label: "Batch review", disabled: true, disabledReason: "Native AssetReview persistence is not connected." },
                      { id: "readiness-assign", label: "Assign", disabled: true, disabledReason: "Native Media owner assignment is not connected." },
                      { id: "readiness-upload", label: "Choose files", href: getModuleViewRoute("media", "upload-queue"), intent: "primary" }
                    ]}
              />
            ) : (
              <div className={styles.headerActions}>
                <Link className={styles.button} data-primary="true" href={getModuleViewRoute("media", "upload-queue")}>
                  Choose files
                </Link>
                <button
                  className={styles.button}
                  type="button"
                  aria-disabled="true"
                  aria-describedby="media-more-actions-reason"
                  title="No additional connected Media actions."
                >
                  …
                  <span id="media-more-actions-reason" className="sr-only">No additional connected Media actions.</span>
                </button>
              </div>
            )}
          </header>

          {isLegacyEvidenceQueue && (
            <div
              className={styles.metricGrid}
              aria-label={isLegacyMetadataQueue
                ? "Legacy Media metadata evidence"
                : isLegacyRightsQueue
                  ? "Legacy Media rights and usage evidence"
                  : "Legacy Media readiness evidence"}
            >
              {(isLegacyMetadataQueue ? metadataMetrics : isLegacyRightsQueue ? rightsMetrics : readinessMetrics).map((metric) => (
                <div
                  className={styles.metricTile}
                  aria-label={`${metric.label}: ${metric.value} (${metric.note})`}
                  data-media-metric={metric.id}
                  key={metric.id}
                >
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <small>{metric.note}</small>
                </div>
              ))}
            </div>
          )}

          <label className={styles.search}>
            <span aria-hidden="true">/</span>
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => {
                const next = event.target.value;
                const partial: Partial<MediaUrlState> = { query: next };

                if (initialMode === "index") {
                  const nextVisibleAssets = assetsVisibleFor(next, effectiveIssue);
                  const nextSelectedId = nextVisibleAssets.some((asset) => asset.id === selectedId)
                    ? selectedId
                    : nextVisibleAssets[0]?.id || "";
                  setSelectedId(nextSelectedId);
                  partial.selected = nextSelectedId;
                }

                setQuery(next);
                updateUrl(partial);
              }}
              placeholder={isLegacyReadinessQueue
                ? "Search readiness queue, titles, legacy IDs, or source candidates"
                : isLegacyMetadataQueue
                  ? "Search titles, source candidates, projects, issues, or legacy IDs"
                  : isLegacyRightsQueue
                    ? "Search assets, legacy IDs, source candidates, projects, or context"
                  : "Search titles, descriptions, projects, or source candidates"}
              aria-label="Search Media"
            />
            <kbd>{isLegacyEvidenceQueue ? "evidence" : "media"}</kbd>
          </label>

          {isLegacyEvidenceQueue ? (
            <div
              className={styles.chipRow}
              aria-label={isLegacyMetadataQueue
                ? "Legacy metadata issue segments"
                : isLegacyRightsQueue
                  ? "Legacy rights and usage evidence segments"
                  : "Legacy readiness issue segments"}
            >
              {(isLegacyMetadataQueue
                ? METADATA_ISSUE_SEGMENTS
                : isLegacyRightsQueue
                  ? RIGHTS_ISSUE_SEGMENTS
                  : REVIEW_ISSUE_SEGMENTS).map((segment) => {
                const count = readinessScope.filter((asset) =>
                  isLegacyMetadataQueue
                    ? matchesMediaMetadataIssue(asset, segment.id as MediaMetadataIssue)
                    : isLegacyRightsQueue
                      ? matchesMediaRightsIssue(asset, segment.id as MediaRightsIssue)
                    : matchesIssue(asset, segment.id as MediaIssue)
                ).length;
                return (
                  <button
                    className={styles.chip}
                    data-active={effectiveIssue === segment.id || undefined}
                    data-tone={segment.tone}
                    type="button"
                    onClick={() => selectIssue(segment.id as MediaIssue)}
                    aria-pressed={effectiveIssue === segment.id}
                    key={segment.id}
                  >
                    {segment.label} · {count}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className={styles.chipRow} aria-label="Media views">
              {(["all", "recent", "pinned", "needs-review", "in-use", "archived"] as const).map((itemView) => (
                <button
                  className={styles.chip}
                  data-active={view === itemView || undefined}
                  data-tone={itemView === "needs-review" ? "amber" : itemView === "in-use" ? "green" : "blue"}
                  type="button"
                  onClick={() => selectView(itemView)}
                  key={itemView}
                >
                  {VIEW_LABELS[itemView]}
                </button>
              ))}
            </div>
          )}

          <div className={styles.readOnlyNotice}>
            <strong>
              {isLegacyReadinessQueue
                ? "Legacy readiness triage · Read-only"
                : isLegacyMetadataQueue
                  ? "Legacy metadata evidence · Read-only"
                  : isLegacyRightsQueue
                    ? "Rights / Usage evidence · Read-only"
                  : "Migration-safe read path"}
            </strong>
            <span>
              {isLegacyReadinessQueue
                ? "This queue organizes only evidence gaps exposed by the legacy adapter. It does not create AssetReview records, infer binaries, or claim duplicate, usage, or AI state."
                : isLegacyMetadataQueue
                  ? "This queue distinguishes available, candidate, and unavailable adapter evidence. A field unavailable in the legacy adapter is an evidence gap; this does not claim the original asset objectively lacks a field, compute a completion score, or simulate a save."
                  : isLegacyRightsQueue
                    ? "Canonical rights remain separate from provisional operating scope. Resource-owned URL candidates can be inspected, while native usage, version inheritance, audit, expiry, license, public-safe, and restriction decisions remain explicitly unavailable."
                  : <>Only legacy records with class <span className={styles.mono}>file</span> appear here. Technical metadata and native workflow state remain explicitly unknown.</>}
            </span>
          </div>

          <div className={styles.sortRow}>
            <label className={styles.field}>
              Sort
              <select
                value={sort}
                onChange={(event) => {
                  const next = event.target.value as MediaSort;
                  setSort(next);
                  updateUrl({ sort: next });
                }}
              >
                {(Object.keys(SORT_LABELS) as MediaSort[]).map((sortValue) => (
                  <option
                    value={sortValue}
                    disabled={Boolean(sortUnavailable(sortValue))}
                    key={sortValue}
                  >
                    {SORT_LABELS[sortValue]}
                  </option>
                ))}
              </select>
            </label>
            <span>View · <strong>Compact rows</strong></span>
            <button
              className={styles.button}
              type="button"
              aria-disabled={visibleAssets.length === 0 || undefined}
              aria-describedby={visibleAssets.length === 0 ? "media-select-visible-reason" : undefined}
              title={visibleAssets.length === 0 ? "No visible rows to select." : undefined}
              onClick={() => {
                if (visibleAssets.length > 0) selectVisible();
              }}
            >
              {visibleAssets.length > 0 && visibleAssets.every((asset) => batchSelection.has(asset.id))
                ? "Clear visible"
                : "Select visible"}
              {visibleAssets.length === 0 && (
                <span id="media-select-visible-reason" className="sr-only">No visible rows to select.</span>
              )}
            </button>
          </div>

          {batchSelection.size > 0 && (
            <div className={styles.batchBar} role="toolbar" aria-label="Selected Media actions">
              <strong>{batchSelection.size} selected</strong>
              <button className={styles.button} type="button" onClick={() => setBatchSelection(new Set())}>Clear</button>
              {[
                [
                  "link",
                  isLegacyRightsQueue ? "Link source unavailable" : "Link",
                  isLegacyRightsQueue
                    ? "External source identity remains Resource-owned and Media source-link persistence is not connected."
                    : "Native AssetLink writes are not connected."
                ],
                [
                  "review",
                  isLegacyReadinessQueue
                    ? "Review unavailable"
                    : isLegacyMetadataQueue
                      ? "Mark complete unavailable"
                      : isLegacyRightsQueue
                        ? "Confirm rights unavailable"
                      : "Review",
                  isLegacyRightsQueue
                    ? "Native rights evidence, actor identity, validation, and audit persistence are not connected."
                    : isLegacyMetadataQueue
                    ? "Required-field validation, metadata persistence, and dependent-queue updates are not connected."
                    : "AssetReview persistence is not connected."
                ],
                [
                  "archive",
                  isLegacyRightsQueue ? "Export unavailable" : "Archive",
                  isLegacyRightsQueue
                    ? "A rights export contract and stable native fields are not connected."
                    : "Media archive persistence is not connected."
                ]
              ].map(([id, label, reason]) => (
                <button
                  className={styles.button}
                  type="button"
                  aria-disabled="true"
                  aria-describedby={`media-batch-${id}-reason`}
                  title={reason}
                  key={id}
                >
                  {label}
                  <span id={`media-batch-${id}-reason`} className="sr-only">{reason}</span>
                </button>
              ))}
            </div>
          )}

          {unavailableSortReason && (
            <div className={styles.errorBanner} role="status">
              {unavailableSortReason} Rows use the existing date ordering until this capability is connected.
            </div>
          )}

          {initialLoadError ? (
            <SystemState
              variant="error"
              title="Unable to load Media"
              description={initialLoadError}
              action={{ label: "Retry", onSelect: () => router.refresh() }}
            />
          ) : unavailableViewReason ? (
            <SystemState
              variant="read_only"
              title={`${VIEW_LABELS[view]} is not connected`}
              description={unavailableViewReason}
              action={{ label: "Return to All Media", onSelect: () => selectView("all") }}
            />
          ) : isLegacyRightsQueue ? (
            rightsGroups.length ? (
              <div className={styles.queueGroups} aria-label="Legacy Media rights and usage evidence groups">
                {rightsGroups.map((group) => (
                  <section className={styles.queueGroup} aria-labelledby={`media-rights-${group.id}`} key={group.id}>
                    <header className={styles.queueGroupHeader}>
                      <div>
                        <h2 id={`media-rights-${group.id}`}>{group.label}</h2>
                        <p>{group.description}</p>
                      </div>
                      <strong>{group.assets.length}</strong>
                    </header>
                    <div className={styles.list} data-density="compact" role="list">
                      {group.assets.map((asset) => {
                        const evidence = rightsEvidenceById.get(asset.id) || buildMediaRightsEvidence(asset);
                        return (
                          <DenseObjectRow
                            id={asset.id}
                            title={asset.title}
                            description={`${evidence.canonicalStateLabel} · ${evidence.scopeLabel}`}
                            metadata={`Legacy ID ${asset.id} · updated ${formatDate(asset.updatedAt)}`}
                            trailing={
                              <>
                                <strong>{evidence.sourceCandidateCount
                                  ? `${evidence.sourceCandidateCount} Resource candidate${evidence.sourceCandidateCount === 1 ? "" : "s"}`
                                  : "Source evidence unavailable"}</strong>
                                <span>Native usage unavailable</span>
                              </>
                            }
                            selected={asset.id === selectedId}
                            onSelect={() => selectAsset(asset)}
                            checkbox={{
                              checked: batchSelection.has(asset.id),
                              onCheckedChange: (checked) => setChecked(asset.id, checked),
                              label: `Select ${asset.title} for batch actions`
                            }}
                            key={asset.id}
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
                title={initialAssets.length === 0
                  ? "No legacy Media records are available for rights evidence"
                  : "No assets match this rights evidence segment"}
                description={initialAssets.length === 0
                  ? "No Personal Records items with class file are available. The Rights / Usage workflow remains read-only and creates nothing."
                  : "Change the query or evidence segment. No rights, usage, source, or audit state was changed."}
                action={initialAssets.length === 0
                  ? undefined
                  : { label: "Show all evidence", onSelect: () => selectIssue("all") }}
              />
            )
          ) : isLegacyReadinessQueue ? (
            readinessGroups.length ? (
              <div className={styles.queueGroups} aria-label="Legacy Media readiness groups">
                {readinessGroups.map((group) => (
                  <section className={styles.queueGroup} aria-labelledby={`media-readiness-${group.id}`} key={group.id}>
                    <header className={styles.queueGroupHeader}>
                      <div>
                        <h2 id={`media-readiness-${group.id}`}>{group.label}</h2>
                        <p>{group.description}</p>
                      </div>
                      <strong>{group.assets.length}</strong>
                    </header>
                    <div className={styles.list} data-density="compact" role="list">
                      {group.assets.map((asset) => {
                        const checks = legacyReadinessChecks(asset);
                        const supported = checks.filter((check) => check.supported).length;
                        return (
                          <DenseObjectRow
                            id={asset.id}
                            title={asset.title}
                            description={asset.source.resourceReferences.length
                              ? `${asset.source.resourceReferences.length} unresolved Resource candidate${asset.source.resourceReferences.length === 1 ? "" : "s"} · rights need confirmation`
                              : "No accepted Resource candidate · rights need confirmation"}
                            metadata={`Legacy ID ${asset.id} · ${relationEntries(asset).length} untyped relation entr${relationEntries(asset).length === 1 ? "y" : "ies"}`}
                            trailing={
                              <>
                                <strong>{supported}/{checks.length} evidence</strong>
                                <span>Binary unavailable</span>
                              </>
                            }
                            selected={asset.id === selectedId}
                            onSelect={() => selectAsset(asset)}
                            checkbox={{
                              checked: batchSelection.has(asset.id),
                              onCheckedChange: (checked) => setChecked(asset.id, checked),
                              label: `Select ${asset.title} for batch actions`
                            }}
                            key={asset.id}
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
                title="No legacy records match this readiness segment"
                description="Change the query or issue segment. No workflow state was changed."
                action={{ label: "Show all issues", onSelect: () => selectIssue("all") }}
              />
            )
          ) : isLegacyMetadataQueue ? (
            metadataGroups.length ? (
              <div className={styles.queueGroups} aria-label="Legacy Media metadata evidence groups">
                {metadataGroups.map((group) => (
                  <section className={styles.queueGroup} aria-labelledby={`media-metadata-${group.id}`} key={group.id}>
                    <header className={styles.queueGroupHeader}>
                      <div>
                        <h2 id={`media-metadata-${group.id}`}>{group.label}</h2>
                        <p>{group.description}</p>
                      </div>
                      <strong>{group.assets.length}</strong>
                    </header>
                    <div className={styles.list} data-density="compact" role="list">
                      {group.assets.map((asset) => {
                        const evidence = metadataEvidenceById.get(asset.id) || buildMediaMetadataEvidence(asset);
                        return (
                          <DenseObjectRow
                            id={asset.id}
                            title={asset.title}
                            description={asset.source.resourceReferences.length
                              ? `${asset.source.resourceReferences.length} unresolved Resource candidate${asset.source.resourceReferences.length === 1 ? "" : "s"} · title retained, filename not inferred`
                              : "No accepted Resource candidate · title retained, filename not inferred"}
                            metadata={`Legacy ID ${asset.id} · updated ${formatDate(asset.updatedAt)}`}
                            trailing={
                              <>
                                <strong>{evidence.supportedCount} available · {evidence.candidateCount} candidate</strong>
                                <span>{evidence.unavailableCount} unavailable in adapter</span>
                              </>
                            }
                            selected={asset.id === selectedId}
                            onSelect={() => selectAsset(asset)}
                            checkbox={{
                              checked: batchSelection.has(asset.id),
                              onCheckedChange: (checked) => setChecked(asset.id, checked),
                              label: `Select ${asset.title} for batch actions`
                            }}
                            key={asset.id}
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
                title="No legacy records match this metadata evidence segment"
                description="Change the query or evidence segment. No metadata or workflow state was changed."
                action={{ label: "Show all evidence", onSelect: () => selectIssue("all") }}
              />
            )
          ) : visibleAssets.length === 0 ? (
            <SystemState
              variant="empty"
              title={query ? "No media matches this search" : "No legacy Media records"}
              description={
                query
                  ? "Try a different title, description, project, or URL fragment."
                  : "No Personal Records items with class file are available."
              }
            />
          ) : (
            <div className={styles.list} data-density="compact" role="list" aria-label="Media assets">
              {visibleAssets.map((asset) => (
                <DenseObjectRow
                  id={asset.id}
                  title={asset.title}
                  description={summarizeBody(asset.body)}
                  metadata={`ID ${asset.id} · ${asset.source.resourceReferences.length} unresolved Resource candidate${asset.source.resourceReferences.length === 1 ? "" : "s"}`}
                  trailing={
                    <>
                      <span>{formatDate(asset.updatedAt)}</span>
                      <span>Rights · Needs confirmation</span>
                    </>
                  }
                  selected={asset.id === selectedId}
                  onSelect={() => selectAsset(asset)}
                  checkbox={{
                    checked: batchSelection.has(asset.id),
                    onCheckedChange: (checked) => setChecked(asset.id, checked),
                    label: `Select ${asset.title} for batch actions`
                  }}
                  key={asset.id}
                />
              ))}
            </div>
          )}
        </div>
      </DirectoryPane>
    </ModuleShell>
  );
}
