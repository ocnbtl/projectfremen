"use client";
import * as Popover from "@radix-ui/react-popover";
import { IconCloudCheck,IconCloudExclamation,IconLoader2 } from "@tabler/icons-react";
import css from "./CanvasEditor.module.css";

export function CanvasSaveStatus({status,updatedAt}:{status:string;updatedAt:string}){
  const saving=status==="Saving…",saved=status==="Saved";
  const StatusIcon=saving?IconLoader2:saved?IconCloudCheck:IconCloudExclamation;
  const date=new Date(updatedAt);
  const time=date.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
  return <Popover.Root><Popover.Trigger asChild>
    <button type="button" aria-label={"Save status: "+status} title={saved?"Last saved "+time:status} data-state-color={saving?"saving":saved?"saved":"error"} className={css.saveBadge}>
      <StatusIcon aria-hidden size={18}/><span role="status" className={css.srOnly}>{status}</span>
    </button>
  </Popover.Trigger><Popover.Portal><Popover.Content sideOffset={6} collisionPadding={10} className={css.saveInfo}>
    <strong>{status}</strong><span>Last saved <time dateTime={updatedAt}>{time}</time></span>
  </Popover.Content></Popover.Portal></Popover.Root>;
}
