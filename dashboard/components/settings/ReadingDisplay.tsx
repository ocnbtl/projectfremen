"use client";
import { useEffect } from "react";
import { useHighContrast, useReadingSize } from "../../lib/settings/hooks";
import "./reading.css";
export default function ReadingDisplay() {
  const [size] = useReadingSize(),
    [contrast] = useHighContrast();
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.readingSize = size;
    if (contrast) root.dataset.readingContrast = "high";
    else delete root.dataset.readingContrast;
    return () => {
      delete root.dataset.readingSize;
      delete root.dataset.readingContrast;
    };
  }, [size, contrast]);
  return null;
}
