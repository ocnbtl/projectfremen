import AnimatedLandingPage from "../../../components/AnimatedLandingPage";

export default async function AdminLoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const returnToVault = params.next === "/vault";
  return (
    <AnimatedLandingPage
      hasError={params.error === "1"}
      errorPath={returnToVault ? "/admin/login?next=%2Fvault" : "/admin/login"}
      successPath={returnToVault ? "/vault" : "/admin?welcome=1"}
      showBackLink
    />
  );
}
