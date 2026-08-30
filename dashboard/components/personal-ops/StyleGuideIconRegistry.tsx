"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import {
  ICON_REGISTRY,
  candidateLabel,
  iconModules,
  streamlineIconUrl,
  type IconModuleName
} from "../../lib/icons/icon-registry";
import type { StyleGuideIconAssignment, StyleGuideModulePalette } from "../../lib/modules/style-guide/types";
import styles from "./PersonalUtilityWorkspace.module.css";

function moduleColor(moduleName: IconModuleName, modules: StyleGuideModulePalette[]): string {
  if (moduleName === "System") return "#102026";
  return modules.find((item) => item.module === moduleName)?.accent || "#102026";
}

export default function StyleGuideIconRegistry({
  assignments,
  modules,
  busy,
  onSelect
}: {
  assignments: StyleGuideIconAssignment[];
  modules: StyleGuideModulePalette[];
  busy: boolean;
  onSelect: (role: string, candidate: string) => Promise<boolean>;
}) {
  const [changingRole, setChangingRole] = useState("");
  const [variantByRole, setVariantByRole] = useState<Record<string, IconModuleName | "Neutral">>({});

  async function select(role: string, candidate: string) {
    if (await onSelect(role, candidate)) setChangingRole("");
  }

  return (
    <div className={styles.iconRegistry} data-icon-registry-count={ICON_REGISTRY.length}>
      {ICON_REGISTRY.map((entry) => {
        const assignment = assignments.find((item) => item.icon === entry.id);
        const selected = assignment?.selection || "";
        const shownCandidate = selected || entry.defaultCandidate;
        const modulesForRole = iconModules(entry);
        const selectedVariant = variantByRole[entry.id] || "Neutral";
        const color = selectedVariant === "Neutral" ? "#102026" : moduleColor(selectedVariant, modules);
        const showCandidates = !selected || changingRole === entry.id;
        const recordedUsage = entry.usages.map((usage) => `${usage.module} › ${usage.breadcrumb}`).join(" · ");

        return (
          <article className={styles.iconRegistryRow} key={entry.id} data-selected={selected ? "true" : undefined}>
            <div className={styles.iconRegistryIdentity}>
              <span className={styles.iconRegistrySpecimen} style={{ color }}>
                <UnigentamosIcon role={entry.id} candidate={shownCandidate} size={32} />
              </span>
              <div>
                <strong>{entry.label}</strong>
                <code>{entry.id}</code>
                <span>{selected ? `Selected · ${candidateLabel(selected)}` : `Live default · ${candidateLabel(entry.defaultCandidate)}`}</span>
              </div>
            </div>

            <div className={styles.iconRegistryUsage}>
              <label>
                <span>Used in</span>
                <input aria-label={`${entry.label} usage`} readOnly value={recordedUsage} />
              </label>
              <div className={styles.variantToggle} aria-label={`${entry.label} color variants`}>
                <button type="button" data-active={selectedVariant === "Neutral" || undefined} onClick={() => setVariantByRole((current) => ({ ...current, [entry.id]: "Neutral" }))}>Neutral</button>
                {modulesForRole.map((moduleName) => (
                  <button
                    type="button"
                    data-active={selectedVariant === moduleName || undefined}
                    style={{ "--variant-color": moduleColor(moduleName, modules) } as CSSProperties}
                    onClick={() => setVariantByRole((current) => ({ ...current, [entry.id]: moduleName }))}
                    key={moduleName}
                  >
                    {moduleName}
                  </button>
                ))}
              </div>
            </div>

            {showCandidates ? (
              <div className={styles.iconCandidates} aria-label={`${entry.label} recommendations`}>
                {entry.candidates.map((candidate, index) => (
                  <div className={styles.iconCandidate} key={candidate}>
                    <a href={streamlineIconUrl(candidate)} target="_blank" rel="noreferrer" title={`Open ${candidateLabel(candidate)} in Streamline HQ`}>
                      <UnigentamosIcon role={entry.id} candidate={candidate} size={26} />
                      <span><b>{index + 1}</b>{candidateLabel(candidate)}</span>
                    </a>
                    <button type="button" disabled={busy} onClick={() => void select(entry.id, candidate)}>{selected === candidate ? "Keep" : "Select"}</button>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.iconSelection}>
                <a href={streamlineIconUrl(selected)} target="_blank" rel="noreferrer">
                  <UnigentamosIcon role={entry.id} candidate={selected} size={24} />
                  <span>{candidateLabel(selected)}</span>
                </a>
                {assignment?.resourceId ? <Link href={`/admin/resources/${assignment.resourceId}`}>Open Resource</Link> : <span>Creating Resource…</span>}
                <button type="button" disabled={busy} onClick={() => setChangingRole(entry.id)}>Change</button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
