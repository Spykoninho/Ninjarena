import type { AbilityDefinition, StatRulesDefinition } from '@ninjarena/core';
import { DefinitionCatalog } from '@ninjarena/core';
import { describe, expect, it } from 'vitest';
import { loadClientConfig } from '../config/clientConfig';
import { DEFAULT_BINDINGS } from '../input/bindings';
import {
  basicOptions,
  createLoadoutState,
  loadoutErrors,
  pointsLeft,
  setAttribute,
  setTechnique,
  slotBindings,
  techniqueOptions,
  toLoadout,
} from './loadoutModel';
import type { AbilityOption, BasicOption, TechniqueOption } from './loadoutModel';

const rules: StatRulesDefinition = {
  defaultPointBudget: 10,
  attributes: {
    vitality: { min: 0, max: 5 },
    strength: { min: 0, max: 5 },
    power: { min: 0, max: 5 },
    speed: { min: 0, max: 5 },
    maxChakra: { min: 0, max: 5 },
    chakraRegen: { min: 0, max: 5 },
    defense: { min: 0, max: 5 },
  },
  coefficients: {
    healthPerVitality: 1,
    physicalDamagePerStrength: 1,
    techniqueDamagePerPower: 1,
    moveSpeedPerSpeed: 1,
    chakraPerPoint: 1,
    chakraRegenPerPoint: 1,
    defensePerPoint: 1,
  },
  techniqueSlots: 3,
};

function option(id: string, name: string, chakraCost: number, cooldownMs: number): AbilityOption {
  return { id, name, family: 'projectile', chakraCost, cooldownMs, description: '', facts: '' };
}

const options: TechniqueOption[] = [
  option('blink', 'Blink', 20, 5000),
  option('chakra-shield', 'Chakra Shield', 30, 9000),
  option('lightning-dash', 'Lightning Dash', 30, 5000),
  option('fireball', 'Fireball', 25, 4000),
];

const basics: BasicOption[] = [
  option('kunai-strike', 'Kunai Strike', 0, 350),
  option('shuriken-throw', 'Shuriken Throw', 0, 500),
];

const budget = rules.defaultPointBudget;

function state(search: string) {
  return createLoadoutState(loadClientConfig(search), rules, options, basics, budget);
}

describe('createLoadoutState', () => {
  it('clamps an over-range attribute to its max and the total to the budget', () => {
    const built = state('?build=9,0,0,0,0,0,0');
    expect(built.build.vitality).toBe(5);
    expect(built.build.vitality + built.build.strength).toBeLessThanOrEqual(budget);
  });

  it('reduces an over-budget build down to the budget, trimming from the last attribute back', () => {
    expect(state('?build=5,5,5,0,0,0,0').build).toEqual({
      vitality: 5,
      strength: 5,
      power: 0,
      speed: 0,
      maxChakra: 0,
      chakraRegen: 0,
      defense: 0,
    });
  });

  it('fills missing technique slots with the first unused options', () => {
    const built = state('?techniques=fireball');
    expect(built.techniqueIds).toEqual(['fireball', 'blink', 'chakra-shield']);
  });

  it('keeps the configured basic attack when the catalog offers it', () => {
    expect(state('?basic=shuriken-throw').basicAttackId).toBe('shuriken-throw');
  });

  it('falls back to the first basic attack when the configured one is unknown', () => {
    expect(state('?basic=nope').basicAttackId).toBe('kunai-strike');
    expect(state('').basicAttackId).toBe('kunai-strike');
  });

  it('leaves the basic attack empty when the catalog has none', () => {
    const built = createLoadoutState(loadClientConfig(''), rules, options, [], budget);
    expect(built.basicAttackId).toBeNull();
  });
});

describe('toLoadout', () => {
  it('returns null while a technique slot is empty', () => {
    const built = state('');
    expect(toLoadout({ ...built, techniqueIds: ['blink', null, 'fireball'] })).toBeNull();
  });

  it('returns null while no basic attack is picked', () => {
    expect(toLoadout({ ...state(''), basicAttackId: null })).toBeNull();
  });

  it('returns the loadout once every slot is filled', () => {
    const built = state('?build=1,1,1,1,1,1,1&basic=shuriken-throw&techniques=blink,fireball');
    expect(toLoadout(built)).toEqual({
      build: built.build,
      basicAttackId: 'shuriken-throw',
      techniqueIds: ['blink', 'fireball', 'chakra-shield'],
    });
  });
});

describe('pointsLeft', () => {
  it('subtracts the points already spent from the budget', () => {
    expect(pointsLeft(state('?build=2,3,0,0,0,0,0'), budget)).toBe(5);
  });
});

