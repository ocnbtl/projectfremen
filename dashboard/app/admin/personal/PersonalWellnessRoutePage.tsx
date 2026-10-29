import AdminChrome from "../../../components/AdminChrome";
import { WorkspaceTopbarProvider } from "../../../components/admin-shell/WorkspaceTopbar";
import PersonalWellnessWorkspace from "../../../components/personal-ops/PersonalWellnessWorkspace";
import { requireAdminSession } from "../../../lib/require-admin";
import { readWellnessState } from "../../../lib/modules/personal-wellness/store";
import { emptyWellnessState, type WellnessSection } from "../../../lib/modules/personal-wellness/types";
import { readPersonalOpsState } from "../../../lib/modules/personal-ops/store";

export default async function PersonalWellnessRoutePage({ section }: { section: WellnessSection }) {
  await requireAdminSession();
  const ops = await readPersonalOpsState();
  const core = [...ops.goals, ...ops.decisions, ...ops.obligations, ...ops.followUps];
  const counts = { command: core.filter(item => !["complete", "archived"].includes(item.lifecycle)).length + ops.routines.filter(item => item.lifecycle !== "archived").length, goals: ops.goals.length, decisions: ops.decisions.length, obligations: ops.obligations.length, followUps: ops.followUps.length, routines: ops.routines.length, captures: ops.captures.length, templates: ops.templates.length, archived: core.filter(item => item.lifecycle === "archived").length };
  let state = emptyWellnessState(), error = "";
  try { state = await readWellnessState(section); }
  catch { error = "This section could not be loaded. Reload before making changes."; }
  return <WorkspaceTopbarProvider><div className="shell admin-chrome-main module-ref-shell personal-ops-module-shell native-module-shell">
    <AdminChrome showCommandSearch={false} showPageSidebar={false} sidebarTitle="Personal" sidebarSummary="Personal systems" />
    <PersonalWellnessWorkspace section={section} initialState={state} initialError={error} sidebarCounts={counts} initialDay={new Date().toISOString().slice(0, 10)} />
  </div></WorkspaceTopbarProvider>;
}
