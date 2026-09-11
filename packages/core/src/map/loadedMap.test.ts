import { describe, expect, it } from 'vitest';
import { MapDefinitionSchema, TilesetDefinitionSchema } from '../definitions';
import { LoadedMap } from './loadedMap';

const tileset = TilesetDefinitionSchema.parse({
  id: 'test',
  tileSize: 16,
  tiles: {
    '0': { name: 'ground', color: '#000000' },
    '1': { name: 'wall', solid: true, color: '#111111' },
    '2': { name: 'water', speedMultiplier: 0.5, tags: ['water'], color: '#222222' },
  },
});
const map = MapDefinitionSchema.parse({
  id: 'test',
  name: 'Test',
  tileset: 'test',
  width: 4,
  height: 3,
  legend: { '.': 0, '#': 1, '~': 2 },
  layers: { ground: ['....', '.~~.', '....'], objects: ['####', '#  #', '####'] },
  colliders: [{ type: 'circle', x: 32, y: 24, radius: 4 }],
  spawns: [{ x: 24, y: 24, team: 0 }],
});

describe('LoadedMap', () => {
  const loaded = LoadedMap.fromDefinitions(map, tileset);

  it('exposes dimensions in tiles and units', () => {
    expect(loaded.widthInUnits).toBe(64);
    expect(loaded.heightInUnits).toBe(48);
  });

  it('merges solid tiles into rectangles and keeps explicit colliders', () => {
    const rects = loaded.colliders.filter((s) => s.type === 'rect');
    expect(rects).toHaveLength(4); // top row, left column, right column, bottom row
    expect(loaded.colliders.some((s) => s.type === 'circle')).toBe(true);
  });

  it('reports terrain effects from the tile under a position', () => {
    expect(loaded.terrainAt({ x: 24, y: 24 }).speedMultiplier).toBe(0.5);
    expect(loaded.terrainAt({ x: 24, y: 24 }).tags).toContain('water');
    expect(loaded.terrainAt({ x: 8, y: 8 }).solid).toBe(true);
    expect(loaded.terrainAt({ x: -5, y: 8 }).solid).toBe(true);
  });

  it('returns only nearby colliders from the broadphase', () => {
    expect(loaded.collidersNear({ minX: 20, minY: 20, maxX: 28, maxY: 28 }).length).toBeGreaterThan(
      0,
    );
  });

  it('exposes the tile ids of both layers for rendering', () => {
    expect(loaded.groundTileIdAt(1, 1)).toBe(2);
    expect(loaded.objectTileIdAt(0, 0)).toBe(1);
    expect(loaded.objectTileIdAt(1, 1)).toBe(-1);
    expect(loaded.tileAt(1, 1).solid).toBe(false);
    expect(loaded.spawns).toEqual([{ x: 24, y: 24, team: 0 }]);
  });

  it('rejects a tileset that does not match the map', () => {
    expect(() => LoadedMap.fromDefinitions({ ...map, tileset: 'other' }, tileset)).toThrow(
      /tileset/,
    );
  });

  it('rejects a tile id missing from the tileset', () => {
    const broken = { ...map, legend: { ...map.legend, '.': 7 } };
    expect(() => LoadedMap.fromDefinitions(broken, tileset)).toThrow(/tile/);
  });
});
