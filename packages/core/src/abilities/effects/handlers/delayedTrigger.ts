import { schedulePending } from '../../../simulation/entities/pendingEffect';
import type { EffectHandler } from '../executor';

export const delayedTriggerHandler: EffectHandler<'delayedTrigger'> = (effect, context, path) => {
  const ctx = context.ctx;
  schedulePending(ctx, {
    ownerId: context.casterId,
    teamId: context.teamId,
    position: context.origin,
    direction: context.direction,
    fireAt: ctx.now + ctx.ticks(effect.delayMs),
    source: { abilityId: context.source.abilityId, path },
    radius: null,
    triggerRadius: 0,
    visual: null,
  });
};
