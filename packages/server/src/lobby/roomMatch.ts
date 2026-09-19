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
import { MatchStats } from '../match/matchStats';
import type { MatchResult, MatchResultPlayer } from '../persistence/matchResultRepository';
import type { ClientSession } from '../session/clientSession';
import type { RoomPlayer } from './roomPlayer';

export interface RoomMatch {
  simulation: GameSimulation;
  host: MatchHost;
  // La liste des participants est figée au coup d'envoi: un départ ne la réécrit pas.
  participants: MatchResultPlayer[];
  stats: MatchStats;
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
  players: readonly MatchResultPlayer[];
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
  const seated: RoomPlayer[] = [];
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
    seated.push(player);
  }

  const stats = new MatchStats();
  const host = new MatchHost({
    simulation,
    sessions: options.sessions,
    snapshotEveryTicks: options.snapshotEveryTicks,
    onEvents: (events) => {
      stats.record(events);
      options.onEvents(events);
    },
  });
  simulation.startMatch();
  announce(seated, options, matchConfig);
  return { simulation, host, participants: participantsOf(settings, seated), stats };
}

export function participantsOf(
  settings: RoomSettings,
  players: readonly RoomPlayer[],
): MatchResultPlayer[] {
  return players.map((player) => {
    const account = player.session.account;
    return {
      id: player.session.id,
      name: player.session.name,
      teamId: teamIdOf(settings, player),
      account: account === null ? null : { name: account.name, rating: account.rating },
    };
  });
}

export function matchResultOf(options: MatchResultOptions): MatchResult {
  return {
    roomCode: options.roomCode,
    settings: { ...options.settings },
    players: options.players.map((player) => ({
      ...player,
      account: player.account === null ? null : { ...player.account },
    })),
    winnerTeamId: options.winnerTeamId,
    scores: { ...options.scores },
    endedAt: options.endedAt,
  };
}

export function inJoinOrder(players: readonly RoomPlayer[]): RoomPlayer[] {
  return [...players].sort((a, b) => a.joinedAt - b.joinedAt);
}

function announce(
  seated: readonly RoomPlayer[],
  options: StartMatchOptions,
  matchConfig: MatchConfig,
): void {
  for (const player of seated) {
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
