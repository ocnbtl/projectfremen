import { MODULE_VIEW_ROUTES } from "../../native-objects/routes";
import type { NativeObjectRef } from "../../native-objects/types";

export type BoardSourceModule = "media" | "notes" | "projects";
export type BoardPlacement = {boardId:string; boardTitle:string; cardId:string; cardNumber:number};
export type PlacementPage = {placements:BoardPlacement[]; next:string | null};

export function isBoardSourceModule(module:string): module is BoardSourceModule {
  return module === "media" || module === "notes" || module === "projects";
}

/** Resolve the object opened by these modules' detail routes and list inspectors. */
export function sourceFromUrl(module:BoardSourceModule, url:URL) {
  const base = "/admin/" + module;
  const path = url.pathname.replace(/\/$/, "");
  if (path !== base && !path.startsWith(base + "/")) return;
  const segments = path.slice(base.length).split("/").filter(Boolean);
  const selected = url.searchParams.get("selected");
  if (module === "media") {
    if (path === base) return selected || undefined;
    if (Object.values(MODULE_VIEW_ROUTES.media ?? {}).includes(path)) {
      if (["duplicates","upload-queue"].includes(segments[0])) return;
      return selected || (segments[0] === "in-use" ? url.searchParams.get("asset") : undefined) || undefined;
    }
  }
  if (module === "notes" && !segments.length) return url.searchParams.get("note") || undefined;
  if (module === "projects") {
    if (!segments.length) return url.searchParams.get("item") || undefined;
    // A nested item on a project detail page identifies a milestone, blocker, etc.
    if (url.searchParams.get("item")) return;
  }
  if (segments.length !== 1) return;
  try { return decodeURIComponent(segments[0]); } catch { return; }
}

export function sourceObjectId(ref:NativeObjectRef) {
  if (!isBoardSourceModule(ref.module) || ref.containerObjectId) return;
  if (ref.objectType === "workspace_link") {
    try {
      const url = new URL(ref.route, "https://workspace.invalid");
      if (url.origin === "https://workspace.invalid") return sourceFromUrl(ref.module, url);
    } catch { /* An unreadable copied URL has no recognized source. */ }
    return;
  }
  if (ref.module === "media" && ["media_asset","asset","file"].includes(ref.objectType)) return ref.objectId;
  if (ref.module === "notes" && ref.objectType === "note") return ref.objectId;
  if (ref.module === "projects" && ref.objectType === "project") return ref.objectId;
}
