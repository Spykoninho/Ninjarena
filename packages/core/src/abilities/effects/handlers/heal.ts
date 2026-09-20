import { applyHeal } from '../../../combat/heal';
import type { EffectHandler } from '../executor';
import { casterOf } from '../executor';

export const healHandler: EffectHandler<'heal'> = (effect, context) => {
  const caster = casterOf(context);
  // Sans cible désignée le soin va au lanceur.
  const target = context.target ?? caster;
  if (target === undefined) return;
  const multiplier =
    effect.scaling === 'technique' && caster !== undefined
      ? caster.stats.techniqueDamageMultiplier
      : 1;
  applyHeal(context.ctx, target, effect.amount * multiplier, context.casterId);
};
