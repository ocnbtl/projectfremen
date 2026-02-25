"use client";

import { useEffect, useMemo, useState } from "react";
import { WELCOME_LINES } from "../lib/welcome-lines";

export default function RotatingWelcome() {
  const initialIndex = useMemo(() => {
    const minuteBucket = Math.floor(Date.now() / (1000 * 60));
    return minuteBucket % WELCOME_LINES.length;
  }, []);
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % WELCOME_LINES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  return <p className="welcome-line">{WELCOME_LINES[index]}</p>;
}
