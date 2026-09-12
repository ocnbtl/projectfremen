import UnigentamosIcon from "../icons/UnigentamosIcon";

const types: Record<string, { label: string; icon: string }> = {
  call: { label: "Call", icon: "interaction-call" },
  message: { label: "Message", icon: "interaction-message" },
  email: { label: "Email", icon: "interaction-email" },
  meeting: { label: "Meeting", icon: "interaction-meeting" },
  "catch-up": { label: "Catch-up", icon: "interaction-catch-up" },
  note: { label: "Note", icon: "interaction-note" },
  memory: { label: "Memory", icon: "interaction-memory" },
  milestone: { label: "Milestone", icon: "interaction-milestone" }
};

export default function InteractionTypeBadge({ kind, detail = false }: { kind: string; detail?: boolean }) {
  const normalized = kind.trim().toLowerCase().replace(/\s+/g, "-");
  const type = types[normalized];
  const label = type?.label || (kind.trim() ? kind.trim()[0].toUpperCase() + kind.trim().slice(1) : "Interaction");
  return (
    <span className={`people-interaction-type${detail ? " is-detail" : ""}`} data-interaction-kind={normalized || "other"}>
      <UnigentamosIcon role={type?.icon || "interaction-history"} size={detail ? 20 : 14} />
      <span>{label}</span>
    </span>
  );
}
