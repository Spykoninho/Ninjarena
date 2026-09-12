import { applyStatusEffect } from '../../../combat/control';
import type { EffectHandler } from '../executor';

export const applyStatusHandler: EffectHandler<'applyStatus'> = (effect, context) => {
  const target = context.target;
  if (target === undefined) return;
  applyStatusEffect(context.ctx, target, effect.status, effect.durationMs, effect.magnitude);
};
