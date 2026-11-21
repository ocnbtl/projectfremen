"use client";
import { IconHighlight, IconNote, IconTypography } from "@tabler/icons-react";
import Icon from "../icons/UnigentamosIcon";
import { canvasModuleIcons, CanvasMediaThumbnail } from "./CanvasIntake";
import type { OrganizerRow } from "./organizer-rows";
import css from "./OrganizedGallery.module.css";

export function OrganizerPreview({row}:{row:OrganizerRow}){
  const LocalIcon=row.kind==="sticky"?IconNote:row.kind==="highlight"?IconHighlight:IconTypography;
  return <span className={css.visual} aria-hidden="true" data-kind={row.ref?.module??row.kind}>
    {row.ref?.module==="media"?<CanvasMediaThumbnail target={row.ref} thumbnailOnly/>
      :row.ref?<Icon role={canvasModuleIcons[row.ref.module]} size={22}/>:<LocalIcon size={22}/>}
  </span>;
}
