import type { CSSProperties, ReactNode } from "react";
import type { ResourceGradient } from "../../lib/modules/resources/types";
import PersonalOpsIcon, { type PersonalOpsIconName } from "../personal-ops/PersonalOpsIcon";
import styles from "./ResourceExperience.module.css";

export function resourceGradientStyle(gradient: ResourceGradient): CSSProperties {
  const colors = gradient.colors.length >= 2 ? gradient.colors : ["#193B42", "#86AEB0"];
  const stops = colors.map((color, index) => `${color} ${Math.round((index / (colors.length - 1)) * 100)}%`).join(", ");
  const focal = `${gradient.focalX}% ${gradient.focalY}%`;
  const background = gradient.pattern === "radial"
    ? `radial-gradient(circle at ${focal}, ${stops})`
    : gradient.pattern === "conic"
      ? `conic-gradient(from ${gradient.angle}deg at ${focal}, ${stops})`
      : gradient.pattern === "aurora"
        ? `radial-gradient(circle at ${focal}, ${colors[0]} 0%, transparent 48%), radial-gradient(circle at ${100 - gradient.focalX}% ${Math.min(100, gradient.focalY + 28)}%, ${colors.at(-1)} 0%, transparent 54%), linear-gradient(${gradient.angle}deg, ${stops})`
        : `linear-gradient(${gradient.angle}deg, ${stops})`;
  return { background };
}

export function ResourceMark({ gradient, className = "", label }: { gradient: ResourceGradient; className?: string; label?: string }) {
  return (
    <span
      className={[styles.resourceMark, className].filter(Boolean).join(" ")}
      style={resourceGradientStyle(gradient)}
      aria-label={label}
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
    />
  );
}

export function ResourceIconButton({
  icon,
  label,
  active = false,
  destructive = false,
  disabled = false,
  onClick,
  children
}: {
  icon: PersonalOpsIconName;
  label: string;
  active?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={styles.iconButton}
      data-active={active || undefined}
      data-destructive={destructive || undefined}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <PersonalOpsIcon name={icon} />
      {children}
    </button>
  );
}
