"use client";

import { DirectoryLayout, MorphingArticle, MorphingDiv, MorphingStrong } from "../ui/DirectoryLayout";
import { PeopleProfileAvatar } from "../people/PeopleProfilePhoto";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import type { ProjectDirectoryItem } from "../../lib/modules/projects/view-model";
import type { ProjectLifecycleState } from "../../lib/modules/projects/types";
import styles from "./ProjectDirectoryCards.module.css";

const STATUS_ICONS: Record<ProjectLifecycleState, string> = {
  draft: "edit", idea: "calendar-group-brain", planned: "calendar", developing: "build",
  active: "active", monitoring: "show", dormant: "dormant", complete: "review", archived: "archive"
};

function initials(name: string) {
  return name.replace(/^Project\s+/i, "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]?.toUpperCase()).join("") || "PR";
}

function objectivePreview(item: ProjectDirectoryItem) {
  const objectives = item.project.objectives.map(objective => ({ id: objective.id, text: objective.text, completed: Boolean(objective.completedAt) }));
  if (!objectives.length && item.project.objective?.trim()) objectives.push({ id: "current-objective", text: item.project.objective, completed: false });
  const seen = new Set(objectives.map(objective => objective.text.trim().toLowerCase()));
  for (const context of item.linkedContext) {
    if (!["objective", "goal"].includes(context.ref.objectType) || !context.ref.label?.trim() || seen.has(context.ref.label.trim().toLowerCase())) continue;
    objectives.push({ id: `${context.ref.module}:${context.ref.objectId}`, text: context.ref.label, completed: context.legacyStatus === "complete" });
    seen.add(context.ref.label.trim().toLowerCase());
  }
  return objectives.slice(0, 3);
}

export default function ProjectDirectoryCards({ items, view, selectedId, busy, timeZone, onSelect, onToggleStar }: {
  items: ProjectDirectoryItem[];
  view: "comfortable" | "compact" | "grid";
  selectedId?: string;
  busy: boolean;
  timeZone: string;
  onSelect: (item: ProjectDirectoryItem) => void;
  onToggleStar: (item: ProjectDirectoryItem) => void;
}) {
  const date = (value?: string) => value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("en-US", { timeZone, month: "2-digit", day: "2-digit", year: "2-digit" }).format(new Date(value)) : "—";
  return <DirectoryLayout view={view} className={styles.directory} data-has-objectives={items.some(item => objectivePreview(item).length > 0)} role="list" aria-label="Projects">
    {items.map(item => {
      const project = item.project;
      const titleId = `project-card-${project.id}-title`;
      const status = project.lifecycle[0].toUpperCase() + project.lifecycle.slice(1);
      const objectCount = new Set(item.linkedContext.map(({ ref }) => `${ref.module}:${ref.objectType}:${ref.objectId}`)).size;
      const attention = item.attentionReasons.find(reason => /overdue.*milestone/i.test(reason))
        || item.attentionReasons.find(reason => /overdue/i.test(reason))
        || item.attentionReasons.find(reason => !/objectives.*not defined/i.test(reason));
      const objectives = objectivePreview(item);
      return <MorphingArticle key={project.id} className={`resource-directory-card ${styles.card}`} role="listitem" aria-labelledby={titleId} data-selected={selectedId === project.id || undefined}>
        <button type="button" className="resource-card-open" aria-label={`Open ${project.name}`} aria-pressed={selectedId === project.id} onClick={() => onSelect(item)} />
        <MorphingDiv resize className={`resource-card-picture ${styles.picture}`}>
          {project.photoUpdatedAt ? <PeopleProfileAvatar initials={initials(project.name)} label={project.name} photoUrl={`/api/projects/photos/${encodeURIComponent(project.id)}`} photoUpdatedAt={project.photoUpdatedAt} /> : <span aria-hidden="true">{initials(project.name)}</span>}
        </MorphingDiv>
        <MorphingStrong id={titleId} className={`resource-card-title ${styles.title}`} title={project.name}>{project.name}</MorphingStrong>
        <MorphingDiv className={`resource-card-tags ${styles.controls}`}>
          <span className={styles.status} title={status}><span className="resource-card-status"><UnigentamosIcon role={STATUS_ICONS[project.lifecycle]} size={16} /></span><span>{status}</span></span>
          <span className={styles.count} title={`${objectCount} linked object${objectCount === 1 ? "" : "s"}, including people`}><UnigentamosIcon role="object" size={14} /><span>{objectCount}<span className={styles.countLabel}> object{objectCount === 1 ? "" : "s"}</span></span></span>
          <span className={`resource-card-pin ${styles.star}`}><button type="button" onClick={() => onToggleStar(item)} disabled={!project.editable || busy || ["complete", "archived"].includes(project.lifecycle)} aria-label={project.starred ? "Remove star" : "Star project"} aria-pressed={project.starred} data-active={project.starred || undefined}><UnigentamosIcon role="star" size={16} /></button></span>
        </MorphingDiv>
        <MorphingDiv className={`resource-card-details ${styles.dates}`}>
          <span title={project.createdAt || "Created date not recorded"}><UnigentamosIcon role="calendar" size={13} /><span>Created <time dateTime={project.createdAt}>{date(project.createdAt)}</time></span></span>
          <span title={project.updatedAt || "Edited date not recorded"}><UnigentamosIcon role="edit" size={13} /><span>Edited <time dateTime={project.updatedAt}>{date(project.updatedAt)}</time></span></span>
        </MorphingDiv>
        <MorphingDiv className={`resource-card-signal ${styles.signal}`}>
          {attention && <span data-attention={/overdue|blocker/i.test(attention) || undefined} title={attention}><UnigentamosIcon role={/overdue|blocker/i.test(attention) ? "warning" : "information"} size={14} /><span>{attention.replace(/\.$/, "")}</span></span>}
        </MorphingDiv>
        <MorphingDiv className={`resource-card-description ${styles.description}`}>{project.description || <span aria-hidden="true">&nbsp;</span>}</MorphingDiv>
        <MorphingDiv className={styles.objectives}>
          {objectives.length > 0 && <><span className={styles.objectiveLabel}>Objectives</span><ul aria-label="Project objectives preview">{objectives.map(objective => <li key={objective.id} title={objective.text} data-completed={objective.completed || undefined}><UnigentamosIcon role={objective.completed ? "check" : "goal"} size={13} /><span>{objective.text}</span></li>)}</ul></>}
        </MorphingDiv>
      </MorphingArticle>;
    })}
  </DirectoryLayout>;
}
