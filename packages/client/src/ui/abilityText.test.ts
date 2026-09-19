import type { AbilityDefinition } from '@ninjarena/core';
import { describe, expect, it } from 'vitest';
import {
  abilityFacts,
  damageDetail,
  damageProfile,
  damageTotal,
  describeAbility,
} from './abilityText';

function ability(overrides: Partial<AbilityDefinition>): AbilityDefinition {
  return {
    id: 'test',
    name: 'Test',
    kind: 'technique',
    cooldownMs: 4000,
    chakraCost: 25,
    startupMs: 250,
    activeMs: 0,
    recoveryMs: 100,
    canMoveWhileCasting: false,
    telegraph: null,
    tags: [],
    effects: [{ type: 'teleport', distance: 120 }],
    ...overrides,
  };
}

describe('describeAbility', () => {
  it('prefers the description written in the ability file', () => {
    expect(describeAbility(ability({ description: 'Hand-written.' }))).toBe('Hand-written.');
  });

  it('tells a projectile, what it does on hit and what it does when it expires', () => {
    const text = describeAbility(
      ability({
        effects: [
          {
            type: 'projectile',
            speed: 380,
            radius: 4,
            lifetimeMs: 900,
            visual: { color: '#ff6a3d', size: 5, trail: true },
            onHit: [
              { type: 'damage', amount: 22, scaling: 'technique', terrain: [] },
              { type: 'knockback', speed: 220, durationMs: 100 },
            ],
            onExpire: [
              {
                type: 'area',
                radius: 32,
                delayMs: 0,
                triggerRadius: 0,
                origin: 'here',
                range: 0,
                visual: { color: '#ff9a3d', size: 28, trail: false },
                onHit: [
                  {
                    type: 'damage',
                    amount: 12,
                    scaling: 'technique',
                    terrain: [{ tag: 'grass', damageMultiplier: 1.25 }],
                  },
                ],
                terrain: [],
              },
            ],
          },
        ],
      }),
    );
    expect(text).toBe(
      'Tire un projectile ; à l’impact, 22 dégâts de technique, repousse ; en fin de course, frappe une zone de 2 cases ; à l’impact, 12 dégâts de technique (×1.25 sur l’herbe).',
    );
  });

  it('tells a delayed area at the aim in tiles and seconds', () => {
    const text = describeAbility(
      ability({
        effects: [
          {
            type: 'area',
            radius: 40,
            delayMs: 600,
            triggerRadius: 0,
            origin: 'aim',
            range: 160,
            visual: { color: '#c9a26b', size: 40, trail: false },
            onHit: [{ type: 'stun', durationMs: 400 }],
            terrain: [],
          },
        ],
      }),
    );
    expect(text).toBe(
      'Après 0.6 s, frappe une zone de 2.5 cases à la visée (jusqu’à 10 cases) ; à l’impact, étourdit 0.4 s.',
    );
  });

  it('tells a dash, its contact effects and a slow as a percentage', () => {
    const text = describeAbility(
      ability({
        effects: [
          {
            type: 'dash',
            distance: 160,
            durationMs: 180,
            invulnerableTicks: 0,
            onContact: [
              { type: 'damage', amount: 20, scaling: 'none', terrain: [] },
              { type: 'applyStatus', status: 'SLOWED', durationMs: 1500, magnitude: 0.5 },
            ],
          },
        ],
      }),
    );
    expect(text).toBe(
      'Fonce sur 10 cases ; quiconque est traversé subit 20 dégâts, ralentit de 50 % pendant 1.5 s.',
    );
  });

  it('joins several top-level effects as sentences', () => {
    const text = describeAbility(
      ability({
        effects: [
          { type: 'shield', amount: 40, durationMs: 3000 },
          {
            type: 'spawnEntity',
            entity: 'wall',
            width: 48,
            thickness: 8,
            offset: 32,
            lifetimeMs: 4000,
            visual: { color: '#8a6a4b', size: 8, trail: false },
          },
        ],
      }),
    );
    expect(text).toBe(
      'Absorbe 40 dégâts pendant 3 s. Dresse un mur de 3 cases de large pendant 4 s.',
    );
  });
});

describe('damageProfile', () => {
  const fireball = ability({
    effects: [
      {
        type: 'projectile',
        speed: 380,
        radius: 4,
        lifetimeMs: 900,
        visual: { color: '#ff6a3d', size: 5, trail: true },
        onHit: [
          { type: 'damage', amount: 22, scaling: 'technique', terrain: [] },
          {
            type: 'area',
            radius: 28,
            delayMs: 0,
            triggerRadius: 0,
            origin: 'here',
            range: 0,
            visual: { color: '#ff9a3d', size: 28, trail: false },
            onHit: [{ type: 'damage', amount: 12, scaling: 'technique', terrain: [] }],
            terrain: [],
          },
        ],
        onExpire: [
          {
            type: 'area',
            radius: 28,
            delayMs: 0,
            triggerRadius: 0,
            origin: 'here',
            range: 0,
            visual: { color: '#ff9a3d', size: 28, trail: false },
            onHit: [{ type: 'damage', amount: 12, scaling: 'technique', terrain: [] }],
            terrain: [],
          },
        ],
      },
    ],
  });

  it('counts the damage of one landed hit, not the expiry fallback of a projectile', () => {
    expect(damageProfile(fireball)).toEqual([
      { amount: 22, scaling: 'technique', context: 'hit' },
      { amount: 12, scaling: 'technique', context: 'area' },
    ]);
  });

  it('falls back to the expiry damage of a projectile that does nothing on hit', () => {
    const mine = ability({
      effects: [
        {
          type: 'projectile',
          speed: 100,
          radius: 4,
          lifetimeMs: 500,
          visual: { color: '#ffffff', size: 4, trail: false },
          onHit: [{ type: 'stun', durationMs: 200 }],
          onExpire: [{ type: 'damage', amount: 9, scaling: 'none', terrain: [] }],
        },
      ],
    });
    expect(damageProfile(mine)).toEqual([{ amount: 9, scaling: 'none', context: 'area' }]);
  });

  it('scales each entry by the multiplier of its kind and sums them', () => {
    const entries = damageProfile(fireball);
    expect(damageTotal(entries, { physical: 1, technique: 1 })).toBe(34);
    expect(damageTotal(entries, { physical: 2, technique: 1.5 })).toBe(51);
    expect(damageDetail(entries, { physical: 1, technique: 1.5 })).toBe(
      '51 (33 à l’impact + 18 en zone)',
    );
  });

  it('gives a plain total for a single-hit ability and nothing for a harmless one', () => {
    const slash = damageProfile(
      ability({
        effects: [
          {
            type: 'melee',
            range: 22,
            arcDegrees: 100,
            onHit: [{ type: 'damage', amount: 14, scaling: 'physical', terrain: [] }],
          },
        ],
      }),
    );
    expect(damageDetail(slash, { physical: 1.12, technique: 1 })).toBe('15.7');
    expect(damageDetail(damageProfile(ability({})), { physical: 1, technique: 1 })).toBe('');
  });
});

describe('abilityFacts', () => {
  it('lists the chakra cost, the cooldown and the cast time', () => {
    expect(abilityFacts(ability({}))).toBe('25 chakra · 4 s de recharge · 0.25 s d’incantation');
  });

  it('says a free ability costs no chakra and skips an instant cast', () => {
    expect(abilityFacts(ability({ chakraCost: 0, startupMs: 0, cooldownMs: 350 }))).toBe(
      'sans chakra · 0.35 s de recharge',
    );
  });
});
