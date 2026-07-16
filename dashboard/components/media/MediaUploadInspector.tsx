"use client";

import InspectorRail from "../admin-shell/InspectorRail";
import DetailTabs, { DetailTabPanel, type DetailTab } from "../operational/DetailTabs";
import ObjectHeader from "../operational/ObjectHeader";
import QuickActionBar from "../operational/QuickActionBar";
import SystemState from "../operational/SystemState";
import {
  formatLocalFileSize,
  type LocalUploadCandidate
} from "../../lib/modules/media/upload-intake";
import type { MediaUploadTab } from "../../lib/native-objects/url-state";
import baseStyles from "../content-graph/ContentGraphWorkspace.module.css";
import styles from "./MediaUploadQueueWorkspace.module.css";

const TABS: readonly DetailTab[] = [
  { id: "intake", label: "Intake" },
  { id: "metadata", label: "Metadata" },
  { id: "duplicates", label: "Duplicates" },
  { id: "links", label: "Links" },
  { id: "rights", label: "Rights" },
  { id: "log", label: "Processing Log" }
];

type MediaUploadInspectorProps = {
  selected: LocalUploadCandidate | null;
  duplicateMatches: readonly LocalUploadCandidate[];
  activeTab: MediaUploadTab;
  onTabChange: (tab: MediaUploadTab) => void;
  onRemove: (id: string) => void;
  overlay: boolean;
  overlayOpen: boolean;
  onRequestClose: () => void;
};

