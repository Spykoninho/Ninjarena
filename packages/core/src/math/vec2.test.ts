import { describe, expect, it } from 'vitest';
import { angleBetween, clampLength, length, normalize, vec2 } from './vec2';

describe('vec2', () => {
  it('normalizes non-zero vectors to unit length and leaves zero untouched', () => {
    expect(length(normalize(vec2(3, 4)))).toBeCloseTo(1);
    expect(normalize(vec2(0, 0))).toEqual({ x: 0, y: 0 });
  });

  it('clamps length only when above the maximum', () => {
    expect(length(clampLength(vec2(3, 4), 1))).toBeCloseTo(1);
    expect(clampLength(vec2(0.3, 0.4), 1)).toEqual({ x: 0.3, y: 0.4 });
  });

  it('measures the angle between vectors', () => {
    expect(angleBetween(vec2(1, 0), vec2(0, 1))).toBeCloseTo(Math.PI / 2);
    expect(angleBetween(vec2(1, 0), vec2(0, 0))).toBe(0);
  });
});
