import MediaRoutePage from "../MediaRoutePage";

export const dynamic = "force-dynamic";

export default function MediaRightsUsagePage() {
  return (
    <MediaRoutePage
      mode="index"
      initialView="rights-usage"
      initialTab="rights"
      queueMode="rights-usage"
    />
  );
}
