import { describe, expect, it } from 'vitest';
import { AbilityDefinitionSchema } from './ability';
import { MapDefinitionSchema } from './map';
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
