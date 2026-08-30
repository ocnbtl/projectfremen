"use client";

import { createContext, useContext, type ReactNode } from "react";

const IconSelectionContext = createContext<Readonly<Record<string, string>>>({});

export default function IconSystemProvider({
  selections,
  children
}: {
  selections: Readonly<Record<string, string>>;
  children: ReactNode;
}) {
  return <IconSelectionContext.Provider value={selections}>{children}</IconSelectionContext.Provider>;
}

export function useIconSelections() {
  return useContext(IconSelectionContext);
}
