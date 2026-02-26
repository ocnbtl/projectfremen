import AnimatedLandingPage from "../../components/AnimatedLandingPage";

export default async function LandingPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return <AnimatedLandingPage hasError={params.error === "1"} errorPath="/landing" />;
}
