import { describe, expect, it } from 'vitest';
import type { Vec2 } from './vec2';
import {
  add,
  angleBetween,
  angleOf,
  clampLength,
  distance,
  distanceSq,
  dot,
  isFiniteVec2,
  isZero,
  length,
  lengthSq,
  lerp,
  normalize,
  scale,
  sub,
  vec2,
} from './vec2';

const binaryCalls: ReadonlyArray<readonly [string, (a: Vec2, b: Vec2) => unknown]> = [
  ['add', (a, b) => add(a, b)],
  ['sub', (a, b) => sub(a, b)],
  ['scale', (a) => scale(a, 2)],
  ['dot', (a, b) => dot(a, b)],
  ['lengthSq', (a) => lengthSq(a)],
  ['length', (a) => length(a)],
  ['distanceSq', (a, b) => distanceSq(a, b)],
  ['distance', (a, b) => distance(a, b)],
  ['normalize', (a) => normalize(a)],
  ['clampLength', (a) => clampLength(a, 1)],
  ['lerp', (a, b) => lerp(a, b, 0.5)],
  ['angleOf', (a) => angleOf(a)],
  ['angleBetween', (a, b) => angleBetween(a, b)],
  ['isFiniteVec2', (a) => isFiniteVec2(a)],
  ['isZero', (a) => isZero(a)],
];

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
    expect(angleBetween(vec2(1e-4, 0), vec2(0, 1e-4))).toBeCloseTo(Math.PI / 2);
  });

  it('never mutates its arguments', () => {
    for (const [name, call] of binaryCalls) {
      const a = Object.freeze(vec2(3, 4));
      const b = Object.freeze(vec2(-1, 2));
      expect(() => call(a, b), name).not.toThrow();
      expect(a, name).toEqual({ x: 3, y: 4 });
      expect(b, name).toEqual({ x: -1, y: 2 });
    }
  });
});
