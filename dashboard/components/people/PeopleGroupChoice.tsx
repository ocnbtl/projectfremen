"use client";
import { useState } from "react";

export default function PeopleGroupChoice({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  const [filling, setFilling] = useState(false);
  return <label className={`people-group-choice${filling ? " is-filling" : ""}`} onAnimationEnd={event => {
    if (event.target === event.currentTarget) setFilling(false);
  }}>
    <input type="checkbox" checked={checked} onChange={event => { setFilling(event.target.checked); onChange(); }} />
    <span className="people-group-fill" aria-hidden="true" />
    <span className="people-group-crest" aria-hidden="true" />
    <span className="people-group-label">{label}</span>
  </label>;
}
