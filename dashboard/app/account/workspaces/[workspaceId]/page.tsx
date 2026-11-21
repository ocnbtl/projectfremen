import {headers} from "next/headers";
import {notFound,redirect} from "next/navigation";
import Link from "next/link";
import {accountRpc,requireWorkspaceAccess,workspaceDatabase,WorkspaceAccessError} from "../../../../lib/workspace-access";
import WorkspaceMedia from "../../../../components/settings/WorkspaceMedia";
import WorkspaceRecords from "../../../../components/settings/WorkspaceRecords";
import {validateDaily,dailyDefaults} from "../../../../lib/settings/preferences";
import {validateWriting,writingDefaults} from "../../../../lib/writing/model";
import AccountNav from "../../../../components/settings/AccountNav";
import {readStorageOffer} from "../../../../lib/settings/storage-offer";
import styles from "../../../../components/settings/WorkspaceRecords.module.css";

export const dynamic="force-dynamic";
export default async function WorkspacePage({params,searchParams}: {params:Promise<{workspaceId:string}>;searchParams:Promise<{item?:string;record?:string;tab?:string}>}){
  const {workspaceId}=await params;
  let access;
  try {access=await requireWorkspaceAccess(new Request("https://workspace.invalid",{headers:await headers()}),workspaceId,"read");}
  catch(e){if(e instanceof WorkspaceAccessError){if(e.status===401)redirect("/account");if(e.status===403||e.status===404)notFound();}throw e;}
  const query=await searchParams;
  const metadata=await workspaceDatabase("account_workspaces?"+new URLSearchParams({id:"eq."+workspaceId,select:"name",limit:"1"}));
  const name=metadata.ok?(await metadata.json())[0]?.name:null;
  const selected=query.item||query.record;
  const saved=await accountRpc("account_preferences_action",{w:access.workspaceId,actor:access.userId});
  const prefs=validateDaily(saved.daily || dailyDefaults);
  const tab=selected?"records":query.tab || prefs.accountLanding;
  if(tab==="notifications" || tab==="settings")redirect("/account/preferences/"+(tab==="settings"?"home":tab)+"?workspace="+workspaceId);
  const media=tab==="media";
  return <main className={styles.page}><Link href="/account" prefetch={false}>All workspaces</Link>
    <h1>{name||"Workspace"}</h1><AccountNav id={workspaceId} prefs={prefs} active={media?"media":"records"}/>
    {media?<WorkspaceMedia workspaceId={workspaceId} offer={access.role==="owner"?readStorageOffer():null}/>:<WorkspaceRecords key={workspaceId+"/"+(selected||"")} workspaceId={workspaceId} itemKey={selected} prefs={prefs} writing={saved.writing?.skills?validateWriting(saved.writing):writingDefaults}/>}
  </main>;
}
