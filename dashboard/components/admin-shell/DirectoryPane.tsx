import type { ReactNode } from "react";

export type DirectoryPaneProps = {
  title?: ReactNode;
  description?: ReactNode;
  toolbar?: ReactNode;
  selectionBar?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  ariaLabel?: string;
  className?: string;
};

export default function DirectoryPane({
  title,
  description,
  toolbar,
  selectionBar,
  children,
  footer,
  busy = false,
  ariaLabel = "Directory",
  className
}: DirectoryPaneProps) {
  return (
    <section
      className={["directory-pane", className].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
    >
      {(title || description || toolbar) && (
        <header className="directory-pane__header">
          {(title || description) && (
            <div className="directory-pane__heading">
              {typeof title === "string" ? <h1>{title}</h1> : title}
              {typeof description === "string" ? <p>{description}</p> : description}
            </div>
          )}
          {toolbar && <div className="directory-pane__toolbar">{toolbar}</div>}
        </header>
      )}
      {selectionBar && <div className="directory-pane__selection-bar">{selectionBar}</div>}
      <div className="directory-pane__content">{children}</div>
      {footer && <footer className="directory-pane__footer">{footer}</footer>}
    </section>
  );
}

