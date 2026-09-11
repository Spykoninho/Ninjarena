import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_ID, loadContent, loadMap } from './index';

describe('content', () => {
  const content = loadContent();

  it('validates every definition and exposes the default loadout', () => {
    const ninja = content.characters.get('ninja');
    for (const id of ninja.abilities) expect(content.abilities.has(id)).toBe(true);
    expect(content.matchModes.all().map((m) => m.id)).toEqual([
      'duel',
      'ffa-3',
      'ffa-4',
      '2v2',
      '3v3',
    ]);
  });

  it('builds the arena with merged wall colliders, a polygon and spawns for 6 players', () => {
    const map = loadMap(content, DEFAULT_MAP_ID);
    expect(map.widthInUnits).toBe(640);
    expect(map.colliders.some((s) => s.type === 'polygon')).toBe(true);
    expect(map.spawns.filter((s) => s.team === 0)).toHaveLength(3);
    expect(map.spawns.filter((s) => s.team === 1)).toHaveLength(3);
    expect(map.spawns.filter((s) => s.team === undefined)).toHaveLength(4);
    for (const spawn of map.spawns) expect(map.terrainAt(spawn).solid).toBe(false);
  });
});
