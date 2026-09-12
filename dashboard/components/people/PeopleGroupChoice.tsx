"use client";

export default function PeopleGroupChoice({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return <label className="people-group-choice">
    <input type="checkbox" checked={checked} onChange={onChange} />
    <span className="people-group-fill" aria-hidden="true" />
    <span className="people-group-crest" aria-hidden="true" />
    <span className="people-group-label">{label}</span>
  </label>;
}
