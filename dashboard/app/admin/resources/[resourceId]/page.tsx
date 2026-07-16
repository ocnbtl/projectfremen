import ResourcesRoutePage from "../ResourcesRoutePage";

export const dynamic = "force-dynamic";

export default async function ResourceDetailPage({
  params
}: {
  params: Promise<{ resourceId: string }>;
}) {
  const { resourceId } = await params;
  return <ResourcesRoutePage mode="detail" resourceId={resourceId} />;
}
