"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import DirectoryPane from "../admin-shell/DirectoryPane";
import InspectorRail from "../admin-shell/InspectorRail";
import ModuleShell from "../admin-shell/ModuleShell";
import ModuleSidebar, { type ModuleSidebarSection } from "../admin-shell/ModuleSidebar";
import SharedAIDock from "../admin-shell/SharedAIDock";
import DenseObjectRow from "../operational/DenseObjectRow";
import DetailTabs, { DetailTabPanel, type DetailTab } from "../operational/DetailTabs";
import MetricStrip from "../operational/MetricStrip";
import ObjectHeader from "../operational/ObjectHeader";
import QuickActionBar from "../operational/QuickActionBar";
import SystemState from "../operational/SystemState";
import {
  buildMediaDuplicateEvidence,
  type MediaDuplicateEvidenceGroup,
  type MediaDuplicateEvidenceMember
} from "../../lib/modules/media/duplicate-evidence";
import type { MediaAsset } from "../../lib/modules/media/types";
import {
  parseMediaDuplicatesUrlState,
  serializeMediaDuplicatesUrlState,
  type MediaDuplicateFilter,
  type MediaDuplicateSort,
  type MediaDuplicateTab
} from "../../lib/native-objects/url-state";
import {
  getModuleRoute,
  getModuleViewRoute,
  getNativeObjectRoute
} from "../../lib/native-objects/routes";
import baseStyles from "../content-graph/ContentGraphWorkspace.module.css";
import styles from "./MediaDuplicatesWorkspace.module.css";

type MediaDuplicatesWorkspaceProps = {
  initialAssets: MediaAsset[];
  initialLoadError?: string;
};

const DUPLICATE_TABS: readonly DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "compare", label: "Compare" },
  { id: "metadata", label: "Metadata" },
  { id: "links", label: "Links" },
  { id: "rights", label: "Rights" },
  { id: "audit", label: "Audit" }
];

const FILTERS: ReadonlyArray<{
  id: MediaDuplicateFilter;
  label: string;
  tone: "blue" | "green" | "amber";
}> = [
  { id: "all", label: "All evidence", tone: "blue" },
  { id: "same-title", label: "Same retained title", tone: "green" },
  { id: "rights-unresolved", label: "Rights unresolved", tone: "amber" }
];

const SORT_LABELS: Readonly<Record<MediaDuplicateSort, string>> = {
  "evidence-desc": "Evidence — strongest first",
  "updated-desc": "Updated — newest first",
  title: "Title — A–Z"
};

const RESOLUTION_REASON =
  "No native DuplicateCase writer, binary identity, consequence preview, rights gate, rollback path, or per-case audit writer is connected.";

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

function formatDate(value: string, fallback = "Not recorded") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function summarizeBody(value: string) {
  return value.trim().replace(/\s+/g, " ") || "No legacy description is stored.";
}

function sourceDomain(matchKey: string) {
  try {
    return new URL(matchKey).hostname;
  } catch {
    return "Accepted HTTP(S) source";
  }
}

function uniqueParticipants(groups: readonly MediaDuplicateEvidenceGroup[]) {
  return new Set(groups.flatMap((group) => group.members.map((member) => member.asset.id))).size;
}

function sortGroups(groups: readonly MediaDuplicateEvidenceGroup[], sort: MediaDuplicateSort) {
  return [...groups].sort((left, right) => {
    if (sort === "updated-desc") {
      return right.latestUpdatedAt.localeCompare(left.latestUpdatedAt) || left.id.localeCompare(right.id);
    }
    if (sort === "title") {
      const leftTitle = left.members[0]?.asset.title || left.signal.matchKey;
      const rightTitle = right.members[0]?.asset.title || right.signal.matchKey;
      return leftTitle.localeCompare(rightTitle, undefined, { sensitivity: "base" }) || left.id.localeCompare(right.id);
    }
    return right.participantCount - left.participantCount ||
      Number(right.sameRetainedTitle) - Number(left.sameRetainedTitle) ||
      left.id.localeCompare(right.id);
  });
}

