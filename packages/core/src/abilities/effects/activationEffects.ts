import { canAffect } from '../../combat/damage';
import type { AbilityDefinition, ActivationEffect } from '../../definitions';
import type { Vec2 } from '../../math/vec2';
import { angleBetween, distance, isZero, normalize, sub } from '../../math/vec2';
import { setPhase } from '../../player/phaseTransitions';
import type { PlayerState } from '../../player/state';
import { spawnProjectile } from '../../projectile/state';
import type { SimulationContext } from '../../simulation/context';
import { playersOf } from '../../simulation/world';
import { applyHitEffects } from './hitEffects';

export interface EffectRef {
  abilityId: string;
  effectIndex: number;
}

export type ActivationHandlers = {
  [K in ActivationEffect['type']]: (
    ctx: SimulationContext,
    caster: PlayerState,
    effect: Extract<ActivationEffect, { type: K }>,
    ref: EffectRef,
  ) => void;
};

export const activationHandlers: ActivationHandlers = {
  projectile: (ctx, caster, effect, ref) => {
    const projectile = spawnProjectile(ctx, {
      owner: caster,
      direction: aimOf(caster),
      speed: effect.speed,
      radius: effect.radius,
      lifetimeMs: effect.lifetimeMs,
      source: ref,
    });
    ctx.events.push({
      type: 'projectileSpawned',
      tick: ctx.now,
      projectileId: projectile.id,
      ownerId: caster.id,
      abilityId: ref.abilityId,
    });
  },
  dash: (ctx, caster, effect) => {
    // Le dash remplace la phase CASTING: ces capacités déclarent recoveryMs = 0.
    setPhase(ctx, caster, {
      kind: 'DASHING',
      direction: aimOf(caster),
      speed: effect.distance / (effect.durationMs / 1000),
      endsAt: ctx.now + Math.max(1, ctx.ticks(effect.durationMs)),
    });
  },
  melee: (ctx, caster, effect) => {
    const aim = aimOf(caster);
    const halfArc = (effect.arcDegrees / 2) * (Math.PI / 180);
    for (const target of playersOf(ctx.world)) {
      if (!canAffect(ctx, caster, target)) continue;
      const toTarget = sub(target.position, caster.position);
      const reach = effect.range + target.stats.colliderRadius;
      if (distance(caster.position, target.position) > reach) continue;
      if (angleBetween(aim, toTarget) > halfArc) continue;
      applyHitEffects(ctx, target, effect.onHit, {
        sourceId: caster.id,
        direction: normalize(toTarget),
      });
    }
  },
};

export function executeActivationEffects(
  ctx: SimulationContext,
  caster: PlayerState,
  ability: AbilityDefinition,
): void {
  for (let effectIndex = 0; effectIndex < ability.effects.length; effectIndex++) {
    const effect = ability.effects[effectIndex];
    if (effect === undefined) continue;
    handlerFor(effect)(ctx, caster, effect, { abilityId: ability.id, effectIndex });
  }
}

const DEFAULT_AIM: Vec2 = { x: 1, y: 0 };

function aimOf(caster: PlayerState): Vec2 {
  return isZero(caster.aim) ? DEFAULT_AIM : normalize(caster.aim);
}

type AnyActivationHandler = (
  ctx: SimulationContext,
  caster: PlayerState,
  effect: ActivationEffect,
  ref: EffectRef,
) => void;

function handlerFor(effect: ActivationEffect): AnyActivationHandler {
  // Le discriminant garantit l'appariement handler/effet, que TypeScript ne peut pas corréler ici.
  return activationHandlers[effect.type] as AnyActivationHandler;
}
