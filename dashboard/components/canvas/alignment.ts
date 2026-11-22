import type { CanvasNode } from "../../lib/modules/canvas/model";

type Rect = Pick<CanvasNode, "id" | "x" | "y" | "width" | "height">;
type Layout = Omit<Rect, "id">;
type Point = { x: number; y: number };
type Axis = keyof Point;
export type AlignmentGuide = { axis: Axis; position: number; start: number; end: number };

const size = { x: "width", y: "height" } as const;
const axes = ["x", "y"] as const;
const snapPixels = 6;
const overlapGap = 24;

// Edge pairs can meet across either side. Centers match other centers.
const anchors = [[0, 0], [1, 1], [0.5, 0.5], [0, 1], [1, 0]] as const;

function closestGuide(axis: Axis, box: Layout, targets: readonly Rect[], threshold: number,
  correction: (from: number, offset: number) => number | undefined) {
  const cross = axis === "x" ? "y" : "x";
  let best: { amount: number; distance: number; across: number; guide: AlignmentGuide } | undefined;
  for (const target of targets) {
    const end = target[cross] + target[size[cross]];
    const across = Math.max(0, target[cross] - box[cross] - box[size[cross]], box[cross] - end);
    for (const [from, to] of anchors) {
      const position = target[axis] + to * target[size[axis]];
      const amount = correction(from, position - (box[axis] + from * box[size[axis]]));
      if (amount === undefined) continue;
      const distance = Math.abs(amount);
      if (distance > threshold || (best && (distance > best.distance ||
          (distance === best.distance && across >= best.across)))) continue;
      best = { amount, distance, across, guide: { axis, position, start: target[cross], end } };
    }
  }
  return best;
}

function extendGuides(guides: AlignmentGuide[], box: Layout) {
  for (const guide of guides) {
    const cross = guide.axis === "x" ? "y" : "x";
    guide.start = Math.min(guide.start, box[cross]);
    guide.end = Math.max(guide.end, box[cross] + box[size[cross]]);
  }
  return guides;
}

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
  const box = { x: min.x + delta.x, y: min.y + delta.y, width: max.x - min.x, height: max.y - min.y };
  for (const axis of axes) {
    const best = closestGuide(axis, box, stationary, snapPixels / zoom, (_, offset) => offset);
    if (best) {
      delta[axis] += best.amount;
      guides.push(best.guide);
    }
  }
  extendGuides(guides, { ...box, x: min.x + delta.x, y: min.y + delta.y });
  return { delta, guides };
}

export const maxCardSize = 100000;
export const minCardSize = { width: 138, height: 76 };

export function snapResize(original: Rect, start: Layout, proposed: Layout, targets: readonly Rect[],
  zoom: number, keepRatio: boolean): { rect: Layout; guides: AlignmentGuide[] } {
  // The renderer can measure fractional artwork in whole pixels. Apply its gesture to the saved dimensions.
  const fixed = { x: proposed.x === start.x ? 0 : 1, y: proposed.y === start.y ? 0 : 1 };
  const active = axes.filter(axis => proposed[size[axis]] !== start[size[axis]]);
  const minimum = keepRatio ? { width: 1, height: 1 } : minCardSize;
  const ratio = original.width / original.height;
  function rectangle(width: number, height: number): Layout {
    return { x: original.x + fixed.x * (original.width - width),
      y: original.y + fixed.y * (original.height - height), width, height };
  }
  let width = original.width, height = original.height;
  if (keepRatio && active.length) {
    width = Math.max(Math.max(1, ratio), Math.min(maxCardSize, maxCardSize * ratio,
      original.width * proposed.width / start.width));
    height = width / ratio;
  } else {
    for (const axis of active) {
      const dim = size[axis];
      const length = Math.max(minimum[dim], Math.min(maxCardSize, original[dim] + (proposed[dim] - start[dim])));
      if (axis === "x") width = length;
      else height = length;
    }
  }
  const raw = rectangle(width, height);
  if (!targets.length || !active.length || zoom <= 0 || !Number.isFinite(zoom)) return { rect: raw, guides: [] };
  const stationary = targets.filter(node => node.id !== original.id);
  function match(axis: Axis, box: Layout, tolerance: number) {
    return closestGuide(axis, box, stationary, tolerance, (from, offset) => {
      if (from === fixed[axis]) return;
      const amount = offset / (from - fixed[axis]);
      const dim = size[axis], length = box[dim] + amount;
      if (length < minimum[dim] || length > maxCardSize) return;
      if (keepRatio) {
        const other = axis === "x" ? length / ratio : length * ratio;
        if (other < 1 || other > maxCardSize) return;
      }
      return amount;
    });
  }
  const guides: AlignmentGuide[] = [];
  let bestMotion = Infinity;
  for (const axis of active) {
    const best = match(axis, raw, snapPixels / zoom);
    if (!best) continue;
    if (keepRatio) {
      const newWidth = axis === "x" ? raw.width + best.amount : (raw.height + best.amount) * ratio;
      const newHeight = newWidth / ratio;
      const motion = Math.max(Math.abs(newWidth - raw.width), Math.abs(newHeight - raw.height));
      if (motion > snapPixels / zoom || motion >= bestMotion) continue;
      width = newWidth; height = newHeight; bestMotion = motion;
    } else {
      if (axis === "x") width += best.amount;
      else height += best.amount;
      guides.push(best.guide);
    }
  }
  const rect = rectangle(width, height);
  // One scale determines both media edges. Draw only guides reached by the winning scale.
  if (keepRatio && Number.isFinite(bestMotion)) {
    for (const axis of active) {
      const alignment = match(axis, rect, 1e-7);
      if (alignment) guides.push(alignment.guide);
    }
  }
  return { rect, guides: extendGuides(guides, rect) };
}

export function spaceEvenly<T extends Rect>(nodes: readonly T[], axis: Axis, exactGap?:number): T[] {
  if (nodes.length < (exactGap===undefined?3:2)) return [...nodes];
  const ordered = [...nodes].sort((a, b) => a[axis] - b[axis]);
  const cross = axis === "x" ? "y" : "x";
  // Cards sharing a coordinate on this axis often belong to separate rows or columns.
  if (nodes.length > 2 && ordered.some((n,i) => i > 0 && n[axis] < ordered[i-1][axis] + ordered[i-1][size[axis]])) {
    const lanes: T[][] = [];
    let commonEnd = -Infinity;
    for (const node of [...nodes].sort((a,b) => a[cross] - b[cross])) {
      const end = node[cross] + node[size[cross]];
      if (node[cross] >= commonEnd) {
        lanes.push([]);
        commonEnd = end;
      }
      commonEnd = Math.min(commonEnd, end);
      lanes[lanes.length-1].push(node);
    }
    if (lanes.length > 1) {
      const gaps: number[] = [];
      for (const lane of lanes) {
        lane.sort((a,b) => a[axis] - b[axis]);
        for (let i=1; i<lane.length; i++) {
          const gap = lane[i][axis] - lane[i-1][axis] - lane[i-1][size[axis]];
          if (gap >= 0) gaps.push(gap);
        }
      }
      gaps.sort((a,b) => a-b);
      const gap = exactGap ?? gaps[Math.floor((gaps.length-1)/2)] ?? overlapGap;
      const positions = new Map<string,T>();
      for (const lane of lanes) {
        let cursor = lane[0][axis];
        for (const node of lane) {
          positions.set(node.id, {...node,[axis]:cursor});
          cursor += node[size[axis]] + gap;
        }
      }
      return nodes.map(node => positions.get(node.id)!);
    }
  }
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
