"use client";

import { Children, isValidElement, useLayoutEffect, useRef, useState, type ChangeEvent, type ReactNode, type SelectHTMLAttributes } from "react";
import * as Select from "@radix-ui/react-select";
import UnigentamosIcon from "../icons/UnigentamosIcon";

const EMPTY = "__unigentamos_empty_selection__";
type OptionProps = { value?: string | number; disabled?: boolean; label?: string; children?: ReactNode };

/** Shared, portaled field menu with native form participation and managed keyboard focus. */
export default function SelectField({ value, defaultValue, onChange, children, className, disabled, required, name, id, ...attributes }: SelectHTMLAttributes<HTMLSelectElement>) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [fieldLabel, setFieldLabel] = useState<string>();
  useLayoutEffect(() => {
    // A button's own value participates in an implicit label; keep the field name stable.
    const label = triggerRef.current?.closest("label")?.cloneNode(true) as HTMLElement | undefined;
    label?.querySelectorAll("button, select, input, textarea").forEach((node) => node.remove());
    setFieldLabel(label?.getAttribute("aria-label") || label?.textContent?.trim() || undefined);
  }, []);
  let placeholder: ReactNode = "Select…";
  const renderOptions = (nodes: ReactNode): ReactNode => Children.map(nodes, (node) => {
    if (!isValidElement<OptionProps>(node)) return null;
    if (node.type === "optgroup") return <Select.Group><Select.Label className="app-select-label">{node.props.label}</Select.Label>{renderOptions(node.props.children)}</Select.Group>;
    if (node.type !== "option") return renderOptions(node.props.children);
    const optionValue = String(node.props.value ?? node.props.children ?? "");
    if (!optionValue) placeholder = node.props.children;
    return <Select.Item className="app-select-item" data-select-value={optionValue} value={optionValue || EMPTY} disabled={node.props.disabled}>
      <Select.ItemText>{node.props.children}</Select.ItemText>
      <Select.ItemIndicator><UnigentamosIcon role="check" size={16} /></Select.ItemIndicator>
    </Select.Item>;
  });
  const options = renderOptions(children);
  const dataAttributes = Object.fromEntries(Object.entries(attributes).filter(([key]) => key.startsWith("data-") || key.startsWith("aria-")));
  return <Select.Root value={value === undefined ? undefined : String(value)} defaultValue={defaultValue === undefined ? undefined : String(defaultValue)}
    disabled={disabled} required={required} name={name} onValueChange={(next) => {
      // Radix's hidden native select can emit an empty value while options change.
      // Only the explicit placeholder item may clear the controlled field.
      if (!next) return;
      const chosen = next === EMPTY ? "" : next;
      onChange?.({ target: { value: chosen }, currentTarget: { value: chosen } } as ChangeEvent<HTMLSelectElement>);
    }}>
    <Select.Trigger {...dataAttributes} data-value={value} ref={triggerRef} id={id} aria-label={attributes["aria-label"] || fieldLabel} className={`app-select-trigger ${className || ""}`} title={attributes.title} aria-required={required || undefined}>
      <Select.Value placeholder={placeholder} /><Select.Icon><UnigentamosIcon role="chevron-down" size={16} /></Select.Icon>
    </Select.Trigger>
    <Select.Portal><Select.Content className="app-select-menu" position="popper" sideOffset={6} collisionPadding={12} onEscapeKeyDown={(event) => event.stopImmediatePropagation()}>
      <Select.ScrollUpButton className="app-select-scroll">↑</Select.ScrollUpButton>
      <Select.Viewport>{options}</Select.Viewport>
      <Select.ScrollDownButton className="app-select-scroll">↓</Select.ScrollDownButton>
    </Select.Content></Select.Portal>
  </Select.Root>;
}
