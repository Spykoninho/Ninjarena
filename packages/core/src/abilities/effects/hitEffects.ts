import { applyKnockback, applyStatusEffect, applyStun } from '../../combat/control';
import { applyDamage } from '../../combat/damage';
import type { HitEffect } from '../../definitions';
import type { Vec2 } from '../../math/vec2';
import { isDamageable } from '../../player/rules';
import type { PlayerState } from '../../player/state';
import type { SimulationContext } from '../../simulation/context';
import type { PlayerId } from '../../simulation/ids';

export interface HitInfo {
  sourceId: PlayerId | null;
  direction: Vec2;
}

export type HitHandlers = {
  [K in HitEffect['type']]: (
    ctx: SimulationContext,
    target: PlayerState,
    effect: Extract<HitEffect, { type: K }>,
    hit: HitInfo,
  ) => void;
};

export const hitHandlers: HitHandlers = {
  damage: (ctx, target, effect, hit) => {
    applyDamage(ctx, target, effect.amount, hit.sourceId);
  },
  knockback: (ctx, target, effect, hit) => {
    applyKnockback(ctx, target, hit.direction, effect.speed, effect.durationMs);
  },
  stun: (ctx, target, effect) => {
    applyStun(ctx, target, effect.durationMs);
  },
  applyStatus: (ctx, target, effect) => {
    applyStatusEffect(ctx, target, effect.status, effect.durationMs, effect.magnitude);
  },
};

export function applyHitEffects(
  ctx: SimulationContext,
  target: PlayerState,
  effects: readonly HitEffect[],
  hit: HitInfo,
): void {
  // Une cible morte ou invulnérable ne subit aucun effet de la liste.
  if (!isDamageable(target)) return;
  for (const effect of effects) handlerFor(effect)(ctx, target, effect, hit);
}

type AnyHitHandler = (
  ctx: SimulationContext,
  target: PlayerState,
  effect: HitEffect,
  hit: HitInfo,
) => void;

function handlerFor(effect: HitEffect): AnyHitHandler {
  // Le discriminant garantit l'appariement handler/effet, que TypeScript ne peut pas corréler ici.
  return hitHandlers[effect.type] as AnyHitHandler;
}
