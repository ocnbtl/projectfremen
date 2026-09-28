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
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return <AnimatedLandingPage hasError={params.error === "1"} errorPath="/" />;
}
