"use client";

import { useLayoutEffect, useMemo, type ReactNode } from "react";
import { useIconSelections } from "../icons/IconSystemProvider";
import { useMotionPreference } from "./ExperienceProvider";
import { useNavigationHost } from "./NavigationHost";
import AppTopNavSurface from "./AppTopNavSurface";

export type AppTopNavProps = {
  showCommandSearch?: boolean;
  onCommandSearch?: (query: string) => void;
  commandSearchDisabledReason?: string;
  rightSlot?: ReactNode;
  className?: string;
};

export default function AppTopNav(props: AppTopNavProps) {
  const register = useNavigationHost();
  const selections = useIconSelections();
  const { preference } = useMotionPreference();
  const registration = useMemo(() => ({ ...props, selections, reduceMotion: preference === "reduce" }), [
    props.showCommandSearch, props.onCommandSearch, props.commandSearchDisabledReason,
    props.rightSlot, props.className, selections, preference,
  ]);
  useLayoutEffect(() => { register?.(registration); }, [register, registration]);
  return register ? null : <AppTopNavSurface {...registration} />;
}
