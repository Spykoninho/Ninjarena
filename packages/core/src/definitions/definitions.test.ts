import { describe, expect, it } from 'vitest';
import { AbilityDefinitionSchema } from './ability';
import { migrateMapDocument, spawnWorldPosition } from './mapDocument';
import { MatchConfigSchema } from './matchConfig';

describe('AbilityDefinitionSchema', () => {
  const base = {
    id: 'fireball',
    name: 'Fireball',
    kind: 'technique',
    cooldownMs: 4000,
    chakraCost: 25,
    startupMs: 200,
    recoveryMs: 150,
  };

  it('accepts a nested projectile and fills defaults', () => {
    const ability = AbilityDefinitionSchema.parse({
      ...base,
      effects: [
        {
          type: 'projectile',
          speed: 320,
          radius: 5,
          lifetimeMs: 900,
          visual: { color: '#ff8844', size: 5 },
          onHit: [
            {
              type: 'area',
              radius: 40,
              origin: 'here',
              visual: { color: '#ff8844', size: 40 },
              onHit: [{ type: 'damage', amount: 26 }],
            },
          ],
        },
      ],
    });
    const projectile = ability.effects[0];
    expect(projectile?.type).toBe('projectile');
    if (projectile?.type !== 'projectile') throw new Error('unreachable');
    expect(projectile.onExpire).toEqual([]);
    expect(projectile.visual.trail).toBe(false);
    const area = projectile.onHit[0];
    if (area?.type !== 'area') throw new Error('unreachable');
    expect(area.delayMs).toBe(0);
    expect(area.range).toBe(0);
    expect(area.terrain).toEqual([]);
    const damage = area.onHit[0];
    if (damage?.type !== 'damage') throw new Error('unreachable');
    expect(damage.scaling).toBe('technique');
    expect(ability.telegraph).toBeNull();
    expect(ability.activeMs).toBe(0);
    expect(ability.canMoveWhileCasting).toBe(false);
    expect(ability.tags).toEqual([]);
  });

  it('keeps a telegraph and defaults its anchor to the caster', () => {
    const ability = AbilityDefinitionSchema.parse({
      ...base,
      telegraph: { kind: 'ground-circle', color: '#ff8844', size: 40 },
      effects: [{ type: 'teleport', distance: 120 }],
    });
    expect(ability.telegraph?.anchor).toBe('caster');
  });

  it('rejects an unknown effect type', () => {
    const result = AbilityDefinitionSchema.safeParse({
      ...base,
      effects: [{ type: 'mindControl', durationMs: 100 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a kind outside basic, dash and technique', () => {
    const result = AbilityDefinitionSchema.safeParse({
      ...base,
      kind: 'ultimate',
      effects: [{ type: 'teleport', distance: 120 }],
    });
    expect(result.success).toBe(false);
  });
});

describe('MapDocument', () => {
  const smallMap = (): unknown => ({
    version: 1,
    id: 'tiny',
    name: 'Tiny',
    tileset: 'default',
    width: 8,
    height: 8,
    layers: {
      ground: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 0)),
      objects: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null)),
    },
    spawns: [
      { x: 1, y: 1 },
      { x: 6, y: 6, team: 1 },
    ],
  });

  it('parses a v1 document and defaults colliders to an empty list', () => {
    const doc = migrateMapDocument(smallMap());
    expect(doc.colliders).toEqual([]);
    expect(doc.spawns[1]).toEqual({ x: 6, y: 6, team: 1 });
  });

  it('rejects a ground row of the wrong width', () => {
    const raw = smallMap() as { layers: { ground: number[][] } };
    raw.layers.ground[2] = [0, 0, 0];
    expect(() => migrateMapDocument(raw)).toThrow(/row 2/);
  });

  it('rejects a null ground tile but accepts a null object tile', () => {
    const raw = smallMap() as { layers: { ground: (number | null)[][] } };
    raw.layers.ground[0]![0] = null;
    expect(() => migrateMapDocument(raw)).toThrow(/ground/);
  });

  it('rejects an unknown format version with a clear message', () => {
    expect(() => migrateMapDocument({ ...(smallMap() as object), version: 7 })).toThrow(
      'unsupported map format version 7',
    );
  });

  it('rejects sizes outside 8..128 and more than 64 spawns', () => {
    expect(() => migrateMapDocument({ ...(smallMap() as object), width: 129 })).toThrow();
    const raw = smallMap() as { spawns: unknown[] };
    raw.spawns = Array.from({ length: 65 }, (_, i) => ({ x: i % 8, y: Math.floor(i / 8) }));
    expect(() => migrateMapDocument(raw)).toThrow();
  });

  it('places a spawn at the centre of its tile', () => {
    expect(spawnWorldPosition({ x: 2, y: 3 }, 16)).toEqual({ x: 40, y: 56 });
  });
});

describe('MatchConfigSchema', () => {
  it('rejects ffa with several players per team', () => {
    const result = MatchConfigSchema.safeParse({
      id: 'bad',
      mode: 'ffa',
      teamCount: 3,
      playersPerTeam: 2,
      roundsToWin: 1,
      roundDurationMs: 1000,
      countdownMs: 0,
      roundEndDelayMs: 0,
    });
    expect(result.success).toBe(false);
  });
});
