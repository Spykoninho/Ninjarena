import type { AbilityDefinition, StatRulesDefinition } from '@ninjarena/core';
import { DefinitionCatalog } from '@ninjarena/core';
import { describe, expect, it } from 'vitest';
import { loadClientConfig } from '../config/clientConfig';
import {
  basicOptions,
  createLoadoutState,
  loadoutErrors,
  pointsLeft,
  setAttribute,
  setTechnique,
  techniqueOptions,
  toLoadout,
} from './loadoutModel';
import type { BasicOption, TechniqueOption } from './loadoutModel';

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

const options: TechniqueOption[] = [
  { id: 'blink', name: 'Blink', chakraCost: 20, cooldownMs: 5000 },
  { id: 'chakra-shield', name: 'Chakra Shield', chakraCost: 30, cooldownMs: 9000 },
  { id: 'lightning-dash', name: 'Lightning Dash', chakraCost: 30, cooldownMs: 5000 },
  { id: 'fireball', name: 'Fireball', chakraCost: 25, cooldownMs: 4000 },
];

const basics: BasicOption[] = [
  { id: 'kunai-strike', name: 'Kunai Strike' },
  { id: 'shuriken-throw', name: 'Shuriken Throw' },
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
    expect(errors).toContain('techniques must be distinct');
    expect(errors).toContain('build spends 15 points, budget is 10');
  });

  it('reports a missing basic attack', () => {
    const errors = loadoutErrors({ ...state(''), basicAttackId: null }, rules, budget, options);
    expect(errors).toContain('a basic attack must be selected');
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
    expect(techniqueOptions(abilities)).toEqual([
      { id: 'blink', name: 'Blink', chakraCost: 10, cooldownMs: 1000 },
      { id: 'fireball', name: 'Fireball', chakraCost: 10, cooldownMs: 1000 },
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
    expect(basicOptions(abilities)).toEqual([
      { id: 'kunai-strike', name: 'Kunai Strike' },
      { id: 'shuriken-throw', name: 'Shuriken Throw' },
    ]);
  });
});
