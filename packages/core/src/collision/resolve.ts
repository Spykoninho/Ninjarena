import type { Vec2 } from '../math/vec2';
import { EPSILON, add, length, scale, sub } from '../math/vec2';
import type { Shape } from './shapes';
import { closestPointOnBoundary, containsPoint, outwardNormalNear } from './shapes';

export function circlePenetration(shape: Shape, center: Vec2, radius: number): Vec2 | null {
  const closest = closestPointOnBoundary(shape, center);
  const toCenter = sub(center, closest);
  const distance = length(toCenter);
  if (!containsPoint(shape, center)) {
    if (distance >= radius) return null;
    const normal =
      distance < EPSILON ? outwardNormalNear(shape, center) : scale(toCenter, 1 / distance);
    return scale(normal, radius - distance);
  }
  // Le centre est dans la forme : on ressort par le point de bord le plus proche.
  const normal =
    distance < EPSILON ? outwardNormalNear(shape, center) : scale(toCenter, -1 / distance);
  return scale(normal, radius + distance);
}

export function resolveCircleAgainstShapes(
  center: Vec2,
  radius: number,
  shapes: readonly Shape[],
  iterations = 3,
): Vec2 {
  let current: Vec2 = { x: center.x, y: center.y };
  for (let i = 0; i < iterations; i++) {
    let moved = false;
    for (const shape of shapes) {
      const push = circlePenetration(shape, current, radius);
      if (push) {
        current = add(current, push);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return current;
}

export function separateCircles(
  a: Vec2,
  radiusA: number,
  b: Vec2,
  radiusB: number,
): { a: Vec2; b: Vec2 } | null {
  const delta = sub(b, a);
  const distance = length(delta);
  const minDistance = radiusA + radiusB;
  if (distance >= minDistance) return null;
  const direction = distance < EPSILON ? { x: 1, y: 0 } : scale(delta, 1 / distance);
  const half = (minDistance - distance) / 2;
  return { a: add(a, scale(direction, -half)), b: add(b, scale(direction, half)) };
}
