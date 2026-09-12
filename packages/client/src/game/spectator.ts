import type { PlayerId, WorldState } from '@ninjarena/core';
import { alivePlayers } from '@ninjarena/core';

export function spectatorCandidates(
  world: WorldState,
  localPlayerId: PlayerId,
  isFfa: boolean,
): PlayerId[] {
  const local = world.players[localPlayerId];
  return alivePlayers(world)
    .filter((player) => player.id !== localPlayerId)
    .filter((player) => isFfa || (local !== undefined && player.teamId === local.teamId))
    .map((player) => player.id);
}

export function nextSpectateTarget(
  candidates: PlayerId[],
  current: PlayerId | null,
  cycle: boolean,
): PlayerId | null {
  if (candidates.length === 0) return null;
  const index = current === null ? -1 : candidates.indexOf(current);
  // Une cible absente (morte ou partie) est remplacée par le premier candidat.
  if (index === -1) return candidates[0] ?? null;
  if (!cycle) return current;
  return candidates[(index + 1) % candidates.length] ?? null;
}
