import { spawnProjectile } from '../../../projectile/state';
import type { EffectHandler } from '../executor';
import { casterOf } from '../executor';

export const projectileHandler: EffectHandler<'projectile'> = (effect, context, path) => {
  const caster = casterOf(context);
  if (caster === undefined) return;
  const projectile = spawnProjectile(context.ctx, {
    owner: caster,
    direction: context.direction,
    speed: effect.speed,
    radius: effect.radius,
    lifetimeMs: effect.lifetimeMs,
    visual: effect.visual,
    source: { abilityId: context.source.abilityId, path },
  });
  context.ctx.events.push({
    type: 'projectileSpawned',
    tick: context.ctx.now,
    projectileId: projectile.id,
    ownerId: caster.id,
    abilityId: context.source.abilityId,
  });
};
