import type { CharacterDefinition, StatRulesDefinition } from '../definitions';
import type { Vec2 } from '../math/vec2';
import type { PlayerId, TeamId, Tick } from '../simulation/ids';
import type { Build } from '../stats/build';
import { computeStats } from '../stats/formulas';
import type { CombatPhaseState } from './phase';
import { normalPhase } from './phase';
import type { StatusEffect } from './status';

export interface PlayerStats {
  maxHealth: number;
  maxChakra: number;
  chakraRegenPerSecond: number;
  moveSpeed: number;
  colliderRadius: number;
  physicalDamageMultiplier: number;
  techniqueDamageMultiplier: number;
  defense: number;
}

export interface AbilitySlot {
  abilityId: string;
  readyAt: Tick;
}

export interface PlayerState {
  id: PlayerId;
  teamId: TeamId;
  characterId: string;
  position: Vec2;
  velocity: Vec2;
  aim: Vec2;
  aimDistance: number | null;
  health: number;
  chakra: number;
  stats: PlayerStats;
  build: Build;
  phase: CombatPhaseState;
  statuses: StatusEffect[];
  abilities: AbilitySlot[];
  previousAbilityHeld: number;
}

export interface CreatePlayerParams {
  id: PlayerId;
  teamId: TeamId;
  character: CharacterDefinition;
  position: Vec2;
  build: Build;
  abilityIds: readonly string[];
  rules: StatRulesDefinition;
}

export function createPlayerState(params: CreatePlayerParams): PlayerState {
  const build: Build = { ...params.build };
  const stats = computeStats(params.character.baseStats, build, params.rules);
  return {
    id: params.id,
    teamId: params.teamId,
    characterId: params.character.id,
    position: { x: params.position.x, y: params.position.y },
    velocity: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
    aimDistance: null,
    health: stats.maxHealth,
    chakra: stats.maxChakra,
    stats,
    build,
    phase: normalPhase(),
    statuses: [],
    abilities: params.abilityIds.map((abilityId) => ({ abilityId, readyAt: 0 })),
    previousAbilityHeld: 0,
  };
}
