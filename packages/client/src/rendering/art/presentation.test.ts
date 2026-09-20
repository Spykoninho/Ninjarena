import { describe, expect, it } from 'vitest';
import { loadContent, loadMap, DEFAULT_MAP_ID } from '@ninjarena/content';
import { animationOf, facing, poseFrame, teamCodes, viewport } from './presentation';
import { buildingGeometry } from './volumeArt';
import { buildingRectangle } from './buildingArt';
import { neighborMask } from './terrainArt';
import { abilityFamily } from './abilityVisual';
import { dashPreviewDistance } from './telegraphGeometry';

describe('pixel presentation contract', () => {
  it('describes area control, ranged control and walls with distinct HUD families', () => {
    const abilities = loadContent().abilities;
    expect(abilityFamily(abilities.get('sky-strike'))).toBe('area');
    expect(abilityFamily(abilities.get('seismic-slam'))).toBe('control');
    expect(abilityFamily(abilities.get('paralysis-seal'))).toBe('control');
    expect(abilityFamily(abilities.get('earth-wall'))).toBe('wall');
  });
  it('preserves field of view and integer pixels at different screen sizes', () => {
    expect(viewport(1920, 1080, 3)).toEqual({ zoom: 3, width: 640, height: 360, x: 0, y: 0 });
    expect(viewport(2560, 1080, 4)).toEqual({ zoom: 3, width: 854, height: 360, x: -1, y: 0 });
    expect(viewport(844, 998, 3)).toEqual({ zoom: 1, width: 844, height: 998, x: 0, y: 0 });
    expect(viewport(1400, 900, 4)).toEqual({ zoom: 2, width: 700, height: 450, x: 0, y: 0 });
  });
  it('keeps diagonal aim from flickering and supports every cardinal direction', () => {
    expect(facing({ x: 0.71, y: 0.7 }, 'e')).toBe('e');
    expect(facing({ x: 0, y: -1 }, 's')).toBe('n');
    expect(facing({ x: -1, y: 0 }, 's')).toBe('w');
  });
  it('gives death and imposed movement priority over locomotion and hit poses', () => {
    expect(animationOf('DEAD', true, true, true)).toBe('death');
    expect(animationOf('DASHING', true, false, true)).toBe('dash');
    expect(animationOf('CASTING', true, true, true)).toBe('attack');
    expect(poseFrame('death', 5000, 0)).toBe(5);
    expect(poseFrame('attack', 500, 0)).toBe(0);
    expect(poseFrame('attack', 500, 0, 0)).toBe(1);
    expect(poseFrame('attack', 500, 0, 60)).toBe(2);
    expect(poseFrame('attack', 500, 0, 200)).toBe(3);
    expect(poseFrame('cast', 300, 0)).toBe(3);
    expect(poseFrame('cast', 300, 0, 10)).toBe(4);
    expect(poseFrame('walk', 100, 9)).toBe(poseFrame('walk', 900, 9));
  });
  it('uses unique, deterministic team codes without modulo collisions', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `team-${i}`);
    expect([...teamCodes(ids).values()]).toHaveLength(12);
    expect(teamCodes(ids)).toEqual(teamCodes([...ids].reverse()));
  });
  it('adds building depth along the roof axis while preserving wall height and ground anchoring', () => {
    const shallow = buildingGeometry(160, 64),
      deep = buildingGeometry(160, 96);
    expect(deep.roofDepth - shallow.roofDepth).toBe(32);
    expect(deep.base - deep.eave).toBe(shallow.base - shallow.eave);
    expect(deep.base - deep.footY).toBe(96);
    expect(deep.width - deep.footX * 2).toBe(160);
    expect(deep.ridgeFront).toBeGreaterThan(deep.ridgeBack);
    expect(deep.eave).toBeGreaterThan(deep.ridgeFront);
  });
  it('does not cover a hole in an L shaped building footprint', () => {
    const cells = new Set(['0:0', '1:0', '0:1']);
    expect(buildingRectangle(0, 0, (x, y) => cells.has(`${x}:${y}`), new Set())).toEqual({
      width: 2,
      height: 1,
    });
    expect(buildingRectangle(5, 5, () => false, new Set())).toEqual({ width: 0, height: 0 });
  });
  it('retains concave diagonal information for shoreline transitions', () => {
    expect(neighborMask(0, 0, () => true)).toBe(255);
    expect(neighborMask(0, 0, (x, y) => !(x === -1 && y === -1))).toBe(239);
  });
  it('stops a dash preview before a temporary wall and before map bounds', () => {
    const map = loadMap(loadContent(), 'arena');
    const distance = dashPreviewDistance(map, { x: 100, y: 150 }, { x: 1, y: 0 }, 90, 5, [
      { type: 'rect', x: 120, y: 140, width: 8, height: 20 },
    ]);
    expect(distance).toBe(15);
    expect(dashPreviewDistance(map, { x: 30, y: 150 }, { x: -1, y: 0 }, 90, 5)).toBeLessThanOrEqual(
      25,
    );
  });
  it('ships a playable courtyard with real paving, bridges, open spawns and no loose rocks', () => {
    const content = loadContent(),
      map = loadMap(content, DEFAULT_MAP_ID);
    expect(DEFAULT_MAP_ID).toBe('cour-des-berges');
    for (const p of map.spawns) expect(map.terrainAt(p).solid).toBe(false);
    expect(map.tileAt(27, 11).tags).toContain('bridge');
    expect(map.tileAt(27, 11).speedMultiplier).toBe(1);
    expect(map.tileAt(27, 10).tags).toContain('water');
    expect(map.tileAt(27, 10).speedMultiplier).toBe(0.6);
    expect(map.objectTileIdAt(10, 2)).toBe(5);
    expect(content.maps.get(DEFAULT_MAP_ID).colliders).toHaveLength(0);
  });
  it('keeps the shrub collision explicit and all courtyard spawns connected to the bridge', () => {
    const content = loadContent(),
      map = loadMap(content, DEFAULT_MAP_ID);
    expect(content.tilesets.get('default').tiles['8']?.solid).toBe(true);
    expect(map.objectTileIdAt(2, 5)).toBe(8);
    const queue: [number, number][] = [[27, 11]],
      seen = new Set(['27:11']);
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i]!;
      for (const [dx, dy] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ]) {
        const xx = x + dx!,
          yy = y + dy!,
          key = `${xx}:${yy}`;
        if (
          xx < 0 ||
          yy < 0 ||
          xx >= map.widthInTiles ||
          yy >= map.heightInTiles ||
          seen.has(key) ||
          map.terrainAt({ x: (xx + 0.5) * map.tileSize, y: (yy + 0.5) * map.tileSize }).solid
        )
          continue;
        seen.add(key);
        queue.push([xx, yy]);
      }
    }
    for (const spawn of map.spawns)
      expect(
        seen.has(`${Math.floor(spawn.x / map.tileSize)}:${Math.floor(spawn.y / map.tileSize)}`),
      ).toBe(true);
  });
});
