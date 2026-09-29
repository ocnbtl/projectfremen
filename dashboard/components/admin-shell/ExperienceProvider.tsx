"use client";

import { motionTokens } from "../../lib/design-system/motion";
import { MotionConfig } from "motion/react";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Preference = "system" | "reduce";
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
  const [preference, setPreference] = useState<Preference>("system");
  useEffect(() => {
    try {
      if (localStorage.getItem("unigentamos:motion") === "reduce")
        setPreference("reduce");
    } catch {
      /* Storage is optional. */
    }
  }, []);
  useEffect(() => {
    document.documentElement.dataset.productMotion = preference;
    return () => {
      delete document.documentElement.dataset.productMotion;
    };
  }, [preference]);
  function update(value: Preference) {
    setPreference(value);
    try {
      localStorage.setItem("unigentamos:motion", value);
    } catch {
      /* Session preference still works. */
    }
  }
  return (
    <Context.Provider value={{ preference, setPreference: update }}>
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
