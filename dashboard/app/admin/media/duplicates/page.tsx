import MediaRoutePage from "../MediaRoutePage";

export const dynamic = "force-dynamic";

export default function MediaDuplicatesPage() {
  return <MediaRoutePage mode="index" queueMode="duplicates" />;
}
