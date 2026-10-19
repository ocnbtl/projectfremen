import type { TravelKind, TravelStatus } from "./travel";

/** Shared by saved rows, filters, status controls and destination pickers. */
export const travelKindIcons: Record<TravelKind, string> = {
  country: "travel-kind-country", state: "travel-kind-state", city: "travel-kind-city",
  landmark: "travel-kind-landmark", park: "travel-kind-park"
};
export const travelStatusIcons: Record<TravelStatus, string> = {
  visited: "travel-status-visited", lived: "travel-status-lived", want: "travel-status-want", going: "travel-status-going"
};
