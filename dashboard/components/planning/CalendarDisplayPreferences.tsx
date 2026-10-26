"use client";
import { createContext, useContext, useEffect, useState } from "react";

export const defaultCalendarDetails = { time: true, address: true, people: true, objects: true };
export const CalendarDisplayContext = createContext(defaultCalendarDetails);
export const useCalendarDetails = () => useContext(CalendarDisplayContext);
const key = "unigentamos.calendar.details.v1";

export function useCalendarDisplayPreferences() {
  const [details, setDetails] = useState(defaultCalendarDetails), [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "{}");
      setDetails(Object.fromEntries(Object.entries(defaultCalendarDetails).map(([name, fallback]) => [name, typeof saved?.[name] === "boolean" ? saved[name] : fallback])) as typeof defaultCalendarDetails);
    } catch { /* Storage may be unavailable; display controls still work for this visit. */ }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) { try { localStorage.setItem(key, JSON.stringify(details)); } catch {} } }, [details, loaded]);
  return [details, setDetails] as const;
}
