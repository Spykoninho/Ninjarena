import { describe, expect, it } from 'vitest';
import { AbilityDefinitionSchema } from './ability';
import { MapDefinitionSchema } from './map';
import { MatchConfigSchema } from './matchConfig';

describe('AbilityDefinitionSchema', () => {
  it('accepts a projectile ability and fills defaults', () => {
    const ability = AbilityDefinitionSchema.parse({
      id: 'shuriken',
      name: 'Shuriken',
      cooldownMs: 900,
      energyCost: 10,
      startupMs: 100,
      recoveryMs: 150,
      effects: [
        {
          type: 'projectile',
          speed: 420,
          radius: 3,
          lifetimeMs: 900,
          onHit: [{ type: 'damage', amount: 18 }],
        },
      ],
    });
    expect(ability.canMoveWhileCasting).toBe(false);
    expect(ability.tags).toEqual([]);
  });

  it('rejects an unknown effect type', () => {
    const result = AbilityDefinitionSchema.safeParse({
      id: 'x',
      name: 'x',
      cooldownMs: 0,
      energyCost: 0,
      startupMs: 0,
      recoveryMs: 0,
      effects: [{ type: 'teleport' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('MapDefinitionSchema', () => {
  const base = {
    id: 'm',
    name: 'm',
    tileset: 'default',
    width: 3,
    height: 2,
    legend: { '.': 0, '#': 1 },
    layers: { ground: ['...', '...'], objects: ['# #', '   '] },
    spawns: [{ x: 8, y: 8 }],
  };

  it('accepts ASCII layers matching the declared size', () => {
    expect(MapDefinitionSchema.safeParse(base).success).toBe(true);
  });

  it('rejects rows of the wrong width and characters missing from the legend', () => {
    expect(
      MapDefinitionSchema.safeParse({
        ...base,
        layers: { ground: ['....', '...'], objects: base.layers.objects },
      }).success,
    ).toBe(false);
    expect(
      MapDefinitionSchema.safeParse({
        ...base,
        layers: { ground: ['..?', '...'], objects: base.layers.objects },
      }).success,
    ).toBe(false);
  });

  it('rejects the empty character in the ground layer even when the legend declares it', () => {
    expect(
      MapDefinitionSchema.safeParse({
        ...base,
        legend: { ...base.legend, ' ': 2 },
        layers: { ground: ['. .', '...'], objects: base.layers.objects },
      }).success,
    ).toBe(false);
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
