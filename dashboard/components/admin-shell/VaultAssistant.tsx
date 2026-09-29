"use client";

import { useState } from "react";
import SharedAIDock from "./SharedAIDock";

export default function VaultAssistant() {
  const [open, setOpen] = useState(false);
  return <SharedAIDock open={open} onOpenChange={setOpen} context={{ module: "vault", visibleScope: "Vault", allowedActions: ["Draft a proposal", "Summarize visible context"] }} />;
}
