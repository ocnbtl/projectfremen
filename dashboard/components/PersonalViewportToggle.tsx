"use client";

import { useEffect, useState } from "react";

type PreviewMode = "desktop" | "mobile";

const STORAGE_KEY = "personal-preview-mode";

function getDefaultMode(): PreviewMode {
  if (typeof window === "undefined") {
    return "desktop";
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "desktop" || stored === "mobile") {
    return stored;
  }
  return window.matchMedia("(max-width: 760px)").matches ? "mobile" : "desktop";
}

export default function PersonalViewportToggle() {
  const [mode, setMode] = useState<PreviewMode>("desktop");

  useEffect(() => {
    const next = getDefaultMode();
    setMode(next);
    document.documentElement.dataset.personalPreview = next;
  }, []);

  function toggleMode() {
    setMode((current) => {
      const next = current === "desktop" ? "mobile" : "desktop";
      document.documentElement.dataset.personalPreview = next;
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }

  const isMobile = mode === "mobile";

  return (
    <button
      type="button"
      className="personal-preview-toggle"
      onClick={toggleMode}
      aria-label={`Switch to ${isMobile ? "desktop" : "mobile"} preview mode`}
      title={`Viewing ${isMobile ? "mobile" : "desktop"} mode`}
    >
      <span className={`personal-preview-toggle-icon ${isMobile ? "is-mobile" : "is-desktop"}`} />
      <span>{isMobile ? "Mobile" : "Desktop"}</span>
    </button>
  );
}