function matchesGroupQuery(group: MediaDuplicateEvidenceGroup, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [
    group.id,
    group.signal.matchKey,
    sourceDomain(group.signal.matchKey),
    ...group.members.flatMap((member) => [
      member.asset.id,
      member.asset.title,
      member.asset.body,
      ...member.references.map((reference) => reference.value)
    ])
  ].some((value) => value.toLocaleLowerCase().includes(normalized));
}

function matchesFilter(group: MediaDuplicateEvidenceGroup, filter: MediaDuplicateFilter) {
  if (filter === "same-title") return group.sameRetainedTitle;
  // Every legacy Media record currently carries provisional, needs-confirmation rights.
  if (filter === "rights-unresolved") {
    return group.members.some((member) => member.asset.rights.scopeState !== "confirmed");
  }
  return true;
}

function groupRecordTitle(group: MediaDuplicateEvidenceGroup) {
  if (group.sameRetainedTitle) return group.members[0]?.asset.title || "Shared-source evidence";
  const [first, second] = group.members;
  return [first?.asset.title, second?.asset.title].filter(Boolean).join(" ↔ ") || "Shared-source evidence";
}

function candidateTitle(group: MediaDuplicateEvidenceGroup) {
  return `${group.participantCount} records share an exact source`;
}

function memberLabel(index: number) {
  return `Legacy record ${String.fromCharCode(65 + index)}`;
}

