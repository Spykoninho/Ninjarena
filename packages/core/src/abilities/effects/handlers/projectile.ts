import { rotate } from '../../../math/vec2';
import { spawnProjectile } from '../../../projectile/state';
import type { EffectHandler } from '../executor';
import { casterOf } from '../executor';

export const projectileHandler: EffectHandler<'projectile'> = (effect, context, path) => {
  const caster = casterOf(context);
  if (caster === undefined) return;
  const spread = (effect.spreadDegrees * Math.PI) / 180;
  for (let index = 0; index < effect.count; index++) {
    // L'éventail est centré sur la visée: le tir du milieu part droit.
    const angle = (index - (effect.count - 1) / 2) * spread;
    const projectile = spawnProjectile(context.ctx, {
      owner: caster,
      direction: rotate(context.direction, angle),
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
  }
};
