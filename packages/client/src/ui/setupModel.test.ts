import type { AbilityDefinition, StatRulesDefinition } from '@ninjarena/core';
import { DefinitionCatalog } from '@ninjarena/core';
import { describe, expect, it } from 'vitest';
import { loadClientConfig } from '../config/clientConfig';
import {
  createSetupState,
  playAvailability,
  pointsLeft,
  setAttribute,
  setTechnique,
  setupErrors,
  techniqueOptions,
} from './setupModel';
import type { TechniqueOption } from './setupModel';

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

describe('createSetupState', () => {
  it('clamps an over-range attribute to its max and the total to the budget', () => {
    const config = loadClientConfig('?name=kage&build=9,0,0,0,0,0,0');
    const state = createSetupState(config, rules, options);
    expect(state.build.vitality).toBe(5);
    expect(state.build.vitality + state.build.strength).toBeLessThanOrEqual(
      rules.defaultPointBudget,
    );
  });

  it('reduces an over-budget build down to the budget, trimming from the last attribute back', () => {
    const config = loadClientConfig('?name=kage&build=5,5,5,0,0,0,0');
    const state = createSetupState(config, rules, options);
    expect(state.build).toEqual({
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
    const config = loadClientConfig('?name=kage&techniques=fireball');
    const state = createSetupState(config, rules, options);
    expect(state.techniqueIds[0]).toBe('fireball');
    expect(state.techniqueIds[1]).toBe('blink');
    expect(state.techniqueIds[2]).toBe('chakra-shield');
  });
});

describe('pointsLeft', () => {
  it('subtracts the points already spent from the budget', () => {
    const config = loadClientConfig('?name=kage&build=2,3,0,0,0,0,0');
    const state = createSetupState(config, rules, options);
    expect(pointsLeft(state, rules, rules.defaultPointBudget)).toBe(5);
  });
});

describe('setAttribute', () => {
  it('never exceeds the budget even when the range would allow it', () => {
    const config = loadClientConfig('?name=kage&build=0,0,0,0,0,0,0');
    let state = createSetupState(config, rules, options);
    state = setAttribute(state, 'vitality', 5, rules, rules.defaultPointBudget);
    state = setAttribute(state, 'strength', 5, rules, rules.defaultPointBudget);
    state = setAttribute(state, 'power', 5, rules, rules.defaultPointBudget);
    const spent = state.build.vitality + state.build.strength + state.build.power;
    expect(spent).toBeLessThanOrEqual(rules.defaultPointBudget);
    expect(state.build.power).toBe(0);
  });
});

describe('setTechnique', () => {
  it('swaps the two slots when the chosen id is already picked elsewhere', () => {
    const config = loadClientConfig('?name=kage&techniques=blink,fireball,chakra-shield');
    const state = createSetupState(config, rules, options);
    const next = setTechnique(state, 0, 'fireball', options);
    expect(next.techniqueIds[0]).toBe('fireball');
    expect(next.techniqueIds[1]).toBe('blink');
    expect(next.techniqueIds[2]).toBe('chakra-shield');
  });
});

describe('setupErrors', () => {
  it('lists a duplicate technique and an over-budget build', () => {
    const config = loadClientConfig('?name=kage&build=5,5,5,5,5,5,5');
    let state = createSetupState(config, rules, options);
    state = { ...state, build: { ...state.build, vitality: 5, strength: 5, power: 5 } };
    state = setTechnique(state, 1, 'blink', options);
    state = { ...state, techniqueIds: ['blink', 'blink', state.techniqueIds[2] ?? null] };
    const errors = setupErrors(state, rules, rules.defaultPointBudget, options);
    expect(errors).toContain('techniques must be distinct');
    expect(errors.some((error) => error.includes('budget'))).toBe(true);
  });

  it('is empty for a valid name, build and loadout', () => {
    const config = loadClientConfig('?name=kage&build=1,1,1,1,1,1,1');
    const state = createSetupState(config, rules, options);
    expect(setupErrors(state, rules, rules.defaultPointBudget, options)).toEqual([]);
  });
});

describe('playAvailability', () => {
  const validState = () =>
    createSetupState(loadClientConfig('?name=kage&build=1,1,1,1,1,1,1'), rules, options);

  it('allows a valid setup to play while no connection is in flight', () => {
    const availability = playAvailability(
      validState(),
      rules,
      rules.defaultPointBudget,
      options,
      false,
    );
    expect(availability).toEqual({ errors: [], disabled: false });
  });

  it('blocks a second play while the connection is in flight', () => {
    const availability = playAvailability(
      validState(),
      rules,
      rules.defaultPointBudget,
      options,
      true,
    );
    expect(availability.errors).toEqual([]);
    expect(availability.disabled).toBe(true);
  });

  it('blocks an invalid setup and reports why', () => {
    const state = { ...validState(), name: '   ' };
    const availability = playAvailability(state, rules, rules.defaultPointBudget, options, false);
    expect(availability.disabled).toBe(true);
    expect(availability.errors).toEqual(
      setupErrors(state, rules, rules.defaultPointBudget, options),
    );
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
