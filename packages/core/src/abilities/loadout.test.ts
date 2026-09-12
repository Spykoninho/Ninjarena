import { describe, expect, it } from 'vitest';
import { DefinitionCatalog } from '../simulation/catalog';
import { NINJA, TEST_ABILITIES, TEST_RULES } from '../testing/fixtures';
import { loadoutAbilityIds, validateLoadout } from './loadout';

const ABILITIES = new DefinitionCatalog(TEST_ABILITIES);
const validate = (raw: unknown) => validateLoadout(raw, ABILITIES, TEST_RULES);

describe('validateLoadout', () => {
  it('accepts exactly three distinct techniques', () => {
    expect(validate(['shuriken', 'seal', 'blink'])).toEqual({
      ok: true,
      techniqueIds: ['shuriken', 'seal', 'blink'],
    });
  });

  it('rejects a loadout that does not fill every technique slot', () => {
    expect(validate(['shuriken', 'seal']).ok).toBe(false);
    expect(validate(['shuriken', 'seal', 'blink', 'spark-dash']).ok).toBe(false);
  });

  it('rejects a basic attack or a dash in a technique slot', () => {
    expect(validate(['slash', 'seal', 'blink']).ok).toBe(false);
    expect(validate(['dash', 'seal', 'blink']).ok).toBe(false);
  });

  it('rejects an unknown ability', () => {
    expect(validate(['nope', 'seal', 'blink']).ok).toBe(false);
  });

  it('rejects a duplicated technique', () => {
    expect(validate(['seal', 'seal', 'blink']).ok).toBe(false);
  });

  it('rejects anything that is not a list of strings', () => {
    expect(validate('shuriken').ok).toBe(false);
    expect(validate([1, 2, 3]).ok).toBe(false);
  });
});

describe('loadoutAbilityIds', () => {
  it('puts the basic attack then the dash before the chosen techniques', () => {
    expect(loadoutAbilityIds(NINJA, ['shuriken', 'seal', 'blink'])).toEqual([
      'slash',
      'dash',
      'shuriken',
      'seal',
      'blink',
    ]);
  });
});
