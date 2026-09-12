import type { GameContent } from '@ninjarena/content';
import type { MapDocument, MatchConfig, RoomSettings, TeamId, WorldEvent } from '@ninjarena/core';
import {
  DEFAULT_MATCH_TIMING,
  GameSimulation,
  LoadedMap,
  teamIdForIndex,
  toMatchConfig,
} from '@ninjarena/core';
import { MatchHost } from '../match/matchHost';
import type { MatchResult } from '../persistence/matchResultRepository';
import type { ClientSession } from '../session/clientSession';
import type { RoomPlayer } from './roomPlayer';

export interface RoomMatch {
  simulation: GameSimulation;
  host: MatchHost;
}

export interface StartMatchOptions {
  content: GameContent;
  map: MapDocument;
  settings: RoomSettings;
  players: readonly RoomPlayer[];
  characterId: string;
  tickRate: number;
  snapshotEveryTicks: number;
  sessions: () => readonly ClientSession[];
  onEvents: (events: readonly WorldEvent[]) => void;
}

export interface MatchResultOptions {
  roomCode: string;
  settings: RoomSettings;
  players: readonly RoomPlayer[];
  winnerTeamId: TeamId | null;
  scores: Record<TeamId, number>;
  endedAt: number;
}

// En free-for-all chaque joueur est sa propre équipe.
export function teamIdOf(settings: RoomSettings, player: RoomPlayer): TeamId {
  if (settings.mode !== 'team' || player.team === null) return player.session.id;
  return teamIdForIndex(player.team);
}

export function startRoomMatch(options: StartMatchOptions): RoomMatch {
  const { content, map, settings } = options;
  const matchConfig = toMatchConfig(settings, DEFAULT_MATCH_TIMING);
  const simulation = new GameSimulation({
    map: LoadedMap.fromDocument(map, content.tilesets.get(map.tileset)),
    abilities: content.abilities,
    characters: content.characters,
    matchConfig,
    rules: content.statRules,
    config: { tickRate: options.tickRate },
  });

  // L'ordre d'arrivée fixe l'ordre des spawns: la salle et la simulation restent alignées.
  for (const player of inJoinOrder(options.players)) {
    const loadout = player.loadout;
    if (loadout === null) continue;
    simulation.addPlayer({
      id: player.session.id,
      teamId: teamIdOf(settings, player),
      characterId: options.characterId,
      build: loadout.build,
      basicAttackId: loadout.basicAttackId,
      techniqueIds: loadout.techniqueIds,
    });
    player.session.playerId = player.session.id;
  }

  const host = new MatchHost({
    simulation,
    sessions: options.sessions,
    snapshotEveryTicks: options.snapshotEveryTicks,
    onEvents: options.onEvents,
  });
  simulation.startMatch();
  announce(options, matchConfig);
  return { simulation, host };
}

export function matchResultOf(options: MatchResultOptions): MatchResult {
  return {
    roomCode: options.roomCode,
    settings: { ...options.settings },
    players: options.players.map((player) => ({
      id: player.session.id,
      name: player.session.name,
      teamId: teamIdOf(options.settings, player),
    })),
    winnerTeamId: options.winnerTeamId,
    scores: { ...options.scores },
    endedAt: options.endedAt,
  };
}

export function inJoinOrder(players: readonly RoomPlayer[]): RoomPlayer[] {
  return [...players].sort((a, b) => a.joinedAt - b.joinedAt);
}

function announce(options: StartMatchOptions, matchConfig: MatchConfig): void {
  for (const player of options.players) {
    player.session.send({
      type: 'matchStarted',
      playerId: player.session.id,
      tickRate: options.tickRate,
      snapshotRate: options.tickRate / options.snapshotEveryTicks,
      matchConfig,
      map: options.map,
    });
  }
}
