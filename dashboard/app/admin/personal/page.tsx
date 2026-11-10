import TasksPage from "../../../components/planning/TasksPage";
import AdminChrome from "../../../components/AdminChrome";
import { requireAdminSession } from "../../../lib/require-admin";
export const dynamic="force-dynamic";
export default async function Page(){await requireAdminSession();return <div className="shell admin-chrome-main module-ref-shell personal-ops-module-shell native-module-shell"><AdminChrome sidebarTitle="Personal" showCommandSearch={false} showPageSidebar={false} showLocalAi={false}/><TasksPage/></div>;}
