import { describe, expect, it } from 'vitest';
import { abilityMask, isAbilityHeld, sanitizePlayerInput } from './input';

describe('sanitizePlayerInput', () => {
  it('clamps movement to unit length and normalizes aim', () => {
    const input = sanitizePlayerInput({
      move: { x: 3, y: 4 },
      aim: { x: 0, y: 10 },
      abilityHeld: 1,
    });
    expect(Math.hypot(input.move.x, input.move.y)).toBeCloseTo(1);
    expect(input.aim).toEqual({ x: 0, y: 1 });
  });

  it('replaces non-finite values with a neutral input', () => {
    const input = sanitizePlayerInput({
      move: { x: Number.NaN, y: 0 },
      aim: { x: 1, y: 0 },
      abilityHeld: 1,
    });
    expect(input.move).toEqual({ x: 0, y: 0 });
  });

  it('keeps only the supported ability bits', () => {
    expect(
      sanitizePlayerInput({ move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, abilityHeld: 0b110101 })
        .abilityHeld,
    ).toBe(0b10101);
    expect(isAbilityHeld(abilityMask([0, 2]), 2)).toBe(true);
    expect(isAbilityHeld(abilityMask([0, 2]), 1)).toBe(false);
  });

  it('clamps the aim distance and drops it when it is not finite', () => {
    const base = { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, abilityHeld: 0 };
    expect(sanitizePlayerInput({ ...base, aimDistance: 120 }).aimDistance).toBe(120);
    expect(sanitizePlayerInput({ ...base, aimDistance: -5 }).aimDistance).toBe(0);
    expect(sanitizePlayerInput({ ...base, aimDistance: 1e9 }).aimDistance).toBe(2000);
    expect(sanitizePlayerInput({ ...base, aimDistance: Number.NaN }).aimDistance).toBeUndefined();
    expect(sanitizePlayerInput(base).aimDistance).toBeUndefined();
  });
});