describe('setAttribute', () => {
  it('never exceeds the budget even when the range would allow it', () => {
    let built = state('?build=0,0,0,0,0,0,0');
    built = setAttribute(built, 'vitality', 5, rules, budget);
    built = setAttribute(built, 'strength', 5, rules, budget);
    built = setAttribute(built, 'power', 5, rules, budget);
    const spent = built.build.vitality + built.build.strength + built.build.power;
    expect(spent).toBeLessThanOrEqual(budget);
    expect(built.build.power).toBe(0);
  });
});

describe('setTechnique', () => {
  it('swaps the two slots when the chosen id is already picked elsewhere', () => {
    const built = state('?techniques=blink,fireball,chakra-shield');
    const next = setTechnique(built, 0, 'fireball', options);
    expect(next.techniqueIds).toEqual(['fireball', 'blink', 'chakra-shield']);
  });
});

describe('loadoutErrors', () => {
  it('lists a duplicate technique and an over-budget build', () => {
    let built = state('?build=5,5,5,5,5,5,5');
    built = { ...built, build: { ...built.build, vitality: 5, strength: 5, power: 5 } };
    built = { ...built, techniqueIds: ['blink', 'blink', built.techniqueIds[2] ?? null] };
    const errors = loadoutErrors(built, rules, budget, options);
    expect(errors).toContain('chaque technique ne peut être choisie qu’une fois');
    expect(errors).toContain('la répartition dépense 15 points pour un budget de 10');
  });

  it('reports a missing basic attack', () => {
    const errors = loadoutErrors({ ...state(''), basicAttackId: null }, rules, budget, options);
    expect(errors).toContain('une attaque de base doit être choisie');
  });

  it('is empty for a build and a set of techniques that fit', () => {
    expect(loadoutErrors(state('?build=1,1,1,1,1,1,1'), rules, budget, options)).toEqual([]);
  });
});

function ability(id: string, name: string, kind: AbilityDefinition['kind']): AbilityDefinition {
  return {
    id,
    name,
    kind,
    cooldownMs: 1000,
    chakraCost: 10,
    startupMs: 0,
    activeMs: 0,
    recoveryMs: 0,
    canMoveWhileCasting: false,
    telegraph: null,
    tags: [],
    effects: [{ type: 'stun', durationMs: 100 }],
  };
}

describe('techniqueOptions', () => {
  it('keeps only the technique abilities, sorted by name', () => {
    const abilities = new DefinitionCatalog<AbilityDefinition>([
      ability('kunai-strike', 'Kunai Strike', 'basic'),
      ability('fireball', 'Fireball', 'technique'),
      ability('blink', 'Blink', 'technique'),
      ability('shadow-step', 'Shadow Step', 'dash'),
    ]);
    expect(techniqueOptions(abilities).map((option) => option.id)).toEqual(['blink', 'fireball']);
  });

  it('carries the icon family, the description and the facts of each technique', () => {
    const abilities = new DefinitionCatalog<AbilityDefinition>([
      { ...ability('blink', 'Blink', 'technique'), description: 'Hop.' },
    ]);
    expect(techniqueOptions(abilities)).toEqual([
      {
        id: 'blink',
        name: 'Blink',
        family: 'stun',
        chakraCost: 10,
        cooldownMs: 1000,
        description: 'Hop.',
        facts: '10 chakra · 1 s de recharge',
      },
    ]);
  });
});

describe('basicOptions', () => {
  it('keeps only the basic attacks, sorted by name', () => {
    const abilities = new DefinitionCatalog<AbilityDefinition>([
      ability('shuriken-throw', 'Shuriken Throw', 'basic'),
      ability('fireball', 'Fireball', 'technique'),
      ability('kunai-strike', 'Kunai Strike', 'basic'),
      ability('shadow-step', 'Shadow Step', 'dash'),
    ]);
    expect(basicOptions(abilities).map((option) => option.id)).toEqual([
      'kunai-strike',
      'shuriken-throw',
    ]);
  });
});

describe('slotBindings', () => {
  it('labels the basic attack, the dash and one key per technique slot', () => {
    expect(slotBindings(DEFAULT_BINDINGS, 3)).toEqual({
      basic: 'Clic gauche',
      dash: 'Espace',
      techniques: ['Clic droit', 'E', 'R'],
    });
  });

  it('numbers a technique slot that has no key bound', () => {
    expect(slotBindings(DEFAULT_BINDINGS, 4).techniques).toEqual(['Clic droit', 'E', 'R', '6']);
  });
});
