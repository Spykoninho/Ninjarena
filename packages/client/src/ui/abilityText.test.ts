import type { AbilityDefinition } from '@ninjarena/core';
import { describe, expect, it } from 'vitest';
import { abilityFacts, describeAbility } from './abilityText';

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
      'Fires a projectile; on hit, 22 technique damage, knocks back; at the end of its flight, blasts a 2-tile area; on hit, 12 technique damage (x1.25 on grass).',
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
      'After 0.6s, blasts a 2.5-tile area at the aim (up to 10 tiles away); on hit, stuns for 0.4s.',
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
    expect(text).toBe('Dashes 10 tiles; anyone crossed takes 20 damage, slows by 50% for 1.5s.');
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
    expect(text).toBe('Absorbs 40 damage for 3s. Raises a 3-tile wide wall for 4s.');
  });
});

describe('abilityFacts', () => {
  it('lists the chakra cost, the cooldown and the cast time', () => {
    expect(abilityFacts(ability({}))).toBe('25 chakra · 4s cooldown · 0.25s cast');
  });

  it('says a free ability costs no chakra and skips an instant cast', () => {
    expect(abilityFacts(ability({ chakraCost: 0, startupMs: 0, cooldownMs: 350 }))).toBe(
      'no chakra · 0.35s cooldown',
    );
  });
});
