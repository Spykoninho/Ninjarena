import type { StatRulesDefinition } from '../definitions/statRules';
import type { PlayerStats } from '../player/state';
import type { Build } from './build';

export interface CharacterBaseStats {
  maxHealth: number;
  maxChakra: number;
  chakraRegenPerSecond: number;
  moveSpeed: number;
  colliderRadius: number;
}

export function computeStats(
  base: CharacterBaseStats,
  build: Build,
  rules: StatRulesDefinition,
): PlayerStats {
  const c = rules.coefficients;
  return {
    maxHealth: base.maxHealth + build.vitality * c.healthPerVitality,
    maxChakra: base.maxChakra + build.maxChakra * c.chakraPerPoint,
    chakraRegenPerSecond: base.chakraRegenPerSecond + build.chakraRegen * c.chakraRegenPerPoint,
    moveSpeed: base.moveSpeed * (1 + build.speed * c.moveSpeedPerSpeed),
    colliderRadius: base.colliderRadius,
    physicalDamageMultiplier: 1 + build.strength * c.physicalDamagePerStrength,
    techniqueDamageMultiplier: 1 + build.power * c.techniqueDamagePerPower,
    defense: build.defense * c.defensePerPoint,
  };
}

export type DamageScaling = 'physical' | 'technique' | 'none';

export interface DamageInput {
  base: number;
  scaling: DamageScaling;
  attacker?: PlayerStats;
  defender: PlayerStats;
}

export function computeDamage(input: DamageInput): number {
  const attacker = input.attacker;
  const raw = input.base * (attacker === undefined ? 1 : multiplierFor(attacker, input.scaling));
  const mitigated = (raw * 100) / (100 + input.defender.defense);
  // Le dégât garde un chiffre après la virgule: la simulation reste déterministe et lisible.
  return Math.round(mitigated * 10) / 10;
}

function multiplierFor(stats: PlayerStats, scaling: DamageScaling): number {
  if (scaling === 'physical') return stats.physicalDamageMultiplier;
  if (scaling === 'technique') return stats.techniqueDamageMultiplier;
  return 1;
}
