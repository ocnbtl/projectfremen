"use client";
import { Fragment, useState, type ReactNode } from "react";
import { useWritingPreferences } from "../../lib/writing/preferences";
import { parseWriting, writingContext, type WritingPart } from "../../lib/writing/tokens";
import styles from "./WritingText.module.css";
import { MODULE_COLOR_SYSTEM } from "../../lib/design-system/color-system";
import UnigentamosIcon from "../icons/UnigentamosIcon";

export function WritingCopy({ text, label = "Copy prompt" }: { text: string; label?: string }) {
  const [result, setResult] = useState<"idle" | "copied" | "manual">("idle");
  return <span className={styles.copyWrap}>
    <button type="button" className={styles.copy} disabled={!text} onBlur={() => { if (result === "copied") setResult("idle"); }}
      onClick={async event => {
        event.stopPropagation();
        try { await navigator.clipboard.writeText(text); setResult("copied"); }
        catch { setResult("manual"); }
      }}><UnigentamosIcon role={result === "copied" ? "check" : "copy"} size={14}/> <span aria-live="polite">{result === "copied" ? "Copied" : label}</span></button>
    {result === "manual" && <textarea aria-label="Text to copy" readOnly value={text} autoFocus
      onFocus={event => event.target.select()} onBlur={() => setResult("idle")} />}
  </span>;
}

type Mark = Exclude<WritingPart, { kind: "text" }>;
export function WritingMark({ part, source, context }: { part: Mark; source: string; context?: string }) {
  const prefs = useWritingPreferences();
  const [missing, setMissing] = useState(false);
  if (part.kind === "skill") {
    const skill = prefs.skills.find(entry => entry.id === part.id);
    if ((skill?.behavior ?? part.action ?? (part.id === "copy-prompt" ? "copy" : "collection")) === "copy") {
      return <WritingCopy text={context ?? writingContext(source, part.offset, prefs.skills.filter(entry => entry.behavior === "collection").map(entry => entry.id))} label={skill?.name ?? part.label} />;
    }
    return <a className={styles.skill} href={part.href} onClick={event => event.stopPropagation()}>{skill?.name ?? part.label}</a>;
  }
  const mediaRoute = prefs.mediaEmbeds && part.module === "media" && !missing ? new URL(part.href, "https://workspace.invalid") : null;
  const id = mediaRoute?.searchParams.get("selected") || mediaRoute?.pathname.match(/^\/admin\/media\/([^/]+)$/)?.[1];
  return <a className={styles.object} style={{color:MODULE_COLOR_SYSTEM[part.module].primary[600]}} href={part.href} onClick={event => event.stopPropagation()}>
    {id && <img key={id} alt="" loading="lazy" src={"/api/personal/canvas/thumbnail?id=" + encodeURIComponent(id)} onError={() => setMissing(true)} />}
    {part.label}
  </a>;
}

export function WritingText({ text, context, className }: { text?: string | null; context?: string; className?: string }) {
  const result = !text?.includes("](/admin/") ? text : parseWriting(text).map((part, index) =>
    part.kind === "text" ? <Fragment key={index}>{part.text}</Fragment> : <WritingMark key={part.raw + index} part={part} source={text} context={context} />);
  return className ? <span className={className}>{result}</span> : <>{result}</>;
}

export function WritingValue({ children }: { children: ReactNode }) {
  return typeof children === "string" && children.includes("](/admin/") ? <WritingText text={children} /> : <>{children}</>;
}