function formatDateTime(value: string | null): string {
  if (!value) return "Not reported";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not reported";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={baseStyles.fact} data-mono={mono || undefined}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function MediaUploadInspector({
  selected,
  duplicateMatches,
  activeTab,
  onTabChange,
  onRemove,
  overlay,
  overlayOpen,
  onRequestClose
}: MediaUploadInspectorProps) {
  if (!selected) {
    return (
      <InspectorRail
        ariaLabel="Local Media intake details"
        overlay={overlay}
        overlayOpen={overlayOpen}
        onRequestClose={onRequestClose}
        className={styles.inspector}
      >
        <div className={styles.emptyInspector}>
          <SystemState
            compact
            variant="empty"
            title="No local file selected"
            description="Choose or drop files to inspect browser-reported metadata. Nothing is uploaded or persisted."
          />
        </div>
      </InspectorRail>
    );
  }

  const createReason =
    "A native RawFile repository, UploadQueueItem persistence, validation, security scan, audit actor, and retention policy are not connected.";

  return (
    <InspectorRail
      readOnly
      ariaLabel={`${selected.originalFilename} local intake details`}
      overlay={overlay}
      overlayOpen={overlayOpen}
      onRequestClose={onRequestClose}
      className={styles.inspector}
      title={
        <ObjectHeader
          objectType="Local intake preview"
          title={selected.originalFilename}
          subtitle={
            <span className={baseStyles.mono}>
              {selected.localId} · {selected.browserMimeType || "browser type not reported"}
            </span>
          }
          identity={<span aria-hidden="true">LP</span>}
          states={
            <>
              <span className={baseStyles.stateChip} data-tone="blue">On this device</span>
              <span className={baseStyles.stateChip} data-tone="amber">Not uploaded</span>
              <span className={baseStyles.stateChip}>Not a MediaAsset</span>
            </>
          }
          actions={
            <div className={baseStyles.inlineActions}>
              {overlay && (
                <button className={baseStyles.button} type="button" onClick={onRequestClose}>
                  Close details
                </button>
              )}
              <button
                className={baseStyles.button}
                type="button"
                onClick={() => onRemove(selected.localId)}
              >
                Remove from preview
              </button>
            </div>
          }
          headingLevel="h2"
        />
      }
      footer={
        <div className={styles.finalizeFooter}>
          <div>
            <strong>Native creation is unavailable</strong>
            <span>{createReason}</span>
          </div>
          <QuickActionBar
            ariaLabel="Unavailable Media intake creation actions"
            actions={[
              { id: "create", label: "Create asset", intent: "primary", disabled: true, disabledReason: createReason },
              { id: "create-review", label: "Create + review", disabled: true, disabledReason: createReason },
              { id: "save-draft", label: "Save draft", disabled: true, disabledReason: "There is no native upload-intake repository to save this preview." }
            ]}
          />
        </div>
      }
    >
      <DetailTabs
        id="media-local-upload-tabs"
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={(tab) => onTabChange(tab as MediaUploadTab)}
        ariaLabel={`${selected.originalFilename} intake sections`}
        className={baseStyles.tabs}
      />

      <DetailTabPanel
        tabsId="media-local-upload-tabs"
        tabId="intake"
        active={activeTab === "intake"}
      >
        <div className={styles.inspectorBody}>
          <section className={styles.boundaryCallout} aria-label="Local intake boundary">
            <strong>Metadata preflight only</strong>
            <span>
              The browser supplied name, size, type, and modified time. File contents were not read,
              retained, transmitted, validated, or scanned.
            </span>
          </section>

          <section className={styles.statusStrip} aria-label="Local intake status">
            <div><span>State</span><strong>Local preview</strong></div>
            <div><span>Blockers</span><strong>Native intake + source + rights</strong></div>
            <div><span>RawFile</span><strong>Not created</strong></div>
            <div><span>UploadQueueItem</span><strong>Not created</strong></div>
          </section>

          <section className={baseStyles.panel}>
            <div className={baseStyles.panelHeader}>
              <h2>File facts</h2>
              <span className={baseStyles.stateChip} data-tone="blue">Browser-reported</span>
            </div>
            <div className={baseStyles.factGrid}>
              <Fact label="Original filename" value={selected.originalFilename} mono />
              <Fact label="Local preview ID" value={selected.localId} mono />
              <Fact label="Browser MIME" value={selected.browserMimeType || "Not reported"} mono />
              <Fact label="Size" value={formatLocalFileSize(selected.sizeBytes)} mono />
              <Fact label="Extension" value={selected.extension ? `.${selected.extension}` : "Not present"} mono />
              <Fact label="Last modified" value={formatDateTime(selected.lastModifiedAt)} />
              <Fact label="Checksum" value="Not computed — contents not read" />
              <Fact label="Added to preview" value={formatDateTime(selected.addedAt)} />
            </div>
          </section>
        </div>
      </DetailTabPanel>

      <DetailTabPanel
        tabsId="media-local-upload-tabs"
        tabId="metadata"
        active={activeTab === "metadata"}
      >
        <div className={styles.inspectorBody}>
          <section className={baseStyles.panel}>
            <div className={baseStyles.panelHeader}>
              <h2>Available metadata evidence</h2>
              <span className={baseStyles.stateChip}>Not extracted</span>
            </div>
            <div className={baseStyles.factGrid}>
              <Fact label="Filename" value={selected.originalFilename} mono />
              <Fact label="Browser type hint" value={selected.browserMimeType || "Unavailable"} mono />
              <Fact label="Extension hint" value={selected.extension ? `.${selected.extension}` : "Unavailable"} mono />
              <Fact label="Proposed title" value="Unavailable — no extraction service" />
              <Fact label="Dimensions / duration" value="Unavailable — contents not read" />
              <Fact label="Alt / OCR / transcript" value="Unavailable — contents not read" />
            </div>
          </section>
          <QuickActionBar
            ariaLabel="Unavailable metadata actions"
            actions={[
              { id: "accept", label: "Accept metadata", disabled: true, disabledReason: "No extracted proposal or native persistence exists." },
              { id: "edit", label: "Edit before create", disabled: true, disabledReason: "A native UploadQueueItem draft does not exist." },
              { id: "rerun", label: "Run extraction", disabled: true, disabledReason: "No extraction service is connected, and file contents are not read by this preview." }
            ]}
          />
        </div>
      </DetailTabPanel>

      <DetailTabPanel
        tabsId="media-local-upload-tabs"
        tabId="duplicates"
        active={activeTab === "duplicates"}
      >
        <div className={styles.inspectorBody}>
          <section className={baseStyles.panel}>
            <div className={baseStyles.panelHeader}>
              <h2>Local selection matches</h2>
              <span className={baseStyles.stateChip} data-tone={duplicateMatches.length ? "amber" : "green"}>
                {duplicateMatches.length ? `${duplicateMatches.length} possible` : "None in preview"}
              </span>
            </div>
            <p className={styles.panelCopy}>
              This comparison uses only filename, size, and modified time. It is not checksum or visual
              duplicate detection and cannot establish binary equality.
            </p>
            {duplicateMatches.length ? (
              <ul className={baseStyles.objectList}>
                {duplicateMatches.map((match) => (
                  <li key={match.localId}>
                    <span>
                      <strong>{match.originalFilename}</strong>
                      <small>{formatLocalFileSize(match.sizeBytes)} · {match.localId}</small>
                    </span>
                    <span className={baseStyles.stateChip} data-tone="amber">Candidate</span>
                  </li>
                ))}
              </ul>
            ) : (
              <SystemState
                compact
                variant="empty"
                title="No local metadata match"
                description="Native checksum and visual duplicate detection remain unavailable."
              />
            )}
          </section>
          <QuickActionBar
            ariaLabel="Unavailable duplicate actions"
            actions={[
              { id: "compare", label: "Compare binaries", disabled: true, disabledReason: "File contents and native duplicate services are not available." },
              { id: "keep", label: "Keep separate", disabled: true, disabledReason: "No native UploadQueueItem decision exists to persist." },
              { id: "merge", label: "Merge", disabled: true, disabledReason: "Duplicate merging is never automatic and requires native Media records, consequence preview, and audit." }
            ]}
          />
        </div>
      </DetailTabPanel>

      <DetailTabPanel
        tabsId="media-local-upload-tabs"
        tabId="links"
        active={activeTab === "links"}
      >
        <div className={styles.inspectorBody}>
          <SystemState
            compact
            variant="read_only"
            title="Native links are unavailable"
            description="A local filename is not enough evidence to infer a Project, Person, Review, Note, Resource, or Personal Ops relationship."
          />
          <QuickActionBar
            ariaLabel="Unavailable local intake link actions"
            actions={[
              { id: "link", label: "Link object", disabled: true, disabledReason: "No persisted UploadQueueItem or ObjectLink exists." },
              { id: "suggest", label: "Suggest links", disabled: true, disabledReason: "The shared AI and native link suggestion service are disconnected." }
            ]}
          />
        </div>
      </DetailTabPanel>

      <DetailTabPanel
        tabsId="media-local-upload-tabs"
        tabId="rights"
        active={activeTab === "rights"}
      >
        <div className={styles.inspectorBody}>
          <section className={baseStyles.panel}>
            <div className={baseStyles.panelHeader}>
              <h2>Source &amp; rights</h2>
              <span className={baseStyles.stateChip} data-tone="amber">Needs confirmation</span>
            </div>
            <div className={baseStyles.factGrid}>
              <Fact label="Source" value="Unassigned — local selection is not provenance" />
              <Fact label="Resource relationship" value="Not created" />
              <Fact label="Canonical rights" value="Needs confirmation" />
              <Fact label="Temporary use scope" value="Not assigned" />
            </div>
          </section>
          <QuickActionBar
            ariaLabel="Unavailable source and rights actions"
            actions={[
              { id: "rights", label: "Confirm rights", disabled: true, disabledReason: "Rights evidence and audit persistence are not connected." },
              { id: "source", label: "Add source", disabled: true, disabledReason: "Resources owns external source identity; no native source relationship can be saved here." },
              { id: "personal", label: "Set personal use", disabled: true, disabledReason: "A disappearing browser-only choice would be misleading, so rights defaults stay unavailable until they can be audited." }
            ]}
          />
        </div>
      </DetailTabPanel>

      <DetailTabPanel
        tabsId="media-local-upload-tabs"
        tabId="log"
        active={activeTab === "log"}
      >
        <div className={styles.inspectorBody}>
          <section className={baseStyles.panel}>
            <div className={baseStyles.panelHeader}>
              <h2>Local processing log</h2>
              <span className={baseStyles.stateChip}>Session only</span>
            </div>
            <ol className={styles.logList}>
              <li><span>1</span><div><strong>File selected in browser</strong><small>{formatDateTime(selected.addedAt)}</small></div></li>
              <li><span>2</span><div><strong>Name, type, size, and modified time copied into page memory</strong><small>No file bytes retained</small></div></li>
              <li data-state="pending"><span>—</span><div><strong>Upload not started</strong><small>No transport or storage repository connected</small></div></li>
              <li data-state="pending"><span>—</span><div><strong>Validation, security, extraction, preview, and duplicate scan not run</strong><small>No processing service connected</small></div></li>
            </ol>
          </section>
        </div>
      </DetailTabPanel>
    </InspectorRail>
  );
}
