import { describe, expect, it } from 'vitest';
import { emptyBuild } from '../stats';
import { DefinitionCatalog } from '../simulation/catalog';
import { NINJA, TEST_ABILITIES, TEST_RULES } from '../testing/fixtures';
import { loadoutAbilityIds, validateLoadout } from './loadout';

const ABILITIES = new DefinitionCatalog(TEST_ABILITIES);
const BUDGET = TEST_RULES.defaultPointBudget;
const validate = (raw: unknown) => validateLoadout(raw, ABILITIES, TEST_RULES, BUDGET);

describe('validateLoadout', () => {
  it('accepts a basic attack, a build and exactly three distinct techniques', () => {
    expect(
      validate({
        build: emptyBuild(),
        basicAttackId: 'slash',
        techniqueIds: ['shuriken', 'seal', 'blink'],
      }),
    ).toEqual({
      ok: true,
      loadout: {
        build: emptyBuild(),
        basicAttackId: 'slash',
        techniqueIds: ['shuriken', 'seal', 'blink'],
      },
    });
  });

  it('accepts a basic attack of kind basic and rejects a technique in that slot', () => {
    expect(
      validate({
        build: emptyBuild(),
        basicAttackId: 'shuriken',
        techniqueIds: ['seal', 'blink', 'spark-dash'],
      }),
    ).toEqual({ ok: false, reason: '"shuriken" is not a basic attack' });
  });

  it('rejects an unknown basic attack', () => {
    expect(
      validate({
        build: emptyBuild(),
        basicAttackId: 'nope',
        techniqueIds: ['seal', 'blink', 'spark-dash'],
      }).ok,
    ).toBe(false);
  });

  it('rejects a loadout whose build exceeds the budget', () => {
    const build = { ...emptyBuild(), vitality: 5, strength: 5, power: 1 };
    expect(
      validate({ build, basicAttackId: 'slash', techniqueIds: ['shuriken', 'seal', 'blink'] }),
    ).toEqual({ ok: false, reason: 'build spends 11 points, budget is 10' });
  });

  it('rejects a loadout that does not fill every technique slot', () => {
    expect(
      validate({ build: emptyBuild(), basicAttackId: 'slash', techniqueIds: ['shuriken', 'seal'] })
        .ok,
    ).toBe(false);
    expect(
      validate({
        build: emptyBuild(),
        basicAttackId: 'slash',
        techniqueIds: ['shuriken', 'seal', 'blink', 'spark-dash'],
      }).ok,
    ).toBe(false);
  });

  it('rejects a basic attack or a dash in a technique slot', () => {
    expect(
      validate({
        build: emptyBuild(),
        basicAttackId: 'slash',
        techniqueIds: ['slash', 'seal', 'blink'],
      }).ok,
    ).toBe(false);
    expect(
      validate({
        build: emptyBuild(),
        basicAttackId: 'slash',
        techniqueIds: ['dash', 'seal', 'blink'],
      }).ok,
    ).toBe(false);
  });

  it('rejects an unknown technique', () => {
    expect(
      validate({
        build: emptyBuild(),
        basicAttackId: 'slash',
        techniqueIds: ['nope', 'seal', 'blink'],
      }).ok,
    ).toBe(false);
  });

  it('rejects a duplicated technique', () => {
    expect(
      validate({
        build: emptyBuild(),
        basicAttackId: 'slash',
        techniqueIds: ['seal', 'seal', 'blink'],
      }).ok,
    ).toBe(false);
  });

  it('rejects anything that is not an object with build, basicAttackId and techniqueIds', () => {
    expect(validate('shuriken').ok).toBe(false);
    expect(validate([1, 2, 3]).ok).toBe(false);
    expect(validate(null).ok).toBe(false);
    expect(
      validate({ basicAttackId: 'slash', techniqueIds: ['shuriken', 'seal', 'blink'] }).ok,
    ).toBe(false);
    expect(
      validate({
        build: emptyBuild(),
        basicAttackId: 'slash',
        techniqueIds: ['shuriken', 'seal', 'blink'],
        extra: 1,
      }).ok,
    ).toBe(false);
  });
});

describe('loadoutAbilityIds', () => {
  it('orders ability ids basic, dash, techniques', () => {
    expect(
      loadoutAbilityIds(NINJA, {
        basicAttackId: 'slash',
        techniqueIds: ['shuriken', 'seal', 'blink'],
      }),
    ).toEqual(['slash', 'dash', 'shuriken', 'seal', 'blink']);
  });
});
