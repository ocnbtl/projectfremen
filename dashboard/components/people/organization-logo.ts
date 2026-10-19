import type { CSSProperties } from "react";

/** Organization pictures fill their frame just like other profile pictures. */
export const organizationLogoStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "center",
  padding: 0,
  boxSizing: "border-box",
  background: "transparent",
};
