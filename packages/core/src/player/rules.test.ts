import { describe, expect, it } from 'vitest';
import { CharacterDefinitionSchema } from '../definitions';
import { controlsMovement, isDamageable, statusSpeedMultiplier } from './rules';
import { createPlayerState } from './state';
import { upsertStatus } from './status';

const ninja = CharacterDefinitionSchema.parse({
  id: 'ninja',
  name: 'Ninja',
  stats: {
    maxHealth: 100,
    maxChakra: 100,
    moveSpeed: 140,
    chakraRegenPerSecond: 8,
    colliderRadius: 5,
  },
  abilities: ['shuriken'],
});
const player = () =>
  createPlayerState({ id: 'p1', teamId: 't1', character: ninja, position: { x: 0, y: 0 } });

describe('player rules', () => {
  it('ROOTED blocks movement without changing the phase', () => {
    const p = player();
    upsertStatus(p, { type: 'ROOTED', expiresAt: 100 });
    expect(controlsMovement(p, false)).toBe(false);
    expect(p.phase.kind).toBe('NORMAL');
  });

  it('SLOWED multiplies speed by its magnitude', () => {
    const p = player();
    upsertStatus(p, { type: 'SLOWED', expiresAt: 100, magnitude: 0.4 });
    expect(statusSpeedMultiplier(p)).toBe(0.4);
  });

  it('INVULNERABLE players are alive but not damageable', () => {
    const p = player();
    upsertStatus(p, { type: 'INVULNERABLE', expiresAt: 100 });
    expect(isDamageable(p)).toBe(false);
  });

  it('casting blocks movement unless the ability allows it', () => {
    const p = player();
    p.phase = {
      kind: 'CASTING',
      slot: 0,
      abilityId: 'shuriken',
      startedAt: 0,
      activatesAt: 6,
      endsAt: 15,
      activated: false,
    };
    expect(controlsMovement(p, false)).toBe(false);
    expect(controlsMovement(p, true)).toBe(true);
  });
});