export default function MediaDuplicatesWorkspace({
  initialAssets,
  initialLoadError = ""
}: MediaDuplicatesWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamKey = searchParams.toString();
  const urlState = useMemo(
    () => parseMediaDuplicatesUrlState(searchParams),
    [searchParamKey, searchParams]
  );
  const [batchSelection, setBatchSelection] = useState<Set<string>>(() => new Set());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isInspectorOverlay = useMediaQuery("(max-width: 1240px)");

  const evidence = useMemo(() => buildMediaDuplicateEvidence(initialAssets), [initialAssets]);
  const selectedGroup = useMemo(
    () => evidence.groups.find((group) => group.id === urlState.selected) || null,
    [evidence.groups, urlState.selected]
  );
  const visibleGroups = useMemo(
    () => sortGroups(
      evidence.groups.filter(
        (group) => matchesGroupQuery(group, urlState.query) && matchesFilter(group, urlState.filter)
      ),
      urlState.sort
    ),
    [evidence.groups, urlState.filter, urlState.query, urlState.sort]
  );

  useEffect(() => {
    const canonical = serializeMediaDuplicatesUrlState(urlState, searchParams).toString();
    if (canonical !== searchParamKey) {
      router.replace(`${pathname}${canonical ? `?${canonical}` : ""}`, { scroll: false });
    }
  }, [pathname, router, searchParamKey, searchParams, urlState]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    if (isInspectorOverlay && urlState.selected) setInspectorOpen(true);
    if (!urlState.selected) setInspectorOpen(false);
  }, [isInspectorOverlay, urlState.selected]);

  function updateUrl(
    next: Partial<typeof urlState>,
    mode: "push" | "replace" = "replace"
  ) {
    const params = serializeMediaDuplicatesUrlState({ ...urlState, ...next }, searchParams);
    const href = `${pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    router[mode](href, { scroll: false });
  }

  function selectGroup(groupId: string) {
    updateUrl({ selected: groupId }, "push");
    setMobileSidebarOpen(false);
    if (isInspectorOverlay) setInspectorOpen(true);
  }

  function setChecked(groupId: string, checked: boolean) {
    setBatchSelection((current) => {
      const next = new Set(current);
      if (checked) next.add(groupId);
      else next.delete(groupId);
      return next;
    });
  }

  function showSelectedComparison() {
    if (!selectedGroup) return;
    updateUrl({ tab: "compare" });
    if (isInspectorOverlay) setInspectorOpen(true);
  }

  const visibleSelectedCount = visibleGroups.filter((group) => batchSelection.has(group.id)).length;
  const hiddenSelectedCount = batchSelection.size - visibleSelectedCount;
  const visiblePairCount = visibleGroups.reduce((total, group) => total + group.pairCount, 0);
  const visibleSameTitleCount = visibleGroups.filter((group) => group.sameRetainedTitle).length;
  const visibleRightsCount = visibleGroups.filter((group) =>
    group.members.some((member) => member.asset.rights.scopeState !== "confirmed")
  ).length;

  const sidebarSections: readonly ModuleSidebarSection[] = [
    {
      id: "media",
      label: "Media",
      items: [
        { id: "all", label: "All Media", count: initialAssets.length, href: getModuleRoute("media") },
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
        id: `type-${label.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        label,
        disabled: true,
        disabledReason: "Verified Media type is not stored by the legacy file adapter."
      }))
    },
    {
      id: "context",
      label: "Context",
      items: ["Linked to Projects", "Linked to People", "Linked to Notes", "Linked to Resources", "Linked to Reviews"].map((label) => ({
        id: `context-${label.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        label,
        disabled: true,
        disabledReason: "Native AssetLink records are not connected; retained relation IDs remain untyped provenance."
      }))
    },
    {
      id: "data",
      label: "Data",
      items: [
        { id: "upload-queue", label: "Upload Queue", href: getModuleViewRoute("media", "upload-queue") },
        { id: "missing-metadata", label: "Missing Metadata", href: getModuleViewRoute("media", "missing-metadata") },
        { id: "duplicates", label: "Duplicates", active: true, href: getModuleViewRoute("media", "duplicates") },
        { id: "rights", label: "Rights / Usage", href: getModuleViewRoute("media", "rights-usage") },
        { id: "settings", label: "Settings", disabled: true, disabledReason: "Native Media settings remain an open product decision." }
      ]
    }
  ];

  const sidebar = (
    <ModuleSidebar
      id="media-duplicates-sidebar"
      title="Media"
      description="Binary assets, provenance, rights, versions, duplicates, and usage."
      sections={sidebarSections}
      mobileOpen={mobileSidebarOpen}
      onClose={() => setMobileSidebarOpen(false)}
      className={baseStyles.sidebar}
      footer={
        <p className={baseStyles.sidebarFootnote}>
          This queue compares retained source evidence only. It does not inspect or change binary files.
        </p>
      }
    />
  );

  const currentReturnTo = `${pathname}${searchParamKey ? `?${searchParamKey}` : ""}`;
  function memberDetailRoute(member: MediaDuplicateEvidenceMember) {
    const params = new URLSearchParams({ context: "duplicates", returnTo: currentReturnTo });
    return `${getNativeObjectRoute(member.asset.nativeRef)}?${params.toString()}`;
  }

  function renderMember(member: MediaDuplicateEvidenceMember, index: number) {
    return (
      <section className={styles.memberCard} key={member.asset.id} data-media-duplicate-member={member.asset.id}>
        <header>
          <span>{memberLabel(index)}</span>
          <strong>{member.asset.title}</strong>
          <code>{member.asset.id}</code>
        </header>
        <div className={styles.previewUnavailable}>
          <span aria-hidden="true">M</span>
          <strong>Preview unavailable</strong>
          <small>No raw file or derivative is connected.</small>
        </div>
        <dl className={styles.memberFacts}>
          <div><dt>Filename</dt><dd>Not recorded</dd></div>
          <div><dt>Checksum</dt><dd>Not computed</dd></div>
          <div><dt>Dimensions</dt><dd>Not recorded</dd></div>
          <div><dt>Updated</dt><dd>{formatDate(member.asset.updatedAt)}</dd></div>
          <div><dt>Rights</dt><dd>Needs confirmation</dd></div>
          <div><dt>Source fields</dt><dd>{member.references.length}</dd></div>
        </dl>
        <p>{summarizeBody(member.asset.body)}</p>
        <Link className={baseStyles.linkButton} href={memberDetailRoute(member)}>
          Open canonical Media record
        </Link>
      </section>
    );
  }

  function renderSelectedPanel(tab: MediaDuplicateTab) {
    if (urlState.selected && !selectedGroup) {
      return (
        <SystemState
          variant="stale"
          title="This evidence group is no longer available"
          description="The selected identifier does not match the currently derived source evidence. The underlying Media records were not changed."
          action={{ label: "Return to queue", onSelect: () => updateUrl({ selected: "" }, "push") }}
        />
      );
    }
    if (!selectedGroup) {
      return (
        <SystemState
          variant="read_only"
          title="Select an evidence group"
          description="Choose a row body to compare retained Media records. Checkboxes only control the local batch selection."
        />
      );
    }

    if (tab === "compare") {
      return (
        <div className={styles.inspectorStack}>
          <section className={styles.evidenceSpine} aria-label="Comparison evidence">
            <div data-state="available">
              <span>1</span>
              <strong>Exact shared Resource candidate</strong>
              <small>{selectedGroup.signal.matchKey}</small>
            </div>
            <div data-state={selectedGroup.sameRetainedTitle ? "available" : "unavailable"}>
              <span>2</span>
              <strong>Retained title comparison</strong>
              <small>{selectedGroup.sameRetainedTitle ? "All records retain the same normalized title." : "Titles differ; no conclusion is inferred."}</small>
            </div>
            <div data-state="unavailable"><span>3</span><strong>Binary identity</strong><small>Checksum and raw bytes are unavailable.</small></div>
            <div data-state="unavailable"><span>4</span><strong>Visual similarity</strong><small>No perceptual-hash or comparison service is connected.</small></div>
            <div data-state="unavailable"><span>5</span><strong>Version / derivative role</strong><small>No AssetVersion or derivative relationship is stored.</small></div>
          </section>
          <div className={styles.compareGrid}>
            {selectedGroup.members.map(renderMember)}
          </div>
          <div className={styles.readOnlyBoundary}>
            <strong>Evidence, not a resolution recommendation</strong>
            <p>A shared canonical source is worth reviewing, but it cannot establish binary equality, replacement order, version lineage, derivative intent, or safe link migration.</p>
          </div>
        </div>
      );
    }

    if (tab === "overview") {
      return (
        <div className={`${baseStyles.overviewGrid} ${styles.overviewGrid}`}>
          <section className={baseStyles.panel}>
            <h2>Evidence scope</h2>
            <dl className={baseStyles.factGrid}>
              <div className={baseStyles.fact}><span>Legacy records</span><strong>{selectedGroup.participantCount}</strong></div>
              <div className={baseStyles.fact}><span>Possible pairs</span><strong>{selectedGroup.pairCount}</strong></div>
              <div className={baseStyles.fact}><span>Literal signals</span><strong>{selectedGroup.sameRetainedTitle ? 2 : 1}</strong></div>
              <div className={baseStyles.fact}><span>Native cases</span><strong>Not connected</strong></div>
            </dl>
          </section>
          <section className={baseStyles.panel}>
            <h2>Resolution boundary</h2>
            <p>{RESOLUTION_REASON}</p>
          </section>
          <section className={baseStyles.panel} data-wide="true">
            <h2>Before any future resolution</h2>
            <ul className={baseStyles.readinessChecklist}>
              <li><span className={baseStyles.checkMarker}>1</span><span><strong>Establish binary identity</strong><small>Checksum, storage identity, and preview evidence must be persisted.</small></span></li>
              <li><span className={baseStyles.checkMarker}>2</span><span><strong>Classify the relationship</strong><small>Duplicate, version, derivative, or separate records must remain distinct decisions.</small></span></li>
              <li><span className={baseStyles.checkMarker}>3</span><span><strong>Preview consequences</strong><small>Links, usages, rights, old versions, rollback, and audit effects must be explicit.</small></span></li>
            </ul>
          </section>
        </div>
      );
    }

    if (tab === "metadata") {
      return (
        <div className={styles.inspectorStack}>
          <section className={baseStyles.panel}>
            <h2>Retained metadata</h2>
            <div className={styles.metadataTable} role="table" aria-label="Legacy Media record comparison">
              <div role="row"><strong role="columnheader">Field</strong>{selectedGroup.members.map((member, index) => <strong role="columnheader" key={member.asset.id}>{memberLabel(index)}</strong>)}</div>
              {[
                ["Title", (member: MediaDuplicateEvidenceMember) => member.asset.title],
                ["Record ID", (member: MediaDuplicateEvidenceMember) => member.asset.id],
                ["Created", (member: MediaDuplicateEvidenceMember) => formatDate(member.asset.createdAt)],
                ["Updated", (member: MediaDuplicateEvidenceMember) => formatDate(member.asset.updatedAt)],
                ["Filename", () => "Not recorded"],
                ["Checksum", () => "Not computed"],
                ["Dimensions", () => "Not recorded"]
              ].map(([label, value]) => (
                <div role="row" key={label as string}>
                  <span role="rowheader">{label as string}</span>
                  {selectedGroup.members.map((member) => <span role="cell" key={member.asset.id}>{(value as (entry: MediaDuplicateEvidenceMember) => string)(member)}</span>)}
                </div>
              ))}
            </div>
          </section>
          <SystemState variant="read_only" compact title="No final metadata can be chosen" description="A native resolution preview and writer are required before one record can supply metadata to another." />
        </div>
      );
    }

    if (tab === "links") {
      return (
        <div className={styles.inspectorStack}>
          <section className={baseStyles.panel}>
            <h2>Shared Resource candidate</h2>
            <code className={styles.sourceKey}>{selectedGroup.signal.matchKey}</code>
            <p>This exact normalized HTTP(S) source appears on every record in this evidence group. Resource ownership is not inferred or created.</p>
            <Link className={baseStyles.linkButton} href={`${getModuleRoute("resources")}?query=${encodeURIComponent(selectedGroup.signal.matchKey)}`}>
              Search canonical Resources
            </Link>
          </section>
          <SystemState variant="read_only" compact title="Native links and usages are unavailable" description="Retained relation IDs remain untyped provenance. No AssetLink, AssetUsage, or migration consequence is claimed." />
        </div>
      );
    }

    if (tab === "rights") {
      return (
        <div className={styles.inspectorStack}>
          <section className={baseStyles.panel}>
            <h2>Provisional rights scope</h2>
            <ul className={baseStyles.objectList}>
              {selectedGroup.members.map((member) => (
                <li key={member.asset.id}>
                  <span><strong>{member.asset.title}</strong><small>Needs confirmation · Internal / Review provisional scope</small></span>
                  <span className={baseStyles.stateChip} data-tone="amber">Unconfirmed</span>
                </li>
              ))}
            </ul>
          </section>
          <SystemState variant="read_only" compact title="Resolution eligibility is not evaluated" description="Missing rights evidence cannot be treated as permission. A future merge or replacement must preserve the stricter confirmed rights and an auditable review." />
        </div>
      );
    }

    return (
      <div className={styles.inspectorStack}>
        <section className={baseStyles.panel}>
          <h2>Retained legacy timestamps</h2>
          <ul className={baseStyles.objectList}>
            {selectedGroup.members.map((member) => (
              <li key={member.asset.id}>
                <span><strong>{member.asset.title}</strong><small>Created {formatDate(member.asset.createdAt)} · Updated {formatDate(member.asset.updatedAt)}</small></span>
                <code>{member.asset.id}</code>
              </li>
            ))}
          </ul>
        </section>
        <SystemState variant="read_only" compact title="No duplicate-case audit exists" description="The adapter does not synthesize detection, recommendation, decision, merge, replacement, version, or archive events." />
      </div>
    );
  }

  const inspectorTitle = (
    <div className={baseStyles.inspectorHeader}>
      <ObjectHeader
        objectType="Media evidence review"
        title={selectedGroup ? candidateTitle(selectedGroup) : "Duplicate case review"}
        subtitle={selectedGroup ? `${sourceDomain(selectedGroup.signal.matchKey)} · Derived from retained source fields` : "No persisted DuplicateCase repository is connected"}
        identity="D"
        headingLevel="h2"
        states={
          <>
            <span className={baseStyles.stateChip} data-tone="blue">Evidence only</span>
            {selectedGroup && <span className={baseStyles.stateChip}>{selectedGroup.participantCount} legacy records</span>}
            <span className={baseStyles.stateChip} data-tone="amber">Read-only</span>
          </>
        }
      />
    </div>
  );

  const decisionActions = selectedGroup ? (
    <div className={styles.decisionFooter} aria-label="Unavailable resolution actions">
      <p><strong>Resolution writes are unavailable.</strong> Review the evidence now; no decision will be stored.</p>
      <QuickActionBar
        ariaLabel="Duplicate resolution actions"
        sticky
        actions={[
          { id: `duplicate-footer-merge-${selectedGroup.id}`, label: "Merge", disabled: true, disabledReason: RESOLUTION_REASON },
          { id: `duplicate-footer-replace-${selectedGroup.id}`, label: "Replace", disabled: true, disabledReason: RESOLUTION_REASON },
          { id: `duplicate-footer-version-${selectedGroup.id}`, label: "New version", disabled: true, disabledReason: RESOLUTION_REASON },
          { id: `duplicate-footer-separate-${selectedGroup.id}`, label: "Keep separate", disabled: true, disabledReason: RESOLUTION_REASON },
          { id: `duplicate-footer-derivative-${selectedGroup.id}`, label: "Derivative", disabled: true, disabledReason: RESOLUTION_REASON }
        ]}
      />
    </div>
  ) : undefined;

  const inspector = (
    <InspectorRail
      id="media-duplicates-inspector"
      readOnly
      overlay={isInspectorOverlay}
      overlayOpen={!isInspectorOverlay || inspectorOpen}
      onRequestClose={() => setInspectorOpen(false)}
      ariaLabel={selectedGroup ? `${candidateTitle(selectedGroup)} duplicate evidence inspector` : "Duplicate case review inspector"}
      className={styles.inspector}
      title={inspectorTitle}
      actions={isInspectorOverlay ? (
        <button className={baseStyles.button} type="button" onClick={() => setInspectorOpen(false)}>Close</button>
      ) : undefined}
      footer={decisionActions}
    >
      <DetailTabs
        id="media-duplicates-tabs"
        tabs={DUPLICATE_TABS}
        activeTab={urlState.tab}
        onTabChange={(tab) => updateUrl({ tab: tab as MediaDuplicateTab })}
        ariaLabel="Duplicate evidence details"
        className={baseStyles.tabs}
      />
      {DUPLICATE_TABS.map((tab) => (
        <DetailTabPanel
          tabsId="media-duplicates-tabs"
          tabId={tab.id}
          active={urlState.tab === tab.id}
          key={tab.id}
          className={styles.tabPanel}
        >
          {renderSelectedPanel(tab.id as MediaDuplicateTab)}
        </DetailTabPanel>
      ))}
    </InspectorRail>
  );

  const aiDock = mobileSidebarOpen || (isInspectorOverlay && inspectorOpen) ? null : (
    <SharedAIDock
      open={urlState.ai}
      onOpenChange={(open) => updateUrl({ ai: open })}
      className={selectedGroup ? styles.aiDockRaised : undefined}
      context={{
        module: "media",
        activeTab: urlState.tab,
        visibleScope: selectedGroup ? `${candidateTitle(selectedGroup)} · evidence only` : "Duplicates · exact-source evidence"
      }}
    />
  );

  const headerActions = (
    <QuickActionBar
      ariaLabel="Duplicate evidence actions"
      actions={[
        { id: "duplicates-header-scan", label: "Scan", disabled: true, disabledReason: "Raw bytes, checksums, and perceptual-hash services are not connected." },
        { id: "duplicates-header-batch", label: "Batch resolve", disabled: true, disabledReason: RESOLUTION_REASON },
        {
          id: "duplicates-header-compare",
          label: "Compare selected",
          onSelect: selectedGroup ? showSelectedComparison : undefined,
          disabled: !selectedGroup,
          disabledReason: selectedGroup ? undefined : "Select an exact-source evidence group first."
        },
        { id: "duplicates-header-choose-files", label: "Choose files", href: getModuleViewRoute("media", "upload-queue"), intent: "primary" }
      ]}
    />
  );

  const selectionBar = batchSelection.size > 0 ? (
    <div className={baseStyles.batchBar} aria-label="Duplicate evidence batch selection">
      <strong>
        {batchSelection.size} selected{hiddenSelectedCount > 0 ? ` · ${hiddenSelectedCount} outside this view` : ""}
      </strong>
      <button className={baseStyles.button} type="button" onClick={() => setBatchSelection(new Set())}>Clear</button>
      <button className={baseStyles.button} type="button" aria-disabled="true" title={RESOLUTION_REASON}>Merge</button>
      <button className={baseStyles.button} type="button" aria-disabled="true" title={RESOLUTION_REASON}>Keep separate</button>
      <button className={baseStyles.button} type="button" aria-disabled="true" title="No stable duplicate evidence export contract is connected.">Export</button>
    </div>
  ) : undefined;

  return (
    <ModuleShell
      module="media"
      sidebar={sidebar}
      inspector={inspector}
      aiDock={aiDock}
      mode="review"
      ariaLabel="Media duplicates evidence workspace"
      className={`${baseStyles.shell} ${styles.shell}`}
    >
      <button
        className={`${baseStyles.button} ${baseStyles.mobileMenuButton}`}
        type="button"
        onClick={() => { setInspectorOpen(false); setMobileSidebarOpen(true); updateUrl({ ai: false }); }}
        aria-label="Open Media navigation"
        aria-expanded={mobileSidebarOpen}
        aria-controls="media-duplicates-sidebar"
      >
        Menu
      </button>
      <button
        className={`${baseStyles.button} ${baseStyles.mobileInspectorButton}`}
        type="button"
        onClick={() => { setMobileSidebarOpen(false); setInspectorOpen(true); updateUrl({ ai: false }); }}
        aria-label="Open duplicate evidence details"
        aria-expanded={inspectorOpen}
        aria-controls="media-duplicates-inspector"
        disabled={!urlState.selected}
      >
        Details
      </button>
      {(mobileSidebarOpen || (isInspectorOverlay && inspectorOpen)) && (
        <button
          type="button"
          className={baseStyles.scrim}
          aria-label="Close open panel"
          onClick={() => { setMobileSidebarOpen(false); setInspectorOpen(false); }}
        />
      )}

      <DirectoryPane
        ariaLabel="Media duplicate evidence directory"
        className={`${baseStyles.directory} ${styles.directory}`}
        selectionBar={selectionBar}
      >
        <div className={baseStyles.mainScroll} id="media-duplicates-directory" data-media-duplicates-state={initialLoadError ? "error" : evidence.groups.length ? "ready" : "empty"}>
          <div className={baseStyles.directoryHeader}>
            <div>
              <span className={baseStyles.eyebrow}>Media · Evidence review</span>
              <h1>Duplicates</h1>
              <p>Review literal overlap evidence before it can pollute asset history.</p>
            </div>
            {headerActions}
          </div>

          <div className={styles.capabilityBoundary} role="note">
            <strong>Exact-source evidence only</strong>
            <span>Shared syntax-accepted Resource candidates can be compared. Binary checksums, visual similarity, native cases, version lineage, recommendations, and resolution writes are not connected.</span>
          </div>

          <MetricStrip
            className={styles.metricStrip}
            ariaLabel="Duplicate evidence summary"
            items={[
              { id: "groups", label: "Evidence groups", value: visibleGroups.length, detail: "Exact shared source" },
              { id: "participants", label: "Participating records", value: uniqueParticipants(visibleGroups), detail: "Legacy Media" },
              { id: "pairs", label: "Possible pairs", value: visiblePairCount, detail: "Not confirmed duplicates" },
              { id: "same-title", label: "Same retained title", value: visibleSameTitleCount, detail: "Supporting only" },
              { id: "rights", label: "Rights unresolved", value: visibleRightsCount, detail: "Needs confirmation", tone: visibleRightsCount ? "attention" : "default" },
              { id: "native", label: "Native cases", value: "—", detail: "Repository not connected" },
              { id: "checksum", label: "Checksum evidence", value: "—", detail: "Not computed" },
              { id: "resolved", label: "Resolutions", value: "—", detail: "Writes disabled" }
            ]}
          />

          <label className={baseStyles.search}>
            <span aria-hidden="true">⌕</span>
            <input
              ref={searchInputRef}
              type="search"
              value={urlState.query}
              onChange={(event) => updateUrl({ query: event.target.value })}
              placeholder="Search evidence groups by record, title, ID, or accepted source"
              aria-label="Search duplicate evidence"
            />
            <kbd>/</kbd>
          </label>

          <div className={baseStyles.chipRow} aria-label="Duplicate evidence filters">
            {FILTERS.map((filter) => (
              <button
                className={baseStyles.chip}
                type="button"
                data-active={urlState.filter === filter.id}
                data-tone={filter.tone}
                data-duplicate-filter={filter.id}
                aria-pressed={urlState.filter === filter.id}
                onClick={() => updateUrl({ filter: filter.id })}
                key={filter.id}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className={baseStyles.sortRow}>
            <span><strong>{visibleGroups.length}</strong> exact-source evidence group{visibleGroups.length === 1 ? "" : "s"}</span>
            <label className={styles.sortControl}>
              <span>Sort</span>
              <select
                value={urlState.sort}
                onChange={(event) => updateUrl({ sort: event.target.value as MediaDuplicateSort })}
              >
                {(Object.keys(SORT_LABELS) as MediaDuplicateSort[]).map((sort) => (
                  <option value={sort} key={sort}>{SORT_LABELS[sort]}</option>
                ))}
              </select>
            </label>
          </div>

          {initialLoadError ? (
            <SystemState
              variant="error"
              title="Unable to load duplicate evidence"
              description={`${initialLoadError} No detection or mutation was attempted.`}
              action={{ label: "Retry", onSelect: () => router.refresh() }}
            />
          ) : initialAssets.length === 0 ? (
            <SystemState
              variant="empty"
              title="No legacy Media records"
              description="No Personal Records items with class file are available. No native duplicate case was created."
            />
          ) : evidence.groups.length === 0 ? (
            <SystemState
              variant="read_only"
              title="No literal overlap group found"
              description={`Reviewed ${initialAssets.length} legacy Media record${initialAssets.length === 1 ? "" : "s"}. ${evidence.acceptedAssetCount} retain accepted HTTP(S) source evidence, but no exact source appears on two records. This does not prove the files are unique because checksum and visual scans did not run.`}
            />
          ) : visibleGroups.length === 0 ? (
            <SystemState
              variant="empty"
              title="No evidence groups match this view"
              description="The current query and filter found no exact shared-source group."
              action={{ label: "Reset view", onSelect: () => updateUrl({ query: "", filter: "all" }) }}
            />
          ) : (
            <div className={styles.evidenceGroups}>
              <section className={styles.evidenceGroup} aria-labelledby="media-duplicates-shared-source-heading" data-duplicate-group="shared-source">
                <header className={baseStyles.queueGroupHeader}>
                  <div>
                    <h2 id="media-duplicates-shared-source-heading">Exact shared Resource candidates</h2>
                    <p>Fragment-insensitive WHATWG-normalized HTTP(S) sources retained by at least two Media records.</p>
                  </div>
                  <strong>{visibleGroups.length}</strong>
                </header>
                <div className={baseStyles.list} data-density="compact" role="list">
                  {visibleGroups.map((group) => (
                    <div className={styles.caseRow} data-media-duplicate-group={group.id} key={group.id}>
                      <DenseObjectRow
                        id={group.id}
                        title={groupRecordTitle(group)}
                        description={`${group.participantCount} legacy records · ${group.pairCount} possible pair${group.pairCount === 1 ? "" : "s"} · ${group.sameRetainedTitle ? "same retained title" : "titles differ"}`}
                        metadata={group.signal.matchKey}
                        trailing={<><span>{sourceDomain(group.signal.matchKey)}</span><span>Updated {formatDate(group.latestUpdatedAt)}</span></>}
                        selected={urlState.selected === group.id}
                        onSelect={() => selectGroup(group.id)}
                        checkbox={{
                          checked: batchSelection.has(group.id),
                          onCheckedChange: (checked) => setChecked(group.id, checked),
                          label: `Select ${groupRecordTitle(group)} for batch actions`
                        }}
                      />
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          <div className={styles.scopeFootnote}>
            <span>{evidence.acceptedAssetCount} of {initialAssets.length} legacy Media records retain at least one accepted HTTP(S) source.</span>
            <span>{evidence.acceptedButUniqueAssetCount} accepted-source record{evidence.acceptedButUniqueAssetCount === 1 ? "" : "s"} currently appear in no shared-source group.</span>
            <span>{evidence.nonMatchableAssetCount} record{evidence.nonMatchableAssetCount === 1 ? "" : "s"} expose no matchable source candidate to this client-safe adapter.</span>
          </div>
        </div>
      </DirectoryPane>
    </ModuleShell>
  );
}
