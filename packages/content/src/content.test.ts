import { describe, expect, it } from 'vitest';
import { buildBudget, isSolidTile } from '@ninjarena/core';
import type { Effect } from '@ninjarena/core';
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

  it('ships the whole ability roster with a telegraph on every technique', () => {
    expect(content.abilities.all().map((a) => a.id)).toEqual([
      'kunai-strike',
      'shuriken-throw',
      'shadow-step',
      'blink',
      'lightning-dash',
      'chakra-shield',
      'paralysis-seal',
      'fireball',
      'seismic-slam',
      'earth-wall',
    ]);
    for (const ability of content.abilities.all()) {
      if (ability.kind !== 'technique') continue;
      expect(ability.telegraph).not.toBeNull();
    }
  });

  it('offers a choice of basic attacks', () => {
    const basicAttacks = content.abilities.all().filter((a) => a.kind === 'basic');
    expect(basicAttacks.length).toBeGreaterThanOrEqual(2);
  });

  it('gives every projectile, zone and wall a visual', () => {
    for (const ability of content.abilities.all()) {
      for (const effect of flatten(ability.effects)) {
        if (
          effect.type !== 'projectile' &&
          effect.type !== 'area' &&
          effect.type !== 'spawnEntity'
        ) {
          continue;
        }
        expect(effect.visual.color).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
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

  it('parses every bundled map document with a known tileset and open spawns', () => {
    for (const map of content.maps.all()) {
      expect(content.tilesets.has(map.tileset)).toBe(true);
      const tileset = content.tilesets.get(map.tileset);
      for (const spawn of map.spawns) {
        const ground = map.layers.ground[spawn.y]?.[spawn.x];
        const object = map.layers.objects[spawn.y]?.[spawn.x] ?? null;
        expect(ground).toBeDefined();
        expect(isSolidTile(tileset, ground as number, object)).toBe(false);
      }
    }
  });
});

// Les briques composables s'imbriquent: la vérification descend dans chaque sous-liste.
function flatten(effects: readonly Effect[]): Effect[] {
  const all: Effect[] = [];
  for (const effect of effects) {
    all.push(effect);
    if ('onHit' in effect) all.push(...flatten(effect.onHit));
    if (effect.type === 'projectile') all.push(...flatten(effect.onExpire));
    if (effect.type === 'dash') all.push(...flatten(effect.onContact));
    if (effect.type === 'delayedTrigger') all.push(...flatten(effect.effects));
  }
  return all;
}
