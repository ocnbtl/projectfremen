"use client";

import { motionTokens } from "../../lib/design-system/motion";
import { browserPreference } from "../../lib/design-system/browser-preference";
import { MotionConfig } from "motion/react";
import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";

type Preference = "system" | "reduce";
const useBrowserMotion = browserPreference<Preference>("unigentamos:motion", "system", raw => raw === "reduce" ? "reduce" : "system", value => value);
export const useStrongFocus = browserPreference("unigentamos:strong-focus", false, raw => raw === "true", String);
const Context = createContext({
  preference: "system" as Preference,
  setPreference: (_value: Preference) => {},
});
export const useMotionPreference = () => useContext(Context);

export default function ExperienceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [preference, setPreference] = useBrowserMotion();
  const [strongFocus] = useStrongFocus();
  useEffect(() => {
    document.documentElement.toggleAttribute("data-strong-focus", strongFocus);
    return () => document.documentElement.removeAttribute("data-strong-focus");
  }, [strongFocus]);
  useEffect(() => {
    document.documentElement.dataset.productMotion = preference;
    return () => {
      delete document.documentElement.dataset.productMotion;
    };
  }, [preference]);
  return (
    <Context.Provider value={{ preference, setPreference }}>
      <MotionConfig
        transition={{
          duration: motionTokens.standard,
          ease: motionTokens.arrive,
        }}
        reducedMotion={preference === "reduce" ? "always" : "user"}
      >
        {children}
      </MotionConfig>
    </Context.Provider>
  );
}
