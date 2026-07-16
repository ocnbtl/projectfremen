import MediaRoutePage from "../MediaRoutePage";

export const dynamic = "force-dynamic";

export default async function MediaAssetPage({
  params,
  searchParams
}: {
  params: Promise<{ assetId: string }>;
  searchParams: Promise<{ context?: string }>;
}) {
  const { assetId } = await params;
  const { context } = await searchParams;
  const rightsContext = context === "rights-usage";
  return (
    <MediaRoutePage
      mode="detail"
      assetId={assetId}
      initialView={rightsContext ? "rights-usage" : undefined}
      initialTab={rightsContext ? "rights" : undefined}
      queueMode={rightsContext ? "rights-usage" : undefined}
    />
  );
}
