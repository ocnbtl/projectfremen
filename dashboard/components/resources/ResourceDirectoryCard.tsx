"use client";

import type { ReactNode } from "react";
import type { ResourceRecord } from "../../lib/modules/resources/types";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { ResourceMark } from "./ResourceVisual";

const lifecycleLabels = { active: "Active", archived: "Archived", unavailable: "Unavailable", merged: "Merged", replaced: "Replaced", unknown: "Status not set" };

export default function ResourceDirectoryCard({ resource, typeLabel, description, metadata, trailing, actions, selected, onSelect }: {
  resource: ResourceRecord;
  typeLabel: string;
  description: string;
  metadata: ReactNode;
  trailing?: ReactNode;
  actions: ReactNode;
  selected: boolean;
  onSelect: () => void;
}) {
  const titleId = `resource-card-${resource.id}-title`;
  const status = lifecycleLabels[resource.lifecycleState];
  return <article className="resource-directory-card" role="listitem" aria-labelledby={titleId} data-selected={selected || undefined} onClick={event => {
    if (!(event.target as HTMLElement).closest("button")) onSelect();
  }}>
    <button className="resource-card-open" type="button" onClick={onSelect} aria-label={`Open ${resource.title}`} aria-pressed={selected} />
    <ResourceMark resource={resource} gradient={resource.gradient} imageUrl={resource.metadata.imageUrl} className="resource-card-picture" />
    <div className="resource-card-content">
      <div className="resource-card-heading">
        <strong className="resource-card-title" id={titleId}>{resource.title}</strong>
        <div className="resource-card-tags">
          <span className="resource-card-status" title={status} aria-label={status} data-status={resource.lifecycleState}>
            <UnigentamosIcon role={resource.lifecycleState === "active" ? "active" : resource.lifecycleState === "archived" ? "archive" : "information"} size={16} />
          </span>
          <span className="resource-card-tag" title={typeLabel === "Unspecified" ? "Resource type not set" : typeLabel}>{typeLabel === "Unspecified" ? "Resource" : typeLabel}</span>
          <span className="resource-card-pin">{actions}</span>
        </div>
      </div>
      {metadata && <div className="resource-card-details">{metadata}</div>}
      {description && <p className="resource-card-description">{description}</p>}
      {trailing && <div className="resource-card-evidence">{trailing}</div>}
    </div>
  </article>;
}
