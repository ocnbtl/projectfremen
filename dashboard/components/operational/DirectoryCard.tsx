"use client";
import { MorphingArticle, MorphingStrong, MorphingDiv } from "../ui/DirectoryLayout";

import Link from "next/link";
import type { ReactNode } from "react";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import type { DenseObjectRowCheckbox } from "./DenseObjectRow";

/** Shared identity, status/type and action slots for module directories. */
export default function DirectoryCard({ id, title, picture, icon, status, statusIcon = "active", tag, description, metadata, trailing, actions, selected, onSelect, href, checkbox, gallery = false }: {
  id: string; title: string; picture?: ReactNode; icon?: string;
  status: string; statusIcon?: string; tag: string;
  description?: ReactNode; metadata?: ReactNode; trailing?: ReactNode; actions?: ReactNode;
  selected?: boolean; onSelect?: () => void; href?: string;
  checkbox?: DenseObjectRowCheckbox; gallery?: boolean;
}) {
  const titleId = `directory-card-${id}-title`;
  return <MorphingArticle className="resource-directory-card" data-gallery={gallery || undefined} role="listitem" aria-labelledby={titleId} data-selected={selected || undefined} onClick={event => {
    if (!(event.target as HTMLElement).closest("button,a,input,label") && onSelect) onSelect();
  }}>
    {href ? <Link href={href} className="resource-card-open" aria-label={`Open ${title}`} onClick={onSelect} /> :
      <button className="resource-card-open" type="button" onClick={onSelect} aria-label={`Open ${title}`} aria-pressed={!!selected} />}
    <MorphingDiv resize className="resource-card-picture">{picture || <UnigentamosIcon role={icon || "information"} size={28} />}</MorphingDiv>
    <div className="resource-card-content">
      <div className="resource-card-heading">
        <MorphingStrong className="resource-card-title" id={titleId}>{title}</MorphingStrong>
        <MorphingDiv className="resource-card-tags">
          <span className="resource-card-status" style={href ? {pointerEvents:"none"} : undefined} title={status} aria-label={status}><UnigentamosIcon role={statusIcon} size={16} /></span>
          <span className="resource-card-tag" style={href ? {pointerEvents:"none"} : undefined} title={tag}>{tag}</span>
          <span className="resource-card-pin">{actions}</span>
        </MorphingDiv>
      </div>
      {metadata && <MorphingDiv className="resource-card-details">{metadata}</MorphingDiv>}
      {description && <MorphingDiv className="resource-card-description">{description}</MorphingDiv>}
      {trailing && <MorphingDiv className="resource-card-evidence">{trailing}</MorphingDiv>}
    </div>
    {checkbox && <label className="directory-card-check"><input type="checkbox" aria-label={checkbox.label} checked={checkbox.checked} disabled={checkbox.disabled} onChange={event => checkbox.onCheckedChange(event.target.checked)} /></label>}
  </MorphingArticle>;
}
