import { describe, expect, it } from 'vitest';
import type { Circle, ConvexPolygon, Rect } from './shapes';
import {
  aabbOverlaps,
  closestPointOnBoundary,
  closestPointOnSegment,
  containsPoint,
  outwardNormalNear,
  shapeBounds,
} from './shapes';

const rect: Rect = { type: 'rect', x: 10, y: 10, width: 20, height: 40 };
const circle: Circle = { type: 'circle', x: 0, y: 0, radius: 5 };
const triangle: ConvexPolygon = {
  type: 'polygon',
  points: [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 0, y: 30 },
  ],
};

describe('shapeBounds', () => {
  it('wraps a rect and a circle', () => {
    expect(shapeBounds(rect)).toEqual({ minX: 10, minY: 10, maxX: 30, maxY: 50 });
    expect(shapeBounds(circle)).toEqual({ minX: -5, minY: -5, maxX: 5, maxY: 5 });
  });

  it('wraps every polygon point', () => {
    expect(shapeBounds(triangle)).toEqual({ minX: 0, minY: 0, maxX: 30, maxY: 30 });
  });
});

describe('aabbOverlaps', () => {
  it('counts touching bounds as overlapping', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(aabbOverlaps(a, { minX: 10, minY: 0, maxX: 20, maxY: 10 })).toBe(true);
    expect(aabbOverlaps(a, { minX: 11, minY: 0, maxX: 20, maxY: 10 })).toBe(false);
  });
});

describe('containsPoint', () => {
  it('counts a point on the rect boundary as inside', () => {
    expect(containsPoint(rect, { x: 10, y: 30 })).toBe(true);
    expect(containsPoint(rect, { x: 30, y: 50 })).toBe(true);
    expect(containsPoint(rect, { x: 9.9, y: 30 })).toBe(false);
  });

  it('detects a point inside a polygon', () => {
    expect(containsPoint(triangle, { x: 5, y: 5 })).toBe(true);
    expect(containsPoint(triangle, { x: 25, y: 25 })).toBe(false);
  });

  it('measures circles from their center', () => {
    expect(containsPoint(circle, { x: 0, y: 5 })).toBe(true);
    expect(containsPoint(circle, { x: 4, y: 4 })).toBe(false);
  });
});

describe('closestPointOnSegment', () => {
  it('clamps the projection to the segment ends', () => {
    expect(closestPointOnSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 4, y: 7 })).toEqual({
      x: 4,
      y: 0,
    });
    expect(closestPointOnSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: -3, y: 2 })).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe('closestPointOnBoundary', () => {
  it('projects a point inside a rect onto the nearest side', () => {
    expect(closestPointOnBoundary(rect, { x: 14, y: 30 })).toEqual({ x: 10, y: 30 });
    expect(closestPointOnBoundary(rect, { x: 26, y: 12 })).toEqual({ x: 26, y: 10 });
  });

  it('clamps a point outside a rect onto its border', () => {
    expect(closestPointOnBoundary(rect, { x: 100, y: 30 })).toEqual({ x: 30, y: 30 });
  });

  it('projects a point outside a circle onto the circumference', () => {
    expect(closestPointOnBoundary(circle, { x: 20, y: 0 })).toEqual({ x: 5, y: 0 });
    const diagonal = closestPointOnBoundary(circle, { x: 10, y: 10 });
    expect(diagonal.x).toBeCloseTo(5 / Math.SQRT2);
    expect(diagonal.y).toBeCloseTo(5 / Math.SQRT2);
  });

  it('falls back to a fixed direction at the circle center', () => {
    expect(closestPointOnBoundary(circle, { x: 0, y: 0 })).toEqual({ x: 5, y: 0 });
  });

  it('walks every polygon edge', () => {
    expect(closestPointOnBoundary(triangle, { x: 5, y: -10 })).toEqual({ x: 5, y: 0 });
    expect(closestPointOnBoundary(triangle, { x: 2, y: 20 })).toEqual({ x: 0, y: 20 });
  });
});

describe('outwardNormalNear', () => {
  it('returns the axis of the nearest rect side', () => {
    expect(outwardNormalNear(rect, { x: 10, y: 30 })).toEqual({ x: -1, y: 0 });
    expect(outwardNormalNear(rect, { x: 20, y: 50 })).toEqual({ x: 0, y: 1 });
  });

  it('points away from the circle center', () => {
    expect(outwardNormalNear(circle, { x: 0, y: 5 })).toEqual({ x: 0, y: 1 });
    expect(outwardNormalNear(circle, { x: 0, y: 0 })).toEqual({ x: 1, y: 0 });
  });

  it('points away from the polygon centroid', () => {
    const normal = outwardNormalNear(triangle, { x: 15, y: 0 });
    expect(normal.x).toBeCloseTo(0);
    expect(normal.y).toBeCloseTo(-1);
  });
});
