"use client";
import { useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { placePinIconRole } from "../../lib/modules/planning/place-tags";
import { normalizePlaceImage } from "../../lib/modules/planning/place-presentation";
import type { Place } from "../../lib/modules/planning/types";
import styles from "./PlaceImagePicker.module.css";

async function thumbnail(file: Blob) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 10 * 1024 * 1024) throw new Error("Choose a PNG, JPEG, WebP or GIF under 10 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    if (image.naturalWidth * image.naturalHeight > 40000000) throw new Error("Choose a smaller image (under 40 megapixels).");
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d"); if (!context) throw new Error("Image editing is unavailable in this browser.");
    const scale = Math.min(128 / image.naturalWidth, 128 / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    context.drawImage(image, (128-width)/2, (128-height)/2, width, height);
    return normalizePlaceImage(canvas.toDataURL("image/png"))!;
  } finally { URL.revokeObjectURL(url); }
}

export default function PlaceImagePicker({ place, picture, onChange }: { place: Partial<Place>; picture?: string; onChange: (image: string) => void | Promise<void> }) {
  const trigger = useRef<HTMLButtonElement>(null), input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [failed, setFailed] = useState("");
  async function change(image: string) { setBusy(true); setError(""); try { await onChange(image); setOpen(false); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function choose(file: Blob) { setBusy(true); setError(""); try { await change(await thumbnail(file)); } catch(e) { setError((e as Error).message); setBusy(false); } }
  return <Popover.Root open={open} onOpenChange={next => { if (!busy) { setOpen(next); setError(""); } }}>
    <Popover.Trigger asChild><button ref={trigger} type="button" className={styles.trigger} aria-label="Change place picture" title="Change place picture">{picture && failed !== picture ? <img src={picture} alt="" onError={()=>setFailed(picture)} /> : <UnigentamosIcon role={placePinIconRole(place.tags || [], place.primaryTag)} size={22}/>}<span><UnigentamosIcon role="edit" size={10}/></span></button></Popover.Trigger>
    <Popover.Portal container={trigger.current?.closest<HTMLElement>('[role="dialog"]') || undefined}><Popover.Content className={styles.menu} sideOffset={8} collisionPadding={12} onEscapeKeyDown={e=>e.stopImmediatePropagation()} aria-label="Place picture" onPaste={e=>{const file=[...e.clipboardData.items].find(item=>item.type.startsWith("image/"))?.getAsFile();if(file&&!busy){e.preventDefault();void choose(file);}}}>
      <strong>Place picture</strong><small>Upload or paste a logo, flag or photo.</small>
      <input hidden style={{display:"none"}} ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void choose(file);}}/>
      <button type="button" disabled={busy} onClick={()=>input.current?.click()}><UnigentamosIcon role="photo-upload" size={16}/>Choose image</button>
      <button type="button" disabled={busy} onClick={async()=>{setError("");try{const items=await navigator.clipboard.read();for(const item of items){const type=item.types.find(t=>/^image\/(png|jpeg|webp|gif)$/.test(t));if(type){await choose(await item.getType(type));return;}}setError("Copy an image first, then paste it here.");}catch{setError("Use your device’s Paste command here, or choose an image file.");}}}><UnigentamosIcon role="photo-paste" size={16}/>Paste image</button>
      {place.image&&<button type="button" disabled={busy} onClick={()=>void change("")}>Remove custom image</button>}
      {busy&&<small role="status">Saving picture…</small>}{error&&<small role="alert">{error}</small>}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
