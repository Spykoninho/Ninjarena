import { circleBounds, circlePenetration, resolveCircleAgainstShapes } from '../../../collision';
import type { LoadedMap } from '../../../map/loadedMap';
import type { Vec2 } from '../../../math/vec2';
import { add, normalize, scale } from '../../../math/vec2';
import type { EffectHandler } from '../executor';
import { casterOf } from '../executor';

export const teleportHandler: EffectHandler<'teleport'> = (effect, context) => {
  const ctx = context.ctx;
  const caster = casterOf(context);
  if (caster === undefined) return;
  const radius = caster.stats.colliderRadius;
  const from: Vec2 = { x: caster.position.x, y: caster.position.y };
  const direction = normalize(context.direction);
  // Le saut ne traverse pas un mur: on échantillonne le segment et on garde le dernier point libre.
  const steps = Math.max(1, Math.ceil(effect.distance / radius));
  let free = from;
  for (let step = 1; step <= steps; step++) {
    const sample = clampToMap(
      ctx.map,
      add(from, scale(direction, (effect.distance * step) / steps)),
      radius,
    );
    if (blocked(ctx.map, sample, radius)) break;
    free = sample;
  }
  const to = resolveCircleAgainstShapes(
    free,
    radius,
    ctx.map.collidersNear(circleBounds(free, radius)),
  );
  caster.position = to;
  ctx.events.push({
    type: 'teleported',
    tick: ctx.now,
    playerId: caster.id,
    from,
    to: { x: to.x, y: to.y },
  });
};

function clampToMap(map: LoadedMap, position: Vec2, radius: number): Vec2 {
  return {
    x: Math.min(map.widthInUnits - radius, Math.max(radius, position.x)),
    y: Math.min(map.heightInUnits - radius, Math.max(radius, position.y)),
  };
}

function blocked(map: LoadedMap, position: Vec2, radius: number): boolean {
  for (const shape of map.collidersNear(circleBounds(position, radius))) {
    if (circlePenetration(shape, position, radius) !== null) return true;
  }
  return false;
}
