import { describe, expect, it } from 'vitest';
import type { MapDocument, MapSpawn } from '../definitions';
import { TilesetDefinitionSchema } from '../definitions';
import { spawnIssues, validateMapDocument } from './validateMap';

const tileset = TilesetDefinitionSchema.parse({
  id: 'test',
  tileSize: 16,
  tiles: {
    '0': { name: 'ground', color: '#204020' },
    '3': { name: 'wall', solid: true, layer: 'objects', color: '#402020' },
  },
});

interface MapWithOptions {
  width?: number;
  height?: number;
  solid?: [number, number][];
  spawns?: MapSpawn[];
}

function mapWith({
  width = 8,
  height = 8,
  solid = [],
  spawns = [],
}: MapWithOptions = {}): MapDocument {
  const solidSet = new Set(solid.map(([x, y]) => `${x},${y}`));
  const ground: number[][] = [];
  const objects: (number | null)[][] = [];
  for (let y = 0; y < height; y++) {
    const groundRow: number[] = [];
    const objectRow: (number | null)[] = [];
    for (let x = 0; x < width; x++) {
      groundRow.push(0);
      objectRow.push(solidSet.has(`${x},${y}`) ? 3 : null);
    }
    ground.push(groundRow);
    objects.push(objectRow);
  }
  return {
    version: 1,
    id: 'test-map',
    name: 'Test map',
    tileset: tileset.id,
    width,
    height,
    layers: { ground, objects },
    colliders: [],
    spawns,
  };
}

describe('validateMapDocument', () => {
  it('reports every unknown tile id with its coordinates', () => {
    const doc = mapWith({ spawns: [{ x: 1, y: 1 }] });
    doc.layers.ground[1]![2] = 42;
    const issues = validateMapDocument(doc, tileset);
    expect(issues).toContainEqual(expect.objectContaining({ code: 'UNKNOWN_TILE', x: 2, y: 1 }));
  });

  it('reports several unknown tiles in row-major order', () => {
    const doc = mapWith({ spawns: [{ x: 1, y: 1 }] });
    doc.layers.ground[3]![5] = 99;
    doc.layers.ground[0]![7] = 98;
    const unknown = validateMapDocument(doc, tileset).filter(
      (issue) => issue.code === 'UNKNOWN_TILE',
    );
    expect(unknown).toEqual([
      expect.objectContaining({ x: 7, y: 0 }),
      expect.objectContaining({ x: 5, y: 3 }),
    ]);
  });

  it('reports a map without spawn', () => {
    const doc = mapWith({ spawns: [] });
    expect(validateMapDocument(doc, tileset)).toEqual([
      { code: 'NO_SPAWN', message: expect.any(String) },
    ]);
  });

  it('reports a spawn outside the map and one on a wall', () => {
    const doc = mapWith({
      solid: [[1, 1]],
      spawns: [
        { x: 9, y: 1 },
        { x: 1, y: 1 },
      ],
    });
    const issues = validateMapDocument(doc, tileset);
    expect(issues).toEqual([
      expect.objectContaining({ code: 'SPAWN_OUT_OF_BOUNDS', x: 9, y: 1 }),
      expect.objectContaining({ code: 'SPAWN_ON_SOLID', x: 1, y: 1 }),
    ]);
  });

  it('reports two spawns on the same tile once', () => {
    const doc = mapWith({
      spawns: [
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ],
    });
    const issues = validateMapDocument(doc, tileset);
    expect(issues).toEqual([expect.objectContaining({ code: 'SPAWN_DUPLICATE', x: 1, y: 1 })]);
  });

  it('reports a spawn walled off from the first spawn', () => {
    const solid: [number, number][] = Array.from({ length: 8 }, (_, y) => [4, y]);
    const doc = mapWith({
      solid,
      spawns: [
        { x: 1, y: 1 },
        { x: 6, y: 6 },
      ],
    });
    const issues = validateMapDocument(doc, tileset);
    expect(issues).toEqual([expect.objectContaining({ code: 'SPAWN_UNREACHABLE', x: 6, y: 6 })]);
  });

  it('accepts a diagonal gap only when a 4-neighbour path exists', () => {
    const solid: [number, number][] = Array.from({ length: 8 }, (_, y): [number, number] => [
      4,
      y,
    ]).filter(([, y]) => y !== 3);
    const doc = mapWith({
      solid,
      spawns: [
        { x: 1, y: 1 },
        { x: 6, y: 6 },
      ],
    });
    expect(validateMapDocument(doc, tileset)).toEqual([]);
  });

  it('treats an unknown tile as solid so it never hides a wall', () => {
    const doc = mapWith({
      spawns: [
        { x: 0, y: 0 },
        { x: 7, y: 7 },
      ],
    });
    for (let y = 0; y < 8; y++) doc.layers.ground[y]![4] = 77;
    const issues = validateMapDocument(doc, tileset);
    expect(
      issues.some((issue) => issue.code === 'SPAWN_UNREACHABLE' && issue.x === 7 && issue.y === 7),
    ).toBe(true);
  });

  it('accepts a fully open map with a single spawn', () => {
    const doc = mapWith({ spawns: [{ x: 0, y: 0 }] });
    expect(validateMapDocument(doc, tileset)).toEqual([]);
  });
});

