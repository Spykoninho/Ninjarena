import type {
  Build,
  MatchConfig,
  PlayerId,
  PlayerInput,
  TeamId,
  Tick,
  WorldEvent,
  WorldState,
} from '@ninjarena/core';

export type ClientMessage =
  | { type: 'join'; protocolVersion: number; name: string; build: Build; techniqueIds: string[] }
  | { type: 'ready' }
  | { type: 'input'; seq: number; input: PlayerInput }
  | { type: 'ping'; sentAt: number };

export interface RoomPlayerInfo {
  id: PlayerId;
  name: string;
  teamId: TeamId;
  ready: boolean;
  techniqueIds: string[];
}

export const SERVER_ERROR_CODES = [
  'PROTOCOL_VERSION',
  'ROOM_FULL',
  'INVALID_MESSAGE',
  'NOT_JOINED',
  'INVALID_LOADOUT',
] as const;

export type ServerErrorCode = (typeof SERVER_ERROR_CODES)[number];

export type ServerMessage =
  | {
      type: 'welcome';
      playerId: PlayerId;
      tickRate: number;
      snapshotRate: number;
      mapId: string;
      matchConfig: MatchConfig;
    }
  | { type: 'roomState'; players: RoomPlayerInfo[] }
  | {
      type: 'snapshot';
      tick: Tick;
      lastProcessedSeq: number;
      world: WorldState;
      events: WorldEvent[];
    }
  | { type: 'error'; code: ServerErrorCode; message: string }
  | { type: 'pong'; sentAt: number; serverTime: number };
