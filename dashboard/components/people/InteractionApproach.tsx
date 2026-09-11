"use client";
import type { CSSProperties } from "react";

const choices = [{ value: "", label: "Unspecified" }, { value: "cold", label: "Cold" }, { value: "warm", label: "Warm" }] as const;
export default function InteractionApproach({ value, onChange }: { value: "" | "cold" | "warm"; onChange: (value: "" | "cold" | "warm") => void }) {
  return <fieldset className="people-interaction-approach"><legend>Approach</legend>
    <div role="radiogroup" aria-label="Approach" className="people-approach-switch" style={{ "--approach-index": choices.findIndex(choice => choice.value === value) } as CSSProperties}>
      <span className="people-approach-selection" aria-hidden="true" />
      {choices.map((choice, index) => <button key={choice.value} type="button" role="radio" aria-checked={value === choice.value} tabIndex={value === choice.value ? 0 : -1}
        onClick={() => onChange(choice.value)} onKeyDown={event => {
          const offset = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
          if (!offset && !["Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + offset + 3) % 3;
          onChange(choices[next].value);
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
        }}>{choice.label}</button>)}
    </div>
  </fieldset>;
}
