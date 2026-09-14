import { circlePenetration } from '@ninjarena/core';
import type { LoadedMap, Shape, Vec2 } from '@ninjarena/core';

// Advertise the unobstructed straight approach, not a corridor through a blocking wall.
export function dashPreviewDistance(
  map: LoadedMap,
  origin: Vec2,
  direction: Vec2,
  distance: number,
  radius: number,
  obstacles: readonly Shape[] = [],
): number {
  for (let d = 0.5; d <= distance; d += 0.5) {
    const p = { x: origin.x + direction.x * d, y: origin.y + direction.y * d };
    if (
      p.x < radius ||
      p.y < radius ||
      p.x > map.widthInUnits - radius ||
      p.y > map.heightInUnits - radius
    )
      return Math.max(0, d - 0.5);
    const nearby = map.collidersNear({
      minX: p.x - radius,
      minY: p.y - radius,
      maxX: p.x + radius,
      maxY: p.y + radius,
    });
    if ([...nearby, ...obstacles].some((shape) => circlePenetration(shape, p, radius) !== null))
      return Math.max(0, d - 0.5);
  }
  return distance;
}
