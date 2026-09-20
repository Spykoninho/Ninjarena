import { effectList } from '../../abilities/effectRef';
import type { EffectContext } from '../../abilities/effects/executor';
import { executeList } from '../../abilities/effects/executor';
import { circleBounds, circlePenetration } from '../../collision';
import { canAffect } from '../../combat/damage';
import { add, distanceSq, length, normalize, scale } from '../../math/vec2';
import { isDamageable } from '../../player/rules';
import type { PlayerState } from '../../player/state';
import type { ProjectileState } from '../../projectile/state';
import { collidersNear } from '../colliders';
import type { SimulationContext } from '../context';
import { firePending, fragilePendingHit } from '../entities/pendingEffect';
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
    runEffects(ctx, projectile, 'onExpire', undefined);
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
    const mine = fragilePendingHit(ctx, projectile.teamId, projectile.position, projectile.radius);
    if (mine !== undefined) {
      firePending(ctx, mine);
      destroy(ctx, projectile, 'hit');
      return;
    }
    const target = nearestPlayerHit(ctx, projectile, owner);
    if (target === undefined) continue;
    runEffects(ctx, projectile, 'onHit', target);
    // Un tir perforant garde sa course: la cible touchée est notée pour ne plus l'être.
    if (projectile.pierce) {
      projectile.hitPlayerIds.push(target.id);
      continue;
    }
    destroy(ctx, projectile, 'hit');
    return;
  }
}

function runEffects(
  ctx: SimulationContext,
  projectile: ProjectileState,
  list: 'onHit' | 'onExpire',
  target: PlayerState | undefined,
): void {
  const ability = ctx.abilities.get(projectile.source.abilityId);
  if (effectList(ability, projectile.source.path, list).length === 0) return;
  const context: EffectContext = {
    ctx,
    casterId: projectile.ownerId,
    teamId: projectile.teamId,
    origin: target === undefined ? { ...projectile.position } : { ...target.position },
    direction: normalize(projectile.velocity),
    source: projectile.source,
  };
  executeList(
    ability,
    projectile.source.path,
    list,
    target === undefined ? context : { ...context, target },
  );
}

function hitsWall(ctx: SimulationContext, projectile: ProjectileState): boolean {
  const bounds = circleBounds(projectile.position, projectile.radius);
  for (const shape of collidersNear(ctx, bounds)) {
    if (circlePenetration(shape, projectile.position, projectile.radius) !== null) return true;
  }
  return false;
}

function nearestPlayerHit(
  ctx: SimulationContext,
  projectile: ProjectileState,
  owner: PlayerState | undefined,
): PlayerState | undefined {
  // Deux cibles dans la portée du même sous-pas: la plus proche encaisse, pas la première ajoutée.
  let nearest: PlayerState | undefined;
  let nearestGapSq = Infinity;
  for (const player of playersOf(ctx.world)) {
    if (projectile.hitPlayerIds.includes(player.id)) continue;
    if (!canBeHit(ctx, projectile, owner, player)) continue;
    const reach = projectile.radius + player.stats.colliderRadius;
    const gapSq = distanceSq(projectile.position, player.position);
    if (gapSq > reach * reach || gapSq >= nearestGapSq) continue;
    nearest = player;
    nearestGapSq = gapSq;
  }
  return nearest;
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
