import type { CSSProperties } from "react";

/** Keep the entire rectangular mark inside a circular avatar, including its corners. */
export const organizationLogoStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  objectFit: "contain",
  objectPosition: "center",
  padding: "15%",
  boxSizing: "border-box",
  background: "white",
};
