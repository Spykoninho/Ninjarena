import { applyStatusEffect } from '../../../combat/control';
import type { EffectHandler } from '../executor';
import { casterOf } from '../executor';

export const applyStatusHandler: EffectHandler<'applyStatus'> = (effect, context) => {
  const target = effect.target === 'self' ? casterOf(context) : context.target;
  if (target === undefined) return;
  applyStatusEffect(context.ctx, target, effect.status, effect.durationMs, effect.magnitude);
};
