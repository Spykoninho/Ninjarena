import { applyStatusEffect } from '../../../combat/control';
import type { EffectHandler } from '../executor';
import { casterOf } from '../executor';

export const shieldHandler: EffectHandler<'shield'> = (effect, context) => {
  // Sans cible désignée le bouclier protège le lanceur.
  const target = context.target ?? casterOf(context);
  if (target === undefined) return;
  applyStatusEffect(context.ctx, target, 'SHIELDED', effect.durationMs, effect.amount);
};
