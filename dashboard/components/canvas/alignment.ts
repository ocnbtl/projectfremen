import type { CanvasNode } from "../../lib/modules/canvas/model";

type Rect = Pick<CanvasNode, "id" | "x" | "y" | "width" | "height">;
type Point = { x: number; y: number };
type Axis = keyof Point;
export type AlignmentGuide = { axis: Axis; position: number; start: number; end: number };

const size = { x: "width", y: "height" } as const;
const axes = ["x", "y"] as const;
const snapPixels = 6;
const overlapGap = 24;

// Edge pairs can meet across either side. Centers match other centers.
const anchors = [[0, 0], [1, 1], [0.5, 0.5], [0, 1], [1, 0]] as const;

export function snapTranslation(
  moving: readonly Rect[], allNodes: readonly Rect[], proposedDelta: Point, zoom: number,
): { delta: Point; guides: AlignmentGuide[] } {
  const delta = { ...proposedDelta };
  const guides: AlignmentGuide[] = [];
  if (!moving.length || zoom <= 0 || !Number.isFinite(zoom)) return { delta, guides };

  const ids = new Set(moving.map(node => node.id));
  const stationary = allNodes.filter(node => !ids.has(node.id));
  const min = { x: Infinity, y: Infinity };
  const max = { x: -Infinity, y: -Infinity };
  for (const node of moving) {
    for (const axis of axes) {
      min[axis] = Math.min(min[axis], node[axis]);
      max[axis] = Math.max(max[axis], node[axis] + node[size[axis]]);
    }
  }
  const threshold = snapPixels / zoom;
  for (const axis of axes) {
    const cross = axis === "x" ? "y" : "x";
    const start = min[axis] + proposedDelta[axis];
    const length = max[axis] - min[axis];
    const crossStart = min[cross] + proposedDelta[cross];
    const crossEnd = max[cross] + proposedDelta[cross];
    let best: { offset: number; distance: number; across: number; guide: AlignmentGuide } | undefined;
    for (const target of stationary) {
      const targetEnd = target[cross] + target[size[cross]];
      const across = Math.max(0, target[cross] - crossEnd, crossStart - targetEnd);
      for (const [from, to] of anchors) {
        const position = target[axis] + to * target[size[axis]];
        const offset = position - (start + from * length);
        const distance = Math.abs(offset);
        if (distance > threshold || (best && (distance > best.distance ||
            (distance === best.distance && across >= best.across)))) continue;
        best = { offset, distance, across, guide: { axis, position, start: target[cross], end: targetEnd } };
      }
    }
    if (best) {
      delta[axis] += best.offset;
      guides.push(best.guide);
    }
  }
  // Both axes are now final, so each segment reaches the snapped selection.
  for (const guide of guides) {
    const cross = guide.axis === "x" ? "y" : "x";
    guide.start = Math.min(guide.start, min[cross] + delta[cross]);
    guide.end = Math.max(guide.end, max[cross] + delta[cross]);
  }
  return { delta, guides };
}

export function spaceEvenly<T extends Rect>(nodes: readonly T[], axis: Axis, exactGap?:number): T[] {
  if (nodes.length < (exactGap===undefined?3:2)) return [...nodes];
  const ordered = [...nodes].sort((a, b) => a[axis] - b[axis]);
  const last = ordered[ordered.length - 1];
  const extent = last[axis] + last[size[axis]] - ordered[0][axis];
  const free = extent - ordered.reduce((sum, node) => sum + node[size[axis]], 0);
  const gap = exactGap ?? (free >= 0 ? free / (ordered.length - 1) : overlapGap);
  const positions = new Map<string, number>();
  let cursor = ordered[0][axis];
  for (const node of ordered) {
    positions.set(node.id, exactGap===undefined && node === last && free >= 0 ? last[axis] : cursor);
    cursor += node[size[axis]] + gap;
  }
  return nodes.map(node => {
    const position = positions.get(node.id)!;
    return position === node[axis] ? node : { ...node, [axis]: position };
  });
}
