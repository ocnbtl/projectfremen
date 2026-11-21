"use client";
import { createContext, useContext } from "react";
import { browserPreference } from "../../lib/design-system/browser-preference";

export const defaultCalendarDetails = { time: true, address: true, people: true, objects: true };
export const CalendarDisplayContext = createContext(defaultCalendarDetails);
export const useCalendarDetails = () => useContext(CalendarDisplayContext);

export const useCalendarDisplayPreferences = browserPreference(
  "unigentamos.calendar.details.v1", defaultCalendarDetails, raw => {
    const saved = JSON.parse(raw);
    return Object.fromEntries(Object.entries(defaultCalendarDetails).map(([key, fallback]) =>
      [key, typeof saved?.[key] === "boolean" ? saved[key] : fallback])) as typeof defaultCalendarDetails;
  }, JSON.stringify
);

export const useMapPinPreference = browserPreference<"icons" | "images">(
  "map:pin-display", "icons", raw => raw === "images" ? "images" : "icons", value => value
);
