import type { AbilityDefinition, Effect } from '@ninjarena/core';

// Une zone libre tombe où le doigt la tire; sinon elle tombe toujours au bout de sa portée.
export type AimShape =
  | { kind: 'self' }
  | { kind: 'line'; reach: number; spreadDegrees: number; offensive: boolean }
  | { kind: 'cone'; reach: number; arcDegrees: number }
  | { kind: 'wall'; offset: number; width: number }
  | { kind: 'area'; range: number; radius: number; free: boolean };

export const SELF_AIM: AimShape = { kind: 'self' };

const MS_PER_SECOND = 1000;
const FULL_TURN_DEGREES = 360;
// Une frappe sèche cherche un ennemi à l'écran, même quand le coup lui-même porte moins loin.
const ASSIST_MIN_RANGE = 160;

export function aimShapeOf(ability: AbilityDefinition): AimShape {
  return shapeOfEffects(ability.effects) ?? SELF_AIM;
}

// Rayon dans lequel une frappe sèche vise l'ennemi le plus proche; null quand elle n'en vise aucun.
export function assistRange(shape: AimShape): number | null {
  switch (shape.kind) {
    case 'self':
      return null;
    case 'line':
      return shape.offensive ? Math.max(ASSIST_MIN_RANGE, shape.reach) : null;
    case 'cone':
      return Math.max(ASSIST_MIN_RANGE, shape.reach);
    case 'wall':
      return ASSIST_MIN_RANGE;
    case 'area':
      return Math.max(ASSIST_MIN_RANGE, shape.range + shape.radius);
  }
}

// La première brique qui part dans une direction décide de la visée: les suivantes la suivent.
function shapeOfEffects(effects: readonly Effect[]): AimShape | null {
  for (const effect of effects) {
    const shape = shapeOf(effect);
    if (shape !== null) return shape;
  }
  return null;
}

function shapeOf(effect: Effect): AimShape | null {
  switch (effect.type) {
    case 'projectile':
      return {
        kind: 'line',
        reach: (effect.speed * effect.lifetimeMs) / MS_PER_SECOND,
        spreadDegrees: (effect.count - 1) * effect.spreadDegrees,
        offensive: true,
      };
    case 'melee':
      return effect.arcDegrees >= FULL_TURN_DEGREES
        ? null
        : { kind: 'cone', reach: effect.range, arcDegrees: effect.arcDegrees };
    case 'dash':
      return {
        kind: 'line',
        reach: effect.distance,
        spreadDegrees: 0,
        offensive: effect.onContact.length > 0,
      };
    case 'teleport':
      return { kind: 'line', reach: effect.distance, spreadDegrees: 0, offensive: false };
    case 'spawnEntity':
      return { kind: 'wall', offset: effect.offset, width: effect.width };
    case 'area':
      if (effect.origin !== 'cursor' && effect.origin !== 'aim') return null;
      return {
        kind: 'area',
        range: effect.range,
        radius: effect.radius,
        free: effect.origin === 'cursor',
      };
    case 'delayedTrigger':
      return shapeOfEffects(effect.effects);
    default:
      return null;
  }
}
