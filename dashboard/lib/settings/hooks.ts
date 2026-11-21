"use client";
import { useSyncExternalStore } from "react";
import { browserPreference } from "../design-system/browser-preference";
import { dailyDefaults } from "./preferences";
import { readDeviceDaily, subscribeDaily } from "./device";
export const useDailyPreferences = () =>
  useSyncExternalStore(subscribeDaily, readDeviceDaily, () => dailyDefaults);
export const useReadingSize = browserPreference<"standard" | "large" | "larger">(
  "unigentamos.settings.reading-size",
  "standard",
  (value) => (value === "large" || value === "larger" ? value : "standard"),
  String,
);
export const useHighContrast = browserPreference(
  "unigentamos.settings.high-contrast",
  false,
  (value) => value === "true",
  String,
);
