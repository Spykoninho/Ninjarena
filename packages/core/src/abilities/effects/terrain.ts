import type { TerrainRule } from '../../definitions';
import type { Vec2 } from '../../math/vec2';
import type { SimulationContext } from '../../simulation/context';

export function terrainDamageMultiplier(
  ctx: SimulationContext,
  position: Vec2,
  rules: readonly TerrainRule[],
): number {
  if (rules.length === 0) return 1;
  const tags = ctx.map.terrainAt(position).tags;
  let multiplier = 1;
  for (const rule of rules) {
    if (rule.damageMultiplier !== undefined && tags.includes(rule.tag)) {
      multiplier *= rule.damageMultiplier;
    }
  }
  return multiplier;
}

export function terrainRadiusMultiplier(
  ctx: SimulationContext,
  position: Vec2,
  rules: readonly TerrainRule[],
): number {
  if (rules.length === 0) return 1;
  const tags = ctx.map.terrainAt(position).tags;
  let multiplier = 1;
  for (const rule of rules) {
    if (rule.radiusMultiplier !== undefined && tags.includes(rule.tag)) {
      multiplier *= rule.radiusMultiplier;
    }
  }
  return multiplier;
}
