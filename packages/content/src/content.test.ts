import { describe, expect, it } from 'vitest';
import { buildBudget } from '@ninjarena/core';
import { DEFAULT_MAP_ID, loadContent, loadMap } from './index';

describe('content', () => {
  const content = loadContent();

  it('validates every definition and exposes the default loadout', () => {
    const ninja = content.characters.get('ninja');
    expect(content.abilities.has(ninja.basicAttackId)).toBe(true);
    expect(content.abilities.has(ninja.dashId)).toBe(true);
    expect(content.matchModes.all().map((m) => m.id)).toEqual([
      'duel',
      'ffa-3',
      'ffa-4',
      '2v2',
      '3v3',
    ]);
  });

  it('gives every mode a build budget and a four-minute round', () => {
    for (const mode of content.matchModes.all()) {
      expect(mode.buildPoints).toBe(10);
      expect(buildBudget(mode, content.statRules)).toBe(10);
      expect(mode.roundDurationMs).toBe(240000);
      expect(mode.roundsToWin).toBe(mode.id === '3v3' ? 3 : 2);
    }
    expect(content.statRules.defaultPointBudget).toBe(10);
    expect(content.statRules.techniqueSlots).toBe(3);
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
