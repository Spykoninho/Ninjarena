import type { EffectHandler } from '../executor';
import { casterOf } from '../executor';

// Le prix se paie sur la manche: la réserve maximale baisse jusqu'à la prochaine renaissance.
export const sacrificeChakraHandler: EffectHandler<'sacrificeChakra'> = (effect, context) => {
  const caster = casterOf(context);
  if (caster === undefined) return;
  caster.stats.maxChakra = Math.round(caster.stats.maxChakra * (1 - effect.fraction));
  caster.chakra = Math.min(caster.chakra, caster.stats.maxChakra);
};
