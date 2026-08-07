import Link from "next/link";

export default function OfflinePage() {
  return (
    <main style={{ maxWidth: 720, margin: "10vh auto", padding: 24, fontFamily: "Inter, sans-serif" }}>
      <p style={{ color: "#4d6b63", textTransform: "uppercase", letterSpacing: ".12em", fontSize: 12 }}>Offline</p>
      <h1>Unigentamos cannot reach the internet.</h1>
      <p>Your encrypted local vault remains on this device. Open the vault workspace to unlock locally stored data and queue changes for the next connection.</p>
      <Link href="/vault">Open encrypted vault</Link>
    </main>
  );
}
