import type { EffectOfType } from '../../../definitions';
import type { LoadedMap } from '../../../map/loadedMap';
import type { Vec2 } from '../../../math/vec2';
import { add, angleOf, fromAngle, normalize, scale } from '../../../math/vec2';
import { schedulePending } from '../../../simulation/entities/pendingEffect';
import { applyAreaHit } from '../areaHit';
import type { EffectContext, EffectHandler } from '../executor';
import { casterOf } from '../executor';
import { terrainRadiusMultiplier } from '../terrain';

export const areaHandler: EffectHandler<'area'> = (effect, context, path) => {
  const ctx = context.ctx;
  const center = centerOf(effect, context);
  const group = effect.count > 1 ? `g${ctx.world.nextEntityId++}` : null;
  for (const position of scatter(effect, center, context.direction)) {
    const clamped = clampToMap(ctx.map, position);
    // Le rayon effectif est figé ici: le monde le stocke tel quel et le client le dessine.
    const radius = effect.radius * terrainRadiusMultiplier(ctx, clamped, effect.terrain);
    if (effect.delayMs === 0) {
      const ability = ctx.abilities.get(context.source.abilityId);
      applyAreaHit(context, ability, path, clamped, radius, effect.visual);
      continue;
    }
    schedulePending(ctx, {
      ownerId: context.casterId,
      teamId: context.teamId,
      position: clamped,
      direction: context.direction,
      fireAt: ctx.now + ctx.ticks(effect.delayMs),
      source: { abilityId: context.source.abilityId, path },
      radius,
      triggerRadius: effect.triggerRadius,
      visual: effect.visual,
      group,
      fragile: effect.fragile,
    });
  }
};

// La grappe est déterministe: le centre, puis un anneau qui commence dans la direction visée.
function scatter(effect: EffectOfType<'area'>, center: Vec2, direction: Vec2): Vec2[] {
  if (effect.count <= 1 || effect.scatterRadius <= 0) return [center];
  const positions: Vec2[] = [center];
  const start = angleOf(direction);
  for (let index = 0; index < effect.count - 1; index++) {
    const angle = start + (index * Math.PI * 2) / (effect.count - 1);
    positions.push(add(center, scale(fromAngle(angle), effect.scatterRadius)));
  }
  return positions;
}

function centerOf(effect: EffectOfType<'area'>, context: EffectContext): Vec2 {
  const caster = casterOf(context);
  const base = caster === undefined ? context.origin : caster.position;
  switch (effect.origin) {
    case 'caster':
      return { x: base.x, y: base.y };
    case 'aim':
      return clampToMap(
        context.ctx.map,
        add(base, scale(normalize(context.direction), effect.range)),
      );
    case 'cursor': {
      const reach = Math.min(effect.range, caster?.aimDistance ?? effect.range);
      return clampToMap(context.ctx.map, add(base, scale(normalize(context.direction), reach)));
    }
    case 'here':
      return { x: context.origin.x, y: context.origin.y };
  }
}

function clampToMap(map: LoadedMap, position: Vec2): Vec2 {
  return {
    x: Math.min(map.widthInUnits, Math.max(0, position.x)),
    y: Math.min(map.heightInUnits, Math.max(0, position.y)),
  };
}
