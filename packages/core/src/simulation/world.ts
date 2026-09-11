import type { MatchState } from '../match/state';
import { createMatchState } from '../match/state';
import { isAlive } from '../player/rules';
import type { PlayerState } from '../player/state';
import type { ProjectileState } from '../projectile/state';
import type { EntityId, PlayerId, Tick } from './ids';

export interface WorldState {
  tick: Tick;
  players: Record<PlayerId, PlayerState>;
  projectiles: Record<EntityId, ProjectileState>;
  nextEntityId: number;
  match: MatchState;
}

export function createWorldState(): WorldState {
  return { tick: 0, players: {}, projectiles: {}, nextEntityId: 1, match: createMatchState() };
}

export function playersOf(world: WorldState): PlayerState[] {
  return Object.values(world.players);
}

export function alivePlayers(world: WorldState): PlayerState[] {
  return playersOf(world).filter(isAlive);
}
