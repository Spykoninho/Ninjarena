import { describe, expect, it } from 'vitest';
import { isSolidTile, validateMapDocument } from '@ninjarena/core';
import type { Effect } from '@ninjarena/core';
import { loadContent, loadMap } from './index';

describe('content', () => {
  const content = loadContent();

  it('validates every definition and exposes the default loadout', () => {
    const ninja = content.characters.get('ninja');
    expect(content.abilities.has(ninja.basicAttackId)).toBe(true);
    expect(content.abilities.has(ninja.dashId)).toBe(true);
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
      'explosive-mine',
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

  it('sets the default build budget and technique slots', () => {
    expect(content.statRules.defaultPointBudget).toBe(10);
    expect(content.statRules.techniqueSlots).toBe(3);
  });

  it('builds the arena with merged wall colliders, a polygon and spawns for 6 players', () => {
    const map = loadMap(content, 'arena');
    expect(map.widthInUnits).toBe(640);
    expect(map.colliders.some((s) => s.type === 'polygon')).toBe(true);
    expect(map.spawns.filter((s) => s.team === 0)).toHaveLength(3);
    expect(map.spawns.filter((s) => s.team === 1)).toHaveLength(3);
    expect(map.spawns.filter((s) => s.team === undefined)).toHaveLength(4);
    for (const spawn of map.spawns) expect(map.terrainAt(spawn).solid).toBe(false);
  });

  it('ships the decor tiles with the layer and solidity the renderer expects', () => {
    const tiles = content.tilesets.get('default').tiles;
    const byName = new Map(Object.values(tiles).map((tile) => [tile.name, tile]));
    for (const name of ['lantern', 'rock', 'fence', 'well', 'crate', 'torii']) {
      const tile = byName.get(name);
      expect(tile?.layer).toBe('objects');
      expect(tile?.solid).toBe(true);
    }
    for (const name of ['path', 'flowers']) {
      const tile = byName.get(name);
      expect(tile?.layer).toBe('ground');
      expect(tile?.solid).toBe(false);
      expect(tile?.speedMultiplier).toBe(1);
    }
    // Le feu garde son bonus d'herbe sur les fleurs; la terre battue reste neutre.
    expect(byName.get('flowers')?.tags).toEqual(['grass']);
    expect(byName.get('path')?.tags).toEqual([]);
  });

  it('keeps every bundled map valid once the decor is placed', () => {
    for (const map of content.maps.all()) {
      expect(validateMapDocument(map, content.tilesets.get(map.tileset))).toEqual([]);
    }
  });

  it('walks the decorated courtyard track and blocks its solid decor', () => {
    const map = loadMap(content, 'cour-des-berges');
    const tileset = content.tilesets.get('default');
    const named = (name: string) =>
      Object.entries(tileset.tiles).find(([, tile]) => tile.name === name)?.[0];
    const objects = content.maps.get('cour-des-berges').layers.objects;
    for (const name of ['lantern', 'rock', 'fence', 'well', 'crate', 'torii']) {
      const id = Number(named(name));
      const cells: [number, number][] = [];
      objects.forEach((row, y) =>
        row.forEach((cell, x) => {
          if (cell === id) cells.push([x, y]);
        }),
      );
      expect(cells.length).toBeGreaterThan(0);
      for (const [x, y] of cells) expect(map.tileAt(x, y).solid).toBe(true);
    }
    const ground = content.maps.get('cour-des-berges').layers.ground;
    const groundCells = (name: string) => {
      const id = Number(named(name));
      const cells: [number, number][] = [];
      ground.forEach((row, y) =>
        row.forEach((cell, x) => {
          if (cell === id) cells.push([x, y]);
        }),
      );
      return cells;
    };
    for (const name of ['path', 'flowers']) {
      const cells = groundCells(name);
      expect(cells.length).toBeGreaterThan(0);
      for (const [x, y] of cells)
        if (objects[y]?.[x] == null) expect(map.tileAt(x, y).solid).toBe(false);
    }
    for (const [x, y] of groundCells('flowers')) expect(map.tileAt(x, y).tags).toContain('grass');
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
