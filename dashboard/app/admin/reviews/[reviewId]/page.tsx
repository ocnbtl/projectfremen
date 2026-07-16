import ReviewsRoutePage from "../ReviewsRoutePage";

export const dynamic = "force-dynamic";

export default async function ReviewRunPage({
  params
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  return <ReviewsRoutePage mode="detail" reviewId={reviewId} />;
}

