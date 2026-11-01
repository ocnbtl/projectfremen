"use client";
import { createContext } from "react";
import type { EventOccurrence } from "../../lib/modules/planning/types";
import type { NativeObjectRef } from "../../lib/native-objects/types";
export const CalendarLinkedWorkContext = createContext<((event: EventOccurrence, ref?: NativeObjectRef) => void) | undefined>(undefined);
