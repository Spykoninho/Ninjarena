import type { AttributeId, Build, CharacterBaseStats, StatRulesDefinition } from '@ninjarena/core';
import { ATTRIBUTE_IDS, computeStats } from '@ninjarena/core';

export interface AttributeEffect {
  hint: string;
  effect: string;
}

const PERCENT = 100;

// Ce que chaque point achète, lu dans les coefficients: la doc du build ne peut pas se périmer.
export function attributeHints(rules: StatRulesDefinition): Record<AttributeId, string> {
  const c = rules.coefficients;
  return {
    vitality: `+${trim(c.healthPerVitality)} PV par point`,
    strength: `+${percent(c.physicalDamagePerStrength)} % de dégâts des attaques de base par point`,
    power: `+${percent(c.techniqueDamagePerPower)} % de dégâts des techniques par point`,
    speed: `+${percent(c.moveSpeedPerSpeed)} % de vitesse de déplacement par point`,
    maxChakra: `+${trim(c.chakraPerPoint)} chakra max par point`,
    chakraRegen: `+${trim(c.chakraRegenPerPoint)} chakra par seconde par point`,
    defense: `+${trim(c.defensePerPoint)} de défense par point, chaque point de défense réduit les dégâts subis`,
  };
}

// Ce que la répartition courante donne, en chiffres du jeu: PV, chakra, pourcentages.
export function attributeEffects(
  build: Build,
  base: CharacterBaseStats,
  rules: StatRulesDefinition,
): Record<AttributeId, string> {
  const stats = computeStats(base, build, rules);
  const taken = 1 - PERCENT / (PERCENT + stats.defense);
  return {
    vitality: `${trim(stats.maxHealth)} PV`,
    strength: `${bonus(stats.physicalDamageMultiplier)} dégâts de base`,
    power: `${bonus(stats.techniqueDamageMultiplier)} dégâts des techniques`,
    speed: `${bonus(stats.moveSpeed / base.moveSpeed)} vitesse`,
    maxChakra: `${trim(stats.maxChakra)} chakra`,
    chakraRegen: `${trim(stats.chakraRegenPerSecond)} chakra/s`,
    defense: `−${percent(taken)} % dégâts subis`,
  };
}

export function attributeIds(): readonly AttributeId[] {
  return ATTRIBUTE_IDS;
}

function bonus(multiplier: number): string {
  return `+${percent(multiplier - 1)} %`;
}

function percent(ratio: number): string {
  return String(Math.round(ratio * PERCENT));
}

function trim(value: number): string {
  return String(Math.round(value * 10) / 10);
}
