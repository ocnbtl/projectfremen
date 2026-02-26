import AnimatedLandingPage from "../../../components/AnimatedLandingPage";

export default async function AdminLoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <AnimatedLandingPage
      hasError={params.error === "1"}
      errorPath="/admin/login"
      showBackLink
    />
  );
}
