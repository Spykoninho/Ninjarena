import { applyHitEffects } from '../../abilities/effects/hitEffects';
import { circleBounds, circlePenetration } from '../../collision';
import { canAffect } from '../../combat/damage';
import { add, distance, length, normalize, scale } from '../../math/vec2';
import { isDamageable } from '../../player/rules';
import type { PlayerState } from '../../player/state';
import type { ProjectileState } from '../../projectile/state';
import { projectileHitEffects } from '../../projectile/state';
import type { SimulationContext } from '../context';
import { playersOf } from '../world';

type DestroyReason = 'hit' | 'wall' | 'expired';

export function projectileSystem(ctx: SimulationContext): void {
  for (const projectile of Object.values(ctx.world.projectiles)) {
    advance(ctx, projectile);
  }
}

function advance(ctx: SimulationContext, projectile: ProjectileState): void {
  const remaining = projectile.expiresAt - ctx.now;
  if (remaining <= 0) {
    destroy(ctx, projectile, 'expired');
    return;
  }
  // Le pas est subdivisé pour qu'un projectile rapide ne traverse jamais un mur ou une cible.
  const substeps = Math.max(
    1,
    Math.ceil((length(projectile.velocity) * ctx.dt) / projectile.radius),
  );
  const step = scale(projectile.velocity, ctx.dt / substeps);
  const owner = ctx.world.players[projectile.ownerId];
  for (let i = 0; i < substeps; i++) {
    projectile.position = add(projectile.position, step);
    if (hitsWall(ctx, projectile)) {
      destroy(ctx, projectile, 'wall');
      return;
    }
    const target = firstPlayerHit(ctx, projectile, owner);
    if (target === undefined) continue;
    applyHitEffects(ctx, target, projectileHitEffects(ctx, projectile), {
      sourceId: projectile.ownerId,
      direction: normalize(projectile.velocity),
    });
    destroy(ctx, projectile, 'hit');
    return;
  }
}

function hitsWall(ctx: SimulationContext, projectile: ProjectileState): boolean {
  const bounds = circleBounds(projectile.position, projectile.radius);
  for (const shape of ctx.map.collidersNear(bounds)) {
    if (circlePenetration(shape, projectile.position, projectile.radius) !== null) return true;
  }
  return false;
}

function firstPlayerHit(
  ctx: SimulationContext,
  projectile: ProjectileState,
  owner: PlayerState | undefined,
): PlayerState | undefined {
  for (const player of playersOf(ctx.world)) {
    if (!canBeHit(ctx, projectile, owner, player)) continue;
    const reach = projectile.radius + player.stats.colliderRadius;
    if (distance(projectile.position, player.position) <= reach) return player;
  }
  return undefined;
}

function canBeHit(
  ctx: SimulationContext,
  projectile: ProjectileState,
  owner: PlayerState | undefined,
  player: PlayerState,
): boolean {
  if (owner !== undefined) return canAffect(ctx, owner, player);
  // Tireur parti: l'équipe portée par le projectile garde les règles de tir allié.
  if (!isDamageable(player)) return false;
  return ctx.matchConfig.friendlyFire || projectile.teamId !== player.teamId;
}

function destroy(ctx: SimulationContext, projectile: ProjectileState, reason: DestroyReason): void {
  delete ctx.world.projectiles[projectile.id];
  ctx.events.push({
    type: 'projectileDestroyed',
    tick: ctx.now,
    projectileId: projectile.id,
    reason,
    position: { x: projectile.position.x, y: projectile.position.y },
  });
}
