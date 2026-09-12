import type { AbilityDefinition } from '../../definitions';
import type { Vec2 } from '../../math/vec2';
import { distance, isZero, normalize, sub } from '../../math/vec2';
import type { EffectContext } from './executor';
import { affectablePlayers, executeList } from './executor';

export function applyAreaHit(
  context: EffectContext,
  ability: AbilityDefinition,
  path: string,
  center: Vec2,
  radius: number,
): void {
  for (const target of affectablePlayers(context)) {
    if (distance(center, target.position) > radius) continue;
    // La direction part du centre vers la cible: une projection repousse vers l'extérieur.
    const outward = sub(target.position, center);
    executeList(ability, path, 'onHit', {
      ...context,
      target,
      origin: { x: target.position.x, y: target.position.y },
      direction: isZero(outward) ? context.direction : normalize(outward),
    });
  }
}
