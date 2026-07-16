import MediaRoutePage from "../MediaRoutePage";

export const dynamic = "force-dynamic";

export default function MediaNeedsReviewPage() {
  return (
    <MediaRoutePage
      mode="index"
      initialView="needs-review"
      initialTab="review"
      queueMode="needs-review"
    />
  );
}
