import MediaRoutePage from "../MediaRoutePage";

export const dynamic = "force-dynamic";

export default function MediaMissingMetadataPage() {
  return (
    <MediaRoutePage
      mode="index"
      initialView="missing-metadata"
      initialTab="metadata"
      queueMode="missing-metadata"
    />
  );
}

