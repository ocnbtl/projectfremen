"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { pinOrder, type DailyPreferences } from "../../lib/settings/preferences";
export const destinations = [
  ["records", "Records"],
  ["media", "Media"],
  ["settings", "Settings"],
  ["notifications", "Notifications"],
] as const;
export default function AccountNav({
  id,
  prefs,
  active,
}: {
  id: string;
  prefs: DailyPreferences;
  active: string;
}) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const q = matchMedia("(max-width:760px)");
    const watch = () => setMobile(q.matches);
    watch();
    q.addEventListener("change", watch);
    return () => q.removeEventListener("change", watch);
  }, []);
  const links = pinOrder(
    destinations.map(([href, label]) => ({ href, label })),
    mobile ? prefs.accountMobilePins : prefs.accountPins,
  );
  const url = (key: string) =>
    key === "settings" || key === "notifications"
      ? "/account/preferences/" + (key === "settings" ? "home" : "notifications") + "?workspace=" + id
      : "/account/workspaces/" + id + "?tab=" + key;
  return (
    <nav aria-label="Workspace sections">
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={url(href)}
          prefetch={false}
          aria-current={active === href ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
