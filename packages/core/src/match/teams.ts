import type { MatchConfig } from '../definitions';
import type { PlayerState } from '../player/state';
import type { PlayerId, TeamId } from '../simulation/ids';
import type { WorldState } from '../simulation/world';
import { alivePlayers, playersOf } from '../simulation/world';

const TEAM_PREFIX = 'team-';

export function teamIdForIndex(index: number): TeamId {
  return `${TEAM_PREFIX}${index}`;
}

export function teamIndexOf(teamId: TeamId): number | null {
  if (!teamId.startsWith(TEAM_PREFIX)) return null;
  const index = Number(teamId.slice(TEAM_PREFIX.length));
  // L'aller-retour rejette les formes non canoniques comme `team-01` ou `team-x`.
  return Number.isInteger(index) && teamIdForIndex(index) === teamId ? index : null;
}

export function pickTeamForNewPlayer(
  config: MatchConfig,
  world: WorldState,
  playerId: PlayerId,
): TeamId {
  // En free-for-all chaque joueur est sa propre équipe.
  if (config.mode === 'ffa') return playerId;
  const counts = new Array<number>(config.teamCount).fill(0);
  for (const player of playersOf(world)) {
    const index = teamIndexOf(player.teamId);
    if (index === null || index < 0 || index >= counts.length) continue;
    counts[index] = (counts[index] ?? 0) + 1;
  }
  let best = 0;
  for (let i = 1; i < counts.length; i++) {
    if ((counts[i] ?? 0) < (counts[best] ?? 0)) best = i;
  }
  return teamIdForIndex(best);
}

export function teamsPresent(world: WorldState): TeamId[] {
  return distinctTeams(playersOf(world));
}

export function aliveTeams(world: WorldState): TeamId[] {
  return distinctTeams(alivePlayers(world));
}

function distinctTeams(players: readonly PlayerState[]): TeamId[] {
  const seen = new Set<TeamId>();
  const teams: TeamId[] = [];
  for (const player of players) {
    if (seen.has(player.teamId)) continue;
    seen.add(player.teamId);
    teams.push(player.teamId);
  }
  return teams;
}
