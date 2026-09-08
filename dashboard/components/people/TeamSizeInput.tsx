"use client";

import { useState } from "react";
import { editTeamSize, formatTeamSize } from "../../lib/modules/people/team-size";

export default function TeamSizeInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  return <input value={editing ? value : formatTeamSize(value)} placeholder={placeholder}
    onFocus={() => { setEditing(true); onChange(editTeamSize(value)); }}
    onChange={(event) => onChange(event.target.value)}
    onBlur={() => { setEditing(false); onChange(formatTeamSize(value)); }} />;
}
