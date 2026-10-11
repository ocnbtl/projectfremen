"use client";
import { createContext, useContext } from "react";
import type { EventOccurrence, Place } from "../../lib/modules/planning/types";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import { formatPlaceAddress } from "../../lib/modules/planning/place-address";
import { eventObjectRefs } from "./EventObjects";
import EventDetail from "./EventDetail";

export const CalendarPlacesContext = createContext<Place[]>([]);

export function useEventPlace(event: EventOccurrence, available: NativeObjectRef[]) {
  const places = useContext(CalendarPlacesContext);
  const ref = eventObjectRefs(event, available).find(item => item.module === "map" && item.objectType === "place");
  const saved = places.find(place => place.id === (event.placeId || ref?.objectId));
  const name = saved?.name || ref?.label || event.location;
  const address = saved?.address || (saved?.addressParts ? formatPlaceAddress(saved.addressParts, saved.countryCode || "US") : "") || event.location;
  return name ? { name, address: address?.trim().toLowerCase() === name.trim().toLowerCase() ? "" : address } : undefined;
}

export default function EventPlaceDetail({ event, available, compact = true }: { event: EventOccurrence; available: NativeObjectRef[]; compact?: boolean }) {
  const place = useEventPlace(event, available);
  return place ? <EventDetail kind="place" text={place.name} address={place.address} eventTitle={event.title} compact={compact} /> : null;
}
