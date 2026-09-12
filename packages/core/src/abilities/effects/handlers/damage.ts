import { applyDamage } from '../../../combat/damage';
import { computeDamage } from '../../../stats/formulas';
import type { EffectHandler } from '../executor';
import { casterOf } from '../executor';
import { terrainDamageMultiplier } from '../terrain';

export const damageHandler: EffectHandler<'damage'> = (effect, context) => {
  const target = context.target;
  if (target === undefined) return;
  const caster = casterOf(context);
  const amount = computeDamage({
    base: effect.amount * terrainDamageMultiplier(context.ctx, target.position, effect.terrain),
    scaling: effect.scaling,
    attacker: caster?.stats,
    defender: target.stats,
  });
  applyDamage(context.ctx, target, amount, context.casterId, { scaling: effect.scaling });
};
