import PeopleRoutePage from "../PeopleRoutePage";

export const dynamic = "force-dynamic";

export default async function PersonProfilePage({
  params
}: {
  params: Promise<{ personId: string }>;
}) {
  const { personId } = await params;
  return <PeopleRoutePage mode="profile" personId={personId} />;
}
