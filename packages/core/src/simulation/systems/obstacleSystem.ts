import type { SimulationContext } from '../context';
import { removeObstacle } from '../entities/obstacle';

export function obstacleSystem(ctx: SimulationContext): void {
  for (const obstacle of Object.values(ctx.world.obstacles)) {
    if (obstacle.expiresAt > ctx.now) continue;
    removeObstacle(ctx, obstacle);
  }
}
