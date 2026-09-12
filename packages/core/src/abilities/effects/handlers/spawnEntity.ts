import { spawnWall } from '../../../simulation/entities/obstacle';
import type { EffectHandler } from '../executor';
import { casterOf } from '../executor';

export const spawnEntityHandler: EffectHandler<'spawnEntity'> = (effect, context, path) => {
  const caster = casterOf(context);
  if (caster === undefined) return;
  // Le mur s'ancre toujours sur le lanceur, jamais au point d'impact qui a déclenché l'effet.
  spawnWall(context.ctx, {
    owner: caster,
    direction: context.direction,
    width: effect.width,
    thickness: effect.thickness,
    offset: effect.offset,
    lifetimeMs: effect.lifetimeMs,
    visual: effect.visual,
    source: { abilityId: context.source.abilityId, path },
  });
};
