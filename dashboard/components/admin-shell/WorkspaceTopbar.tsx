"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useWorkspaceReturn } from "./useWorkspaceReturn";

type Topbar = {
  search: HTMLDivElement | null;
  actions: HTMLDivElement | null;
  setSearch: (node: HTMLDivElement | null) => void;
  setActions: (node: HTMLDivElement | null) => void;
};
export const WorkspaceTopbarContext = createContext<Topbar | null>(null);
export function WorkspaceTopbarProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState<HTMLDivElement | null>(null);
  const [actions, setActions] = useState<HTMLDivElement | null>(null);
  useWorkspaceReturn(search);
  return <WorkspaceTopbarContext.Provider value={{ search, actions, setSearch, setActions }}>{children}</WorkspaceTopbarContext.Provider>;
}
export function WorkspaceNavSlot({ kind, children }: { kind: "search" | "actions"; children: ReactNode }) {
  const bar = useContext(WorkspaceTopbarContext);
  return bar?.[kind] ? createPortal(children, bar[kind]) : children;
}
