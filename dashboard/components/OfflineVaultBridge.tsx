"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function OfflineVaultBridge() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const refresh = () => setOnline(navigator.onLine);
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, []);

  if (online) return null;
  return (
    <aside style={{
      position: "fixed",
      zIndex: 110,
      top: 78,
      left: "50%",
      translate: "-50% 0",
      width: "min(680px, calc(100vw - 32px))",
      padding: "10px 14px",
      border: "1px solid rgba(19, 91, 80, .2)",
      borderRadius: 12,
      background: "#f4fbf8",
      boxShadow: "0 12px 30px rgba(19, 50, 45, .12)",
      color: "#174b43",
      fontSize: 13,
      textAlign: "center"
    }} role="status">
      You’re offline. <Link href="/vault" style={{ color: "inherit", fontWeight: 800 }}>Keep working in your encrypted Vault →</Link>
    </aside>
  );
}
