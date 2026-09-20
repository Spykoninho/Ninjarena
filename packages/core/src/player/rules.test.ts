import { describe, expect, it } from 'vitest';
import { emptyBuild } from '../stats/build';
import { NINJA, TEST_RULES } from '../testing/fixtures';
import { controlsMovement, isDamageable, statusSpeedMultiplier } from './rules';
import { createPlayerState } from './state';
import { upsertStatus } from './status';

const player = () =>
  createPlayerState({
    id: 'p1',
    teamId: 't1',
    character: NINJA,
    position: { x: 0, y: 0 },
    build: emptyBuild(),
    abilityIds: ['shuriken'],
    rules: TEST_RULES,
  });

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

  it('HASTED multiplies speed and stacks with a slow', () => {
    const p = player();
    upsertStatus(p, { type: 'HASTED', expiresAt: 100, magnitude: 1.5 });
    expect(statusSpeedMultiplier(p)).toBe(1.5);
    upsertStatus(p, { type: 'SLOWED', expiresAt: 100, magnitude: 0.5 });
    expect(statusSpeedMultiplier(p)).toBe(0.75);
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
      activeUntil: 6,
      endsAt: 15,
      activated: false,
    };
    expect(controlsMovement(p, false)).toBe(false);
    expect(controlsMovement(p, true)).toBe(true);
  });
});
