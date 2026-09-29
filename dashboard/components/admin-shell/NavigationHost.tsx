"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import IconSystemProvider from "../icons/IconSystemProvider";
import type { AppTopNavProps } from "./AppTopNav";

const Navigation = dynamic(() => import("./AppTopNavSurface"));
type Registration = AppTopNavProps & {
  selections: Readonly<Record<string, string>>;
  reduceMotion: boolean;
};
const NavigationContext = createContext<((value: Registration) => void) | null>(null);
export const useNavigationHost = () => useContext(NavigationContext);

/** Keep the logo and selection indicator alive across authenticated routes. */
export default function NavigationHost({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [registration, register] = useState<Registration | null>(null);
  const authenticatedRoute = ((pathname === "/admin" || pathname.startsWith("/admin/"))
    && pathname !== "/admin/login") || pathname === "/vault";
  const selections = useMemo(() => registration?.selections || {}, [registration?.selections]);
  return (
    <NavigationContext.Provider value={register}>
      {children}
      {registration && authenticatedRoute && (
        <IconSystemProvider selections={selections}>
          <Navigation {...registration} />
        </IconSystemProvider>
      )}
    </NavigationContext.Provider>
  );
}