describe('spawnIssues', () => {
  it('requires generic spawns for ffa', () => {
    const doc = mapWith({
      spawns: [
        { x: 1, y: 1, team: 0 },
        { x: 6, y: 6, team: 1 },
        { x: 1, y: 6 },
      ],
    });
    const issues = spawnIssues(doc, { mode: 'ffa', teamCount: 2, playersPerTeam: 1 });
    expect(issues).toEqual([
      { code: 'NOT_ENOUGH_SPAWNS', message: '2 apparitions libres nécessaires, 1 trouvées' },
    ]);
  });

  it('accepts enough generic spawns for ffa', () => {
    const doc = mapWith({
      spawns: [
        { x: 1, y: 1 },
        { x: 6, y: 6 },
      ],
    });
    expect(spawnIssues(doc, { mode: 'ffa', teamCount: 2, playersPerTeam: 1 })).toEqual([]);
  });

  it('requires per-team spawns in team mode and accepts the generic fallback', () => {
    const doc = mapWith({
      spawns: [
        { x: 1, y: 1, team: 0 },
        { x: 2, y: 1, team: 0 },
        { x: 6, y: 6, team: 1 },
      ],
    });
    const issues = spawnIssues(doc, { mode: 'team', teamCount: 2, playersPerTeam: 2 });
    expect(issues).toEqual([
      { code: 'NOT_ENOUGH_SPAWNS', message: "l'équipe 2 a besoin de 2 apparitions, 1 trouvées" },
    ]);
  });

  it('lets generic spawns cover every team when the map tags none of them', () => {
    const doc = mapWith({
      spawns: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 6, y: 6 },
        { x: 6, y: 5 },
      ],
    });
    expect(spawnIssues(doc, { mode: 'team', teamCount: 2, playersPerTeam: 2 })).toEqual([]);
  });

  it('accepts ffa spawns regardless of playersPerTeam', () => {
    const doc = mapWith({
      spawns: [
        { x: 1, y: 1 },
        { x: 6, y: 6 },
      ],
    });
    expect(spawnIssues(doc, { mode: 'ffa', teamCount: 2, playersPerTeam: 3 })).toEqual([]);
  });

  it('requires the aggregate generic count when no spawn is tagged', () => {
    const doc = mapWith({
      spawns: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 6, y: 6 },
      ],
    });
    expect(spawnIssues(doc, { mode: 'team', teamCount: 2, playersPerTeam: 2 })).toEqual([
      { code: 'NOT_ENOUGH_SPAWNS', message: '4 apparitions libres nécessaires, 3 trouvées' },
    ]);
  });

  it('ignores the generic pool once a spawn is tagged, even with plenty of generics', () => {
    const doc = mapWith({
      spawns: [
        { x: 1, y: 1, team: 0 },
        { x: 2, y: 1, team: 0 },
        { x: 6, y: 6, team: 1 },
        { x: 5, y: 6 },
        { x: 5, y: 5 },
        { x: 4, y: 5 },
      ],
    });
    expect(spawnIssues(doc, { mode: 'team', teamCount: 2, playersPerTeam: 2 })).toEqual([
      { code: 'NOT_ENOUGH_SPAWNS', message: "l'équipe 2 a besoin de 2 apparitions, 1 trouvées" },
    ]);
  });
});
