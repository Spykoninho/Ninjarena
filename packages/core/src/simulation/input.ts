import type { Vec2 } from '../math/vec2';
import { clampLength, isFiniteVec2, isZero, normalize } from '../math/vec2';
import type { PlayerId } from './ids';

export interface PlayerInput {
  move: Vec2;
  aim: Vec2;
  abilityHeld: number;
}

export const MAX_ABILITY_SLOTS = 4;

const ABILITY_BITS = (1 << MAX_ABILITY_SLOTS) - 1;

export function neutralInput(): PlayerInput {
  return { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, abilityHeld: 0 };
}

export function isAbilityHeld(mask: number, slot: number): boolean {
  if (slot < 0 || slot >= MAX_ABILITY_SLOTS) return false;
  return (mask & (1 << slot)) !== 0;
}

export function abilityMask(slots: readonly number[]): number {
  let mask = 0;
  for (const slot of slots) {
    if (slot < 0 || slot >= MAX_ABILITY_SLOTS) continue;
    mask |= 1 << slot;
  }
  return mask;
}

export function sanitizePlayerInput(raw: PlayerInput): PlayerInput {
  // Une entrée non finie est rejetée en bloc: elle ne peut pas être réparée composante par composante.
  if (!isFiniteVec2(raw.move) || !isFiniteVec2(raw.aim) || !Number.isFinite(raw.abilityHeld)) {
    return neutralInput();
  }
  const aim = normalize(raw.aim);
  return {
    move: clampLength(raw.move, 1),
    aim: isZero(aim) ? { x: 1, y: 0 } : aim,
    abilityHeld: raw.abilityHeld & ABILITY_BITS,
  };
}

export type PlayerInputs = Readonly<Record<PlayerId, PlayerInput>>;
