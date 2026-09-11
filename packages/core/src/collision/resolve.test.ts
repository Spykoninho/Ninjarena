import { describe, expect, it } from 'vitest';
import { circlePenetration, resolveCircleAgainstShapes, separateCircles } from './resolve';
import type { ConvexPolygon, Rect } from './shapes';

const wall: Rect = { type: 'rect', x: 100, y: 0, width: 16, height: 200 };

describe('circlePenetration', () => {
  it('returns null when the circle does not touch the shape', () => {
    expect(circlePenetration(wall, { x: 80, y: 50 }, 5)).toBeNull();
  });

  it('pushes a circle overlapping a wall back along the normal', () => {
    const push = circlePenetration(wall, { x: 97, y: 50 }, 5);
    expect(push).not.toBeNull();
    expect(push!.x).toBeCloseTo(-2);
    expect(push!.y).toBeCloseTo(0);
  });

  it('pushes a circle whose center is inside the shape out through the nearest side', () => {
    const push = circlePenetration(wall, { x: 102, y: 50 }, 5);
    expect(push!.x).toBeCloseTo(-7);
  });

  it('handles convex polygons', () => {
    const diagonal: ConvexPolygon = {
      type: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 40 },
        { x: 36, y: 44 },
        { x: -4, y: 4 },
      ],
    };
    expect(circlePenetration(diagonal, { x: 20, y: 36 }, 4)).toBeNull();
    const push = circlePenetration(diagonal, { x: 20, y: 26 }, 4);
    expect(push).not.toBeNull();
    expect(push!.y).toBeGreaterThan(0);
  });
});

describe('resolveCircleAgainstShapes', () => {
  it('slides along a wall instead of stopping', () => {
    const resolved = resolveCircleAgainstShapes({ x: 97, y: 60 }, 5, [wall]);
    expect(resolved.x).toBeCloseTo(95);
    expect(resolved.y).toBeCloseTo(60);
  });

  it('lets a circle pass through a gap equal to its diameter', () => {
    const left: Rect = { type: 'rect', x: 0, y: 0, width: 50, height: 16 };
    const right: Rect = { type: 'rect', x: 60, y: 0, width: 50, height: 16 };
    const resolved = resolveCircleAgainstShapes({ x: 55, y: 8 }, 5, [left, right]);
    expect(resolved).toEqual({ x: 55, y: 8 });
  });

  it('blocks a circle wider than the gap', () => {
    const left: Rect = { type: 'rect', x: 0, y: 0, width: 50, height: 16 };
    const right: Rect = { type: 'rect', x: 58, y: 0, width: 50, height: 16 };
    const resolved = resolveCircleAgainstShapes({ x: 54, y: 18 }, 5, [left, right]);
    expect(resolved.y).toBeGreaterThan(18.9);
  });
});

describe('separateCircles', () => {
  it('pushes overlapping circles apart symmetrically', () => {
    const result = separateCircles({ x: 0, y: 0 }, 5, { x: 6, y: 0 }, 5);
    expect(result!.a.x).toBeCloseTo(-2);
    expect(result!.b.x).toBeCloseTo(8);
  });

  it('returns null when circles do not overlap', () => {
    expect(separateCircles({ x: 0, y: 0 }, 5, { x: 10, y: 0 }, 5)).toBeNull();
  });
});
