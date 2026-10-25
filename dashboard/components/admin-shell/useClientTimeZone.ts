"use client";

import { useEffect, useState } from "react";

/** Match the server on the first render, then use the browser's time zone. */
export function useClientTimeZone() {
  const [timeZone, setTimeZone] = useState("UTC");
  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);
  return timeZone;
}
