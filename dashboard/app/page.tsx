import AnimatedLandingPage from "../components/AnimatedLandingPage";
import type { Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f7f8",
  colorScheme: "light"
};

export default async function HomePage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const returnToVault = params.next === "/vault";
  return <AnimatedLandingPage hasError={params.error === "1"} errorPath={returnToVault ? "/?next=%2Fvault" : "/"} successPath={returnToVault ? "/vault" : "/admin?welcome=1"} />;
}
