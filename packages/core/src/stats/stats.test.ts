import { describe, expect, it } from 'vitest';
import { TEST_RULES, NINJA } from '../testing/fixtures';
import { emptyBuild, validateBuild } from './build';
import { computeDamage, computeStats } from './formulas';

describe('validateBuild', () => {
  it('accepts a build within budget and ranges', () => {
    const result = validateBuild(
      { ...emptyBuild(), vitality: 3, power: 4, speed: 3 },
      TEST_RULES,
      10,
    );
    expect(result.ok).toBe(true);
  });

  it('rejects over-budget, out-of-range, non-integer and malformed builds', () => {
    expect(
      validateBuild({ ...emptyBuild(), vitality: 5, power: 5, speed: 1 }, TEST_RULES, 10).ok,
    ).toBe(false);
    expect(validateBuild({ ...emptyBuild(), strength: 6 }, TEST_RULES, 10).ok).toBe(false);
    expect(validateBuild({ ...emptyBuild(), strength: 1.5 }, TEST_RULES, 10).ok).toBe(false);
    expect(validateBuild({ vitality: 1 }, TEST_RULES, 10).ok).toBe(false);
    expect(validateBuild(null, TEST_RULES, 10).ok).toBe(false);
  });
});

describe('computeStats', () => {
  it('derives every stat from the base and the build', () => {
    const stats = computeStats(
      NINJA.baseStats,
      {
        ...emptyBuild(),
        vitality: 2,
        strength: 1,
        power: 3,
        speed: 2,
        maxChakra: 1,
        chakraRegen: 1,
        defense: 2,
      },
      TEST_RULES,
    );
    expect(stats.maxHealth).toBe(124);
    expect(stats.physicalDamageMultiplier).toBeCloseTo(1.06);
    expect(stats.techniqueDamageMultiplier).toBeCloseTo(1.18);
    expect(stats.moveSpeed).toBeCloseTo(148.4);
    expect(stats.maxChakra).toBe(110);
    expect(stats.chakraRegenPerSecond).toBe(9);
    expect(stats.defense).toBe(16);
    expect(stats.colliderRadius).toBe(5);
  });

  it('leaves cooldowns alone: speed touches only moveSpeed', () => {
    const slow = computeStats(NINJA.baseStats, emptyBuild(), TEST_RULES);
    const fast = computeStats(NINJA.baseStats, { ...emptyBuild(), speed: 5 }, TEST_RULES);
    expect(fast.moveSpeed).toBeGreaterThan(slow.moveSpeed);
    expect({ ...fast, moveSpeed: 0 }).toEqual({ ...slow, moveSpeed: 0 });
  });
});

describe('computeDamage', () => {
  const base = computeStats(NINJA.baseStats, emptyBuild(), TEST_RULES);
  it('scales physical damage with strength and technique damage with power', () => {
    const strong = computeStats(NINJA.baseStats, { ...emptyBuild(), strength: 5 }, TEST_RULES);
    expect(
      computeDamage({ base: 20, scaling: 'physical', attacker: strong, defender: base }),
    ).toBeCloseTo(26);
    expect(
      computeDamage({ base: 20, scaling: 'technique', attacker: strong, defender: base }),
    ).toBeCloseTo(20);
  });
  it('mitigates with the defender defense and ignores scaling for environment damage', () => {
    const tank = computeStats(NINJA.baseStats, { ...emptyBuild(), defense: 5 }, TEST_RULES); // defense 40
    expect(computeDamage({ base: 28, scaling: 'none', defender: tank })).toBeCloseTo(20);
    expect(computeDamage({ base: 28, scaling: 'physical', defender: tank })).toBeCloseTo(20);
  });
});
