"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import styles from "./CopyAdPrompt.module.css";

const sourceFooter = /\r?\n\r?\nSource: Zeely · https:\/\/zeely\.ai\/start\/tools\/static-ads-fw\/#p\d+[ \t]*(?=\r?\n|$)/;

export default function CopyAdPrompt({ notes = "" }: { notes?: string }) {
  const footer = notes.match(sourceFooter);
  if (footer?.index === undefined) return null;
  const prompt = notes.slice(0, footer.index);
  return prompt.trim() ? <PromptButton key={prompt} prompt={prompt} /> : null;
}

function PromptButton({ prompt }: { prompt: string }) {
  const [result, setResult] = useState<"idle" | "copied" | "manual">("idle");
  const manual = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (result === "manual") {
      manual.current?.focus();
      manual.current?.select();
    } else if (result === "copied") {
      const timer = setTimeout(() => setResult("idle"), 2500);
      return () => clearTimeout(timer);
    }
  }, [result]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setResult("copied");
    } catch {
      setResult("manual");
      manual.current?.focus();
      manual.current?.select();
    }
  }

  return (
    <div className={styles.control}>
      <button className={styles.button} type="button" onClick={copy} aria-label="Copy prompt">
        {result === "copied" ? <IconCheck size={15} aria-hidden /> : <IconCopy size={15} aria-hidden />}
        {result === "copied" ? "Copied" : "Copy prompt"}
      </button>
      <span role="status" className={result === "manual" ? styles.hint : styles.announcement}>
        {result === "copied" && "Prompt copied."}
        {result === "manual" && "Use your device’s Copy command on the selected prompt."}
      </span>
      {result === "manual" && <textarea ref={manual} aria-label="Prompt to copy" rows={3} readOnly value={prompt} />}
    </div>
  );
}
