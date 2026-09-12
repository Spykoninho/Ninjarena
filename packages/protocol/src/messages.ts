import type {
  Loadout,
  MapDocument,
  MapSummary,
  MatchConfig,
  PlayerId,
  PlayerInput,
  RoomSettings,
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
] as const;

export type StartBlocker = (typeof START_BLOCKERS)[number];

export interface RoomPlayerView {
  id: string;
  name: string;
  team: number | null;
  ready: boolean;
  loadout: Loadout | null;
  loadoutValid: boolean;
}

export interface RoomView {
  code: string;
  hasPassword: boolean;
  hostId: string;
  status: RoomStatus;
  settings: RoomSettings;
  map: MapSummary | null;
  players: RoomPlayerView[];
  startBlockers: StartBlocker[];
}

export type RoomSettingsPatch = Partial<RoomSettings>;

export type ClientMessage =
  | { type: 'hello'; protocolVersion: number; name: string }
  | { type: 'createRoom'; password?: string; settings?: RoomSettingsPatch }
  | { type: 'joinRoom'; code: string; password?: string }
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
] as const;

export type ServerErrorCode = (typeof SERVER_ERROR_CODES)[number];

export type ServerMessage =
  | { type: 'welcome'; sessionId: string }
  | { type: 'roomState'; room: RoomView }
  | { type: 'roomLeft' }
  | {
      type: 'matchStarted';
      playerId: PlayerId;
      tickRate: number;
      snapshotRate: number;
      matchConfig: MatchConfig;
      map: MapDocument;
    }
  | {
      type: 'snapshot';
      tick: Tick;
      lastProcessedSeq: number;
      world: WorldState;
      events: WorldEvent[];
    }
  | { type: 'mapList'; maps: MapSummary[] }
  | { type: 'mapSaved'; id: string }
  | { type: 'mapDocument'; document: MapDocument }
  | { type: 'error'; code: ServerErrorCode; message: string }
  | { type: 'pong'; sentAt: number; serverTime: number };
