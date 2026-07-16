"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type DenseObjectRowCheckbox = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
};

export type DenseObjectRowProps = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  metadata?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  href?: string;
  checkbox?: DenseObjectRowCheckbox;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
};

export default function DenseObjectRow({
  id,
  title,
  description,
  leading,
  metadata,
  trailing,
  selected = false,
  onSelect,
  href,
  checkbox,
  disabled = false,
  disabledReason,
  className
}: DenseObjectRowProps) {
  const titleId = `dense-object-row-${id}-title`;
  const descriptionId = description ? `dense-object-row-${id}-description` : undefined;
  const rowBodyClassName = ["dense-object-row__body", selected && "is-selected"].filter(Boolean).join(" ");
  const rowBody = (
    <>
      {leading && <span className="dense-object-row__leading">{leading}</span>}
      <span className="dense-object-row__content">
        <strong id={titleId}>{title}</strong>
        {description && <span id={descriptionId}>{description}</span>}
        {metadata && <span className="dense-object-row__metadata">{metadata}</span>}
      </span>
      {trailing && <span className="dense-object-row__trailing">{trailing}</span>}
    </>
  );
  const bodyUnavailable = disabled || (!href && !onSelect);
  const reason = disabledReason ?? (bodyUnavailable ? "This object cannot be opened yet." : undefined);

  return (
    <div
      className={["dense-object-row", selected && "is-selected", disabled && "is-disabled", className]
        .filter(Boolean)
        .join(" ")}
      role="listitem"
      data-selected={selected || undefined}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      {checkbox && (
        <label className="dense-object-row__checkbox">
          <input
            type="checkbox"
            checked={checkbox.checked}
            onChange={(event) => checkbox.onCheckedChange(event.target.checked)}
            aria-label={checkbox.label}
            disabled={checkbox.disabled}
          />
        </label>
      )}

      {href && !bodyUnavailable ? (
        <Link
          href={href}
          className={rowBodyClassName}
          onClick={onSelect}
          aria-current={selected ? "true" : undefined}
        >
          {rowBody}
        </Link>
      ) : (
        <button
          type="button"
          className={rowBodyClassName}
          onClick={onSelect}
          disabled={bodyUnavailable}
          aria-pressed={selected}
          aria-describedby={reason ? `dense-object-row-${id}-reason` : descriptionId}
          title={reason}
        >
          {rowBody}
          {reason && (
            <span id={`dense-object-row-${id}-reason`} className="sr-only">
              {reason}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
