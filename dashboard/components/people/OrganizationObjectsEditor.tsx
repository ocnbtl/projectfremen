"use client";

import type { NativeObjectRef } from "../../lib/native-objects/types";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import PeopleObjectPicker, { objectTargetKey, objectTargetIcon, objectTargetTypeLabel } from "./PeopleObjectPicker";

export type OrganizationObjectRow = { object: NativeObjectRef; detail?: string; onRemove?: () => void };

export default function OrganizationObjectsEditor({ targets, objects, onAdd, disabled }: {
  targets: NativeObjectRef[]; objects: OrganizationObjectRow[]; onAdd: (key: string) => void; disabled: boolean;
}) {
  return <section className="people-object-create-editor people-themed-section module-ref-tone-blue" data-profile-section="objects" aria-label="Organization objects">
    <header className="people-repeatable-heading"><div className="people-repeatable-title"><span><UnigentamosIcon role="object" size={18} /></span><h4>Objects</h4></div></header>
    <div className="people-object-create-controls"><PeopleObjectPicker targets={targets} value="" onChange={onAdd} disabled={disabled} /></div>
    <p className="people-object-link-hint">Links save as you add them. Work and education connections follow the person's profile.</p>
    {objects.length > 0 && <div className="people-object-create-list" aria-label="Linked objects">
      {objects.map(({ object, detail, onRemove }) => <article key={objectTargetKey(object)} data-object-key={objectTargetKey(object)}>
        <a href={object.route} className="people-object-summary"><UnigentamosIcon role={objectTargetIcon(object)} size={20} /><span><strong>{object.label}</strong><small>{objectTargetTypeLabel(object)}{detail ? ` · ${detail}` : ""}</small></span></a>
        {onRemove ? <button type="button" className="people-object-unlink" aria-label={`Unlink ${object.label}`} title={`Unlink ${object.label}`} disabled={disabled} onClick={onRemove}><UnigentamosIcon role="close" size={16} /></button>
          : <a className="people-object-unlink" href={object.route} aria-label={`Open ${object.label}`} title={`Open ${object.label}`}><UnigentamosIcon role="chevron-right" size={16} /></a>}
      </article>)}
    </div>}
  </section>;
}
