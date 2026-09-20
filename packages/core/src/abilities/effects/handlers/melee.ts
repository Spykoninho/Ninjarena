import { angleBetween, distance, normalize, sub } from '../../../math/vec2';
import { firePending } from '../../../simulation/entities/pendingEffect';
import type { EffectHandler } from '../executor';
import { affectablePlayers, casterOf, executeList } from '../executor';

export const meleeHandler: EffectHandler<'melee'> = (effect, context, path) => {
  const caster = casterOf(context);
  if (caster === undefined) return;
  const ability = context.ctx.abilities.get(context.source.abilityId);
  const halfArc = (effect.arcDegrees / 2) * (Math.PI / 180);
  const ctx = context.ctx;
  for (const pending of Object.values(ctx.world.pending)) {
    if (!pending.fragile) continue;
    if (!ctx.matchConfig.friendlyFire && pending.teamId === context.teamId) continue;
    const toMine = sub(pending.position, caster.position);
    if (distance(caster.position, pending.position) > effect.range + pending.triggerRadius)
      continue;
    if (angleBetween(context.direction, toMine) > halfArc) continue;
    firePending(ctx, pending);
  }
  for (const target of affectablePlayers(context)) {
    const toTarget = sub(target.position, caster.position);
    if (distance(caster.position, target.position) > effect.range + target.stats.colliderRadius) {
      continue;
    }
    if (angleBetween(context.direction, toTarget) > halfArc) continue;
    executeList(ability, path, 'onHit', {
      ...context,
      target,
      origin: { x: target.position.x, y: target.position.y },
      direction: normalize(toTarget),
    });
  }
};
