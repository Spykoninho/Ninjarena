import { applyKnockback } from '../../../combat/control';
import type { EffectHandler } from '../executor';

export const knockbackHandler: EffectHandler<'knockback'> = (effect, context) => {
  const target = context.target;
  if (target === undefined) return;
  applyKnockback(context.ctx, target, context.direction, effect.speed, effect.durationMs);
};
