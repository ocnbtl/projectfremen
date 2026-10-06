import type { EventOccurrence } from "../../lib/modules/planning/types";
import UnigentamosIcon from "../icons/UnigentamosIcon";

/** Holiday identity follows the selected country, including in compact previews. */
export default function EventGlyph({ event, icon, size = 18 }: { event: EventOccurrence; icon?: string; size?: number }) {
  if (event.system?.kind === "holiday" && event.system.country) return <svg width={size + 5} height={size} viewBox="0 0 513 342" aria-hidden="true" data-holiday-flag={event.system.country}><use href={`/country-flags.svg#flag-${event.system.country}`} /></svg>;
  return <UnigentamosIcon role={event.system ? event.system.kind === "birthday" ? "birthday" : "star" : icon || "interaction-date"} size={size} />;
}
