import type { Project } from "./types";

/** Metadata only: all linked views use the same saved square, never recrop the source. */
export function projectLinkPreview(project?: Pick<Project, "id" | "photoUpdatedAt" | "description">) {
  return {
    imageUrl: project?.photoUpdatedAt ? `/api/projects/photos/${encodeURIComponent(project.id)}` : undefined,
    imageUpdatedAt: project?.photoUpdatedAt,
    detail: project?.description?.slice(0, 320),
  };
}
