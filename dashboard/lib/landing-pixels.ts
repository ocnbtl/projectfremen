export type PixelPoint = { x: number; y: number };
export type PixelTrail = { points: PixelPoint[]; occupied: Set<string>; direction: number };
const directions = [{ x: 2, y: 0 }, { x: 0, y: 2 }, { x: -2, y: 0 }, { x: 0, y: -2 }];
const key = (point: PixelPoint) => `${point.x},${point.y}`;

export function createPixelTrail(width: number, height: number, random = Math.random): PixelTrail {
  const point = { x: Math.floor(random() * Math.max(1, Math.floor(width / 2))) * 2,
    y: Math.floor(random() * Math.max(1, Math.floor(height / 2))) * 2 };
  return { points: [point], occupied: new Set([key(point)]), direction: Math.floor(random() * 4) };
}

// Never paint an already occupied cell. If the tip is enclosed, grow from the
// nearest available part of the trail. Retiring its tail keeps long runs bounded.
export function advancePixelTrail(trail: PixelTrail, width: number, height: number, random = Math.random) {
  const limit = Math.max(1, Math.min(1600, Math.floor(width / 2) * Math.floor(height / 2) - 1));
  while (trail.points.length >= limit) {
    trail.occupied.delete(key(trail.points.shift()!));
  }
  const firstDirection = random() < .65 ? trail.direction : Math.floor(random() * 4);
  for (let index = trail.points.length - 1; index >= 0; index--) {
    const anchor = trail.points[index];
    for (let offset = 0; offset < 4; offset++) {
      const direction = (firstDirection + offset) % 4;
      const delta = directions[direction];
      const point = { x: anchor.x + delta.x, y: anchor.y + delta.y };
      if (point.x < 0 || point.y < 0 || point.x + 2 > width || point.y + 2 > height || trail.occupied.has(key(point))) continue;
      trail.points.push(point);
      trail.occupied.add(key(point));
      trail.direction = direction;
      return;
    }
  }
  const fresh = createPixelTrail(width, height, random);
  trail.points = fresh.points;
  trail.occupied = fresh.occupied;
  trail.direction = fresh.direction;
}
