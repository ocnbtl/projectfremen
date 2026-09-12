"use client";
import UnigentamosIcon from "../icons/UnigentamosIcon";

/** The composer control for whether an interaction updates latest contact. */
export default function InteractionCheckbox({ checked, onChange, label = "Use this as the latest contact date" }: {
  checked: boolean; onChange?: (checked: boolean) => void; label?: string;
}) {
  const content = <><span className="people-interaction-checkmark" aria-hidden="true"><UnigentamosIcon role="check" size={14} /></span><span>{label}</span></>;
  return onChange
    ? <label className="people-interaction-checkbox"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />{content}</label>
    : <div className="people-interaction-checkbox is-readonly" role="checkbox" aria-checked={checked} aria-readonly="true" aria-label={label}>{content}</div>;
}
