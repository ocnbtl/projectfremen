import type { ReactNode } from "react";
import ReadingDisplay from "../../components/settings/ReadingDisplay";
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ReadingDisplay />
      {children}
    </>
  );
}
