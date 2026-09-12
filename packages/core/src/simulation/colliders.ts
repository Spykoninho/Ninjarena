import type { AABB, Shape } from '../collision';
import { aabbOverlaps, shapeBounds } from '../collision';
import type { SimulationContext } from './context';

export function collidersNear(ctx: SimulationContext, bounds: AABB): Shape[] {
  const shapes = ctx.map.collidersNear(bounds);
  // Un mur invoqué bloque comme un mur de carte, son propriétaire compris.
  for (const obstacle of Object.values(ctx.world.obstacles)) {
    if (aabbOverlaps(shapeBounds(obstacle.shape), bounds)) shapes.push(obstacle.shape);
  }
  return shapes;
}
