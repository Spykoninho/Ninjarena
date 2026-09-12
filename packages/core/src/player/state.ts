import type { CharacterDefinition } from '../definitions';
import type { Vec2 } from '../math/vec2';
import type { PlayerId, TeamId, Tick } from '../simulation/ids';
import type { CombatPhaseState } from './phase';
import { normalPhase } from './phase';
import type { StatusEffect } from './status';

export interface PlayerStats {
  maxHealth: number;
  maxChakra: number;
  moveSpeed: number;
  chakraRegenPerSecond: number;
  colliderRadius: number;
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
  health: number;
  chakra: number;
  stats: PlayerStats;
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
  abilityIds?: readonly string[];
}

export function createPlayerState(params: CreatePlayerParams): PlayerState {
  const stats: PlayerStats = { ...params.character.stats };
  const abilityIds = params.abilityIds ?? params.character.abilities;
  return {
    id: params.id,
    teamId: params.teamId,
    characterId: params.character.id,
    position: { x: params.position.x, y: params.position.y },
    velocity: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
    health: stats.maxHealth,
    chakra: stats.maxChakra,
    stats,
    phase: normalPhase(),
    statuses: [],
    abilities: abilityIds.map((abilityId) => ({ abilityId, readyAt: 0 })),
    previousAbilityHeld: 0,
  };
}
