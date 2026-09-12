import type { AbilityUseRejection } from '../abilities/rejection';
import type { DamageScaling, StatusEffectType, Visual } from '../definitions';
import type { Vec2 } from '../math/vec2';
import type { CombatPhaseKind } from '../player/phase';
import type { EntityId, PlayerId, TeamId, Tick } from './ids';

export type WorldEvent =
  | { type: 'abilityCast'; tick: Tick; playerId: PlayerId; abilityId: string; slot: number }
  | { type: 'abilityActivated'; tick: Tick; playerId: PlayerId; abilityId: string }
  | {
      type: 'abilityRejected';
      tick: Tick;
      playerId: PlayerId;
      slot: number;
      reason: AbilityUseRejection;
    }
  | {
      type: 'projectileSpawned';
      tick: Tick;
      projectileId: EntityId;
      ownerId: PlayerId;
      abilityId: string;
    }
  | {
      type: 'projectileDestroyed';
      tick: Tick;
      projectileId: EntityId;
      reason: 'hit' | 'wall' | 'expired';
      position: Vec2;
    }
  | {
      type: 'damageDealt';
      tick: Tick;
      targetId: PlayerId;
      sourceId: PlayerId | null;
      amount: number;
      remainingHealth: number;
      scaling: DamageScaling;
      position: Vec2;
    }
  | { type: 'shieldAbsorbed'; tick: Tick; playerId: PlayerId; amount: number; remaining: number }
  | { type: 'shieldBroken'; tick: Tick; playerId: PlayerId }
  | { type: 'teleported'; tick: Tick; playerId: PlayerId; from: Vec2; to: Vec2 }
  | {
      type: 'zoneCreated';
      tick: Tick;
      id: EntityId;
      ownerId: PlayerId;
      position: Vec2;
      radius: number;
      fireAt: Tick;
    }
  | { type: 'zoneTriggered'; tick: Tick; id: EntityId; position: Vec2 }
  | {
      type: 'areaResolved';
      tick: Tick;
      ownerId: PlayerId;
      position: Vec2;
      radius: number;
      visual: Visual | null;
    }
  | { type: 'obstacleSpawned'; tick: Tick; id: EntityId; ownerId: PlayerId }
  | { type: 'obstacleRemoved'; tick: Tick; id: EntityId }
  | { type: 'dashContact'; tick: Tick; playerId: PlayerId; targetId: PlayerId }
  | { type: 'playerDied'; tick: Tick; playerId: PlayerId; killerId: PlayerId | null }
  | {
      type: 'statusApplied';
      tick: Tick;
      playerId: PlayerId;
      status: StatusEffectType;
      expiresAt: Tick;
    }
  | { type: 'phaseChanged'; tick: Tick; playerId: PlayerId; phase: CombatPhaseKind }
  | { type: 'roundStarted'; tick: Tick; round: number }
  | { type: 'roundEnded'; tick: Tick; round: number; winnerTeamId: TeamId | null }
  | { type: 'matchEnded'; tick: Tick; winnerTeamId: TeamId | null };
