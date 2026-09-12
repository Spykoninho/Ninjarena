import { applyStun } from '../../../combat/control';
import type { EffectHandler } from '../executor';

export const stunHandler: EffectHandler<'stun'> = (effect, context) => {
  const target = context.target;
  if (target === undefined) return;
  applyStun(context.ctx, target, effect.durationMs);
};
