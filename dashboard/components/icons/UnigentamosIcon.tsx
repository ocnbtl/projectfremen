"use client";

import type { CSSProperties } from "react";
import { getIconEntry, isIconCandidate } from "../../lib/icons/icon-registry";
import { useIconSelections } from "./IconSystemProvider";

export default function UnigentamosIcon({
  role,
  candidate,
  className,
  size = 24,
  color,
  style,
  title
}: {
  role: string;
  candidate?: string;
  className?: string;
  size?: number | string;
  color?: string;
  style?: CSSProperties;
  title?: string;
}) {
  const selections = useIconSelections();
  const entry = getIconEntry(role);
  const requested = candidate || selections[entry.id] || entry.defaultCandidate;
  const resolved = isIconCandidate(entry.id, requested) ? requested : entry.defaultCandidate;
  const iconStyle = color ? { ...style, color } : style;

  return (
    <svg
      className={["unigentamos-icon", className].filter(Boolean).join(" ")}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      style={iconStyle}
      data-icon-role={entry.id}
      data-icon-candidate={resolved}
    >
      {title ? <title>{title}</title> : null}
      <use href={`/tabler-line-sprite.svg#tabler-${resolved}`} />
    </svg>
  );
}
