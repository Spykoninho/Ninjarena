import { describe, expect, it } from 'vitest';
import { createTestMap } from './fixtures';

describe('test fixtures', () => {
  it('places every spawn on open ground', () => {
    const map = createTestMap();
    expect(map.widthInUnits).toBe(480);
    expect(map.heightInUnits).toBe(240);
    for (const spawn of map.spawns) {
      expect(map.terrainAt({ x: spawn.x, y: spawn.y }).solid).toBe(false);
    }
  });

  it('keeps row 2 open from x=16 to x=464', () => {
    const map = createTestMap();
    for (let x = 16; x < 464; x += 16) {
      expect(map.terrainAt({ x, y: 40 }).solid).toBe(false);
    }
  });
});
