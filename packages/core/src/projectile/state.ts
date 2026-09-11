import type { EffectRef } from '../abilities/effects/activationEffects';
import type { HitEffect } from '../definitions';
import type { Vec2 } from '../math/vec2';
import { add, normalize, scale } from '../math/vec2';
import type { PlayerState } from '../player/state';
import type { SimulationContext } from '../simulation/context';
import type { EntityId, PlayerId, TeamId, Tick } from '../simulation/ids';

export interface ProjectileState {
  id: EntityId;
  ownerId: PlayerId;
  teamId: TeamId;
  position: Vec2;
  velocity: Vec2;
  radius: number;
  expiresAt: Tick;
  source: { abilityId: string; effectIndex: number };
}

export interface SpawnProjectileParams {
  owner: PlayerState;
  direction: Vec2;
  speed: number;
  radius: number;
  lifetimeMs: number;
  source: EffectRef;
}

export function spawnProjectile(
  ctx: SimulationContext,
  params: SpawnProjectileParams,
): ProjectileState {
  const direction = normalize(params.direction);
  // Le tir naît hors du tireur pour ne pas se coller à son collider au premier tick.
  const offset = params.owner.stats.colliderRadius + params.radius + 1;
  const id: EntityId = `p${ctx.world.nextEntityId++}`;
  const projectile: ProjectileState = {
    id,
    ownerId: params.owner.id,
    teamId: params.owner.teamId,
    position: add(params.owner.position, scale(direction, offset)),
    velocity: scale(direction, params.speed),
    radius: params.radius,
    expiresAt: ctx.now + ctx.ticks(params.lifetimeMs),
    source: { abilityId: params.source.abilityId, effectIndex: params.source.effectIndex },
  };
  ctx.world.projectiles[id] = projectile;
  return projectile;
}

export function projectileHitEffects(
  ctx: SimulationContext,
  projectile: ProjectileState,
): readonly HitEffect[] {
  const ability = ctx.abilities.get(projectile.source.abilityId);
  const effect = ability.effects[projectile.source.effectIndex];
  return effect?.type === 'projectile' ? effect.onHit : [];
}
