import type { CharacterBaseStats, StatRulesDefinition } from '@ninjarena/core';
import { emptyBuild } from '@ninjarena/core';
import { describe, expect, it } from 'vitest';
import { attributeEffects, attributeHints } from './buildText';

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
    healthPerVitality: 12,
    physicalDamagePerStrength: 0.06,
    techniqueDamagePerPower: 0.06,
    moveSpeedPerSpeed: 0.03,
    chakraPerPoint: 10,
    chakraRegenPerPoint: 1,
    defensePerPoint: 8,
  },
  techniqueSlots: 3,
};

const base: CharacterBaseStats = {
  maxHealth: 100,
  maxChakra: 100,
  chakraRegenPerSecond: 8,
  moveSpeed: 140,
  colliderRadius: 5,
};

describe('attributeHints', () => {
  it('reads what a point buys from the coefficients', () => {
    const hints = attributeHints(rules);
    expect(hints.vitality).toBe('+12 PV par point');
    expect(hints.strength).toBe('+6 % de dégâts des attaques de base par point');
    expect(hints.speed).toBe('+3 % de vitesse de déplacement par point');
    expect(hints.chakraRegen).toBe('+1 chakra par seconde par point');
  });
});

describe('attributeEffects', () => {
  it('shows the base numbers for an empty build', () => {
    const effects = attributeEffects(emptyBuild(), base, rules);
    expect(effects.vitality).toBe('100 PV');
    expect(effects.strength).toBe('+0 % dégâts de base');
    expect(effects.defense).toBe('−0 % dégâts subis');
  });

  it('turns the points into health, multipliers and the damage reduction of the defense', () => {
    const effects = attributeEffects(
      {
        ...emptyBuild(),
        vitality: 2,
        strength: 3,
        power: 1,
        speed: 3,
        maxChakra: 1,
        chakraRegen: 2,
        defense: 5,
      },
      base,
      rules,
    );
    expect(effects.vitality).toBe('124 PV');
    expect(effects.strength).toBe('+18 % dégâts de base');
    expect(effects.power).toBe('+6 % dégâts des techniques');
    expect(effects.speed).toBe('+9 % vitesse');
    expect(effects.maxChakra).toBe('110 chakra');
    expect(effects.chakraRegen).toBe('10 chakra/s');
    expect(effects.defense).toBe('−29 % dégâts subis');
  });
});
