import type {
  Loadout,
  MapDocument,
  MapSummary,
  MatchConfig,
  PlayerId,
  PlayerInput,
  RoomSettings,
  TeamId,
  Tick,
  WorldEvent,
  WorldState,
} from '@ninjarena/core';

export type RoomStatus = 'WAITING' | 'STARTING' | 'IN_GAME' | 'FINISHED';

export const START_BLOCKERS = [
  'NOT_ENOUGH_PLAYERS',
  'PLAYER_NOT_READY',
  'INVALID_LOADOUT',
  'EMPTY_TEAM',
  'MAP_MISSING',
  'MAP_INVALID',
  'RANKED_NEEDS_ACCOUNT',
  'TOURNAMENT_NOT_FULL',
] as const;

export type StartBlocker = (typeof START_BLOCKERS)[number];

// Le score d'un joueur connecté à un compte; un invité n'en a pas.
export interface RoomPlayerView {
  id: string;
  name: string;
  team: number | null;
  ready: boolean;
  loadout: Loadout | null;
  loadoutValid: boolean;
  rating: number | null;
}

// Le bilan d'un joueur à la fin du match: ce qu'il a infligé, encaissé, et ce que ça lui a valu.
export interface MatchSummaryPlayer {
  id: string;
  name: string;
  teamId: TeamId;
  damageDealt: number;
  damageTaken: number;
  kills: number;
  deaths: number;
  rating: { before: number; after: number } | null;
}

export interface MatchSummary {
  winnerTeamId: TeamId | null;
  scores: Record<TeamId, number>;
  ranked: boolean;
  players: MatchSummaryPlayer[];
}

export interface AccountView {
  name: string;
  rating: number;
  wins: number;
  losses: number;
}

// L'arbre du tournoi tel que la salle le diffuse: un joueur parti garde son nom dans la case.
export interface TournamentPlayerView {
  id: string;
  name: string;
}

export type TournamentMatchStatus = 'pending' | 'live' | 'done';

export interface TournamentMatchView {
  players: [TournamentPlayerView | null, TournamentPlayerView | null];
  winnerId: string | null;
  status: TournamentMatchStatus;
}

export interface TournamentView {
  size: number;
  rounds: TournamentMatchView[][];
  championId: string | null;
}

export interface RoomView {
  code: string;
  hasPassword: boolean;
  // Une salle sortie de la file classée: réglages figés, départ automatique une fois tout le monde prêt.
  locked: boolean;
  hostId: string;
  status: RoomStatus;
  settings: RoomSettings;
  map: MapSummary | null;
  players: RoomPlayerView[];
  startBlockers: StartBlocker[];
  tournament: TournamentView | null;
}

export type RoomSettingsPatch = Partial<RoomSettings>;

export type ClientMessage =
  | { type: 'hello'; protocolVersion: number; name: string }
  | { type: 'register'; name: string; password: string }
  | { type: 'login'; name: string; password: string }
  | { type: 'logout' }
  | { type: 'getLeaderboard' }
  | { type: 'createRoom'; password?: string; settings?: RoomSettingsPatch }
  | { type: 'joinRoom'; code: string; password?: string }
  | { type: 'joinQueue' }
  | { type: 'leaveQueue' }
  | { type: 'leaveRoom' }
  | { type: 'updateSettings'; patch: RoomSettingsPatch }
  | { type: 'setLoadout'; loadout: Loadout }
  | { type: 'setReady'; ready: boolean }
  | { type: 'switchTeam'; team: number }
  | { type: 'startMatch' }
  | { type: 'listMaps' }
  | { type: 'getMap'; id: string }
  | { type: 'saveMap'; document: MapDocument }
  | { type: 'input'; seq: number; input: PlayerInput }
  | { type: 'ping'; sentAt: number };

export const SERVER_ERROR_CODES = [
  'PROTOCOL_VERSION',
  'INVALID_MESSAGE',
  'NOT_INTRODUCED',
  'NOT_IN_ROOM',
  'ALREADY_IN_ROOM',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'WRONG_PASSWORD',
  'ROOM_IN_GAME',
  'TOO_MANY_ROOMS',
  'NOT_HOST',
  'WRONG_STATUS',
  'INVALID_SETTINGS',
  'INVALID_LOADOUT',
  'TEAM_FULL',
  'CANNOT_START',
  'INVALID_MAP',
  'MAP_NOT_FOUND',
  'MAP_STORE_FULL',
  'NAME_TAKEN',
  'BAD_CREDENTIALS',
  'ALREADY_LOGGED_IN',
  'NOT_LOGGED_IN',
  'SERVER_ERROR',
] as const;

export type ServerErrorCode = (typeof SERVER_ERROR_CODES)[number];

export type ServerMessage =
  | { type: 'welcome'; sessionId: string }
  | { type: 'accountState'; account: AccountView | null }
  | { type: 'leaderboard'; entries: AccountView[] }
  | { type: 'roomState'; room: RoomView }
  | { type: 'roomLeft' }
  | { type: 'queueState'; queued: boolean; size: number }
  | {
      // Un spectateur reçoit le match sans y être: son `playerId` n'existe pas dans le monde.
      type: 'matchStarted';
      playerId: PlayerId;
      spectator: boolean;
      tickRate: number;
      snapshotRate: number;
      matchConfig: MatchConfig;
      // Une carte par manche, dans l'ordre; une seule carte sert à toutes les manches.
      maps: MapDocument[];
    }
  | {
      type: 'snapshot';
      tick: Tick;
      lastProcessedSeq: number;
      world: WorldState;
      events: WorldEvent[];
    }
  | { type: 'matchSummary'; summary: MatchSummary }
  | { type: 'mapList'; maps: MapSummary[] }
  | { type: 'mapSaved'; id: string }
  | { type: 'mapDocument'; document: MapDocument }
  | { type: 'error'; code: ServerErrorCode; message: string }
  | { type: 'pong'; sentAt: number; serverTime: number };
