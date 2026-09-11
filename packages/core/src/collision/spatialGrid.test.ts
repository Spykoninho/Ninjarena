import { describe, expect, it } from 'vitest';
import { SpatialGrid } from './spatialGrid';

describe('SpatialGrid', () => {
  it('returns each item once even when it spans several cells', () => {
    const grid = new SpatialGrid<string>(32);
    grid.insert('big', { minX: 0, minY: 0, maxX: 100, maxY: 10 });
    grid.insert('far', { minX: 500, minY: 500, maxX: 510, maxY: 510 });
    expect(grid.query({ minX: 10, minY: 0, maxX: 90, maxY: 5 })).toEqual(['big']);
  });

  it('counts inserted items and returns them in a deterministic order', () => {
    const grid = new SpatialGrid<string>(32);
    grid.insert('a', { minX: 0, minY: 0, maxX: 10, maxY: 10 });
    grid.insert('b', { minX: 40, minY: 0, maxX: 50, maxY: 10 });
    grid.insert('c', { minX: 0, minY: 40, maxX: 10, maxY: 50 });
    expect(grid.size).toBe(3);
    expect(grid.query({ minX: 0, minY: 0, maxX: 60, maxY: 60 })).toEqual(['a', 'b', 'c']);
  });

  it('returns nothing for bounds outside every filled cell', () => {
    const grid = new SpatialGrid<string>(32);
    grid.insert('a', { minX: 0, minY: 0, maxX: 10, maxY: 10 });
    expect(grid.query({ minX: 200, minY: 200, maxX: 210, maxY: 210 })).toEqual([]);
  });
});
