import { notFound, redirect } from "next/navigation";
import AdminChrome from "../../../components/AdminChrome";
import ReviewsWorkspace from "../../../components/reviews/ReviewsWorkspace";
import { legacyReviewsToProjections } from "../../../lib/modules/reviews/legacy-adapter";
import {
  createEmptyReviewsState,
  readReviewsState
} from "../../../lib/modules/reviews/store";
import type { FinanceReviewBridge } from "../../../lib/modules/reviews/types";
import { readReviews } from "../../../lib/reviews-store";
import { requireAdminSession } from "../../../lib/require-admin";

export type ReviewsRouteMode = "index" | "detail";

export const FINANCE_REVIEW_BRIDGE: FinanceReviewBridge = {
  state: "read_only_preview",
  label: "Finance Monthly Review",
  href: "/admin/finance/monthly-review",
  reason:
    "Finance currently renders disclosed client fixtures. Reviews can open that source preview, but cannot verify or complete the Finance close."
};

export default async function ReviewsRoutePage({
  mode,
  reviewId
}: {
  mode: ReviewsRouteMode;
  reviewId?: string;
}) {
  await requireAdminSession();

  const [nativeResult, legacyResult] = await Promise.all([
    readReviewsState()
      .then((state) => ({ ok: true as const, state }))
      .catch((error: unknown) => ({
        ok: false as const,
        error: error instanceof Error ? error.message : "Native ReviewRuns could not be loaded."
      })),
    readReviews()
      .then((entries) => ({ ok: true as const, entries }))
      .catch((error: unknown) => ({
        ok: false as const,
        error: error instanceof Error ? error.message : "Legacy review entries could not be loaded."
      }))
  ]);

  const initialState = nativeResult.ok ? nativeResult.state : createEmptyReviewsState();
  const mappedLegacyIds = new Set(initialState.legacyMappings.map((mapping) => mapping.legacyReviewEntryId));
  const legacyRuns = legacyResult.ok
    ? legacyReviewsToProjections(legacyResult.entries).filter(
        (projection) => !mappedLegacyIds.has(projection.legacyReviewEntryId)
      )
    : [];

  const loadErrors = [
    nativeResult.ok ? "" : `Native ReviewRuns: ${nativeResult.error}`,
    legacyResult.ok ? "" : `Legacy review entries: ${legacyResult.error}`
  ].filter(Boolean);

  if (mode === "detail" && reviewId && loadErrors.length === 0) {
    const nativeRun = initialState.runs.some((run) => run.id === reviewId);
    const legacyRun = legacyRuns.find((run) => run.reviewId === reviewId);
    if (!nativeRun && legacyRun) redirect(legacyRun.route);
    if (!nativeRun) notFound();
  }

  return (
    <div className="shell admin-chrome-main module-ref-shell reviews-module-shell native-module-shell">
      <AdminChrome
        showCommandSearch={false}
        showPageSidebar={false}
        showLocalAi={false}
        sidebarTitle="Reviews"
        sidebarSummary="Recurring operating closure, evidence use, candidate resolution, and carry-forward."
      />
      <ReviewsWorkspace
        initialState={initialState}
        legacyRuns={legacyRuns}
        initialMode={mode}
        initialSelectedReviewId={reviewId}
        initialLoadError={loadErrors.length ? loadErrors.join(" ") : undefined}
        financeBridge={FINANCE_REVIEW_BRIDGE}
      />
    </div>
  );
}
