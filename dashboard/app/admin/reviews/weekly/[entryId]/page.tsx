import AdminChrome from "../../../../../components/AdminChrome";
import ReviewEntryEditor from "../../../../../components/ReviewEntryEditor";
import { requireAdminSession } from "../../../../../lib/require-admin";

export const dynamic = "force-dynamic";

export default async function WeeklyReviewEntryPage({
  params
}: {
  params: Promise<{ entryId: string }>;
}) {
  await requireAdminSession();
  const { entryId } = await params;

  return (<main className="shell admin-chrome-main module-ref-shell reviews-module-shell native-module-shell"><AdminChrome showCommandSearch={false} showPageSidebar={false} showLocalAi={false} sidebarTitle="Reviews"/><ReviewEntryEditor kind="weekly" entryId={entryId}/></main>);
}
