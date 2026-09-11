import type { MatchConfig } from '../definitions';
import type { LoadedMap, SpawnPoint } from '../map/loadedMap';
import type { Vec2 } from '../math/vec2';
import type { PlayerState } from '../player/state';
import type { WorldState } from '../simulation/world';
import { playersOf } from '../simulation/world';
import { teamIndexOf } from './teams';

export function spawnPositionFor(
  map: LoadedMap,
  config: MatchConfig,
  player: PlayerState,
  world: WorldState,
): Vec2 {
  const players = playersOf(world);
  // Repli sur tous les spawns: une carte sans point dédié au format reste jouable.
  const spawn =
    formatSpawn(map, config, player, players) ?? cycle(map.spawns, indexOf(players, player));
  if (spawn === undefined) throw new Error(`map "${map.id}" has no spawn point`);
  return { x: spawn.x, y: spawn.y };
}

function formatSpawn(
  map: LoadedMap,
  config: MatchConfig,
  player: PlayerState,
  players: readonly PlayerState[],
): SpawnPoint | undefined {
  if (config.mode === 'ffa') {
    const shared = map.spawns.filter((spawn) => spawn.team === undefined);
    return cycle(shared, indexOf(players, player));
  }
  const teamIndex = teamIndexOf(player.teamId);
  const owned = map.spawns.filter((spawn) => spawn.team === teamIndex);
  const teammates = players.filter((other) => other.teamId === player.teamId);
  return cycle(owned, indexOf(teammates, player));
}

function indexOf(players: readonly PlayerState[], player: PlayerState): number {
  const index = players.findIndex((other) => other.id === player.id);
  // Un joueur pas encore inséré prend le rang suivant.
  return index === -1 ? players.length : index;
}

function cycle(spawns: readonly SpawnPoint[], index: number): SpawnPoint | undefined {
  if (spawns.length === 0) return undefined;
  return spawns[index % spawns.length];
}
