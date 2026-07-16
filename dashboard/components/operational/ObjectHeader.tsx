import type { ReactNode } from "react";

export type ObjectHeaderProps = {
  objectType: string;
  title: ReactNode;
  subtitle?: ReactNode;
  identity?: ReactNode;
  states?: ReactNode;
  metadata?: ReactNode;
  actions?: ReactNode;
  headingLevel?: "h1" | "h2";
  className?: string;
};

export default function ObjectHeader({
  objectType,
  title,
  subtitle,
  identity,
  states,
  metadata,
  actions,
  headingLevel = "h1",
  className
}: ObjectHeaderProps) {
  const Heading = headingLevel;
  return (
    <header className={["object-header", className].filter(Boolean).join(" ")}>
      <div className="object-header__identity">
        {identity && <div className="object-header__avatar" aria-hidden="true">{identity}</div>}
        <div className="object-header__heading">
          <span className="object-header__type">{objectType}</span>
          <Heading>{title}</Heading>
          {subtitle && <div className="object-header__subtitle">{subtitle}</div>}
        </div>
      </div>
      {(states || actions) && (
        <div className="object-header__controls">
          {states && <div className="object-header__states" aria-label="Object states">{states}</div>}
          {actions && <div className="object-header__actions">{actions}</div>}
        </div>
      )}
      {metadata && <div className="object-header__metadata">{metadata}</div>}
    </header>
  );
}
