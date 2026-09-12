import type { RoomSettings, StatRulesDefinition } from '@ninjarena/core';
import { applySettingsPatch } from '@ninjarena/core';
import type { ClientSession } from '../session/clientSession';
import { hashPassword } from './password';
import type { Room, RoomError } from './room';
import { generateRoomCode, normalizeRoomCode } from './roomCode';

const MAX_CODE_ATTEMPTS = 100;

export interface CreateRoomRequest {
  password?: string;
  settings?: unknown;
}

export type CreateRoomError = {
  code: 'TOO_MANY_ROOMS' | 'ALREADY_IN_ROOM' | 'INVALID_SETTINGS';
  message: string;
};

export type JoinRoomError = {
  code: 'ROOM_NOT_FOUND' | 'ALREADY_IN_ROOM' | RoomError['code'];
  message: string;
};

export type CreateRoomResult = { ok: true; room: Room } | { ok: false; error: CreateRoomError };

export type JoinRoomResult = { ok: true; room: Room } | { ok: false; error: JoinRoomError };

export interface RoomManagerOptions {
  maxRooms: number;
  randomInt: (max: number) => number;
  createRoom: (code: string, passwordHash: Buffer | null, settings: RoomSettings) => Room;
  log?: (line: string) => void;
}

export class RoomManager {
  private readonly maxRooms: number;
  private readonly randomInt: (max: number) => number;
  private readonly createRoom: (
    code: string,
    passwordHash: Buffer | null,
    settings: RoomSettings,
  ) => Room;
  private readonly log: (line: string) => void;
  private readonly rooms = new Map<string, Room>();

  constructor(options: RoomManagerOptions) {
    this.maxRooms = options.maxRooms;
    this.randomInt = options.randomInt;
    this.createRoom = options.createRoom;
    this.log = options.log ?? (() => {});
  }

  get count(): number {
    return this.rooms.size;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(normalizeRoomCode(code));
  }

  create(
    session: ClientSession,
    request: CreateRoomRequest,
    rules: StatRulesDefinition,
    defaultSettings: RoomSettings,
  ): CreateRoomResult {
    if (session.room !== null) {
      return { ok: false, error: { code: 'ALREADY_IN_ROOM', message: 'already in a room' } };
    }
    if (this.rooms.size >= this.maxRooms) {
      return { ok: false, error: { code: 'TOO_MANY_ROOMS', message: 'the server is full' } };
    }
    const settings = this.settingsFor(request.settings, rules, defaultSettings);
    if (!settings.ok) return settings;

    const code = this.freeCode();
    const passwordHash = request.password === undefined ? null : hashPassword(request.password);
    const room = this.createRoom(code, passwordHash, settings.settings);
    this.rooms.set(code, room);
    // La carte se charge en arrière-plan: la salle se rediffusera d'elle-même une fois prête.
    void room.refreshMap().catch((error: unknown) => {
      this.log(`room ${code}: map refresh failed: ${reasonOf(error)}`);
    });
    const joined = room.join(session, request.password);
    if (!joined.ok) {
      this.rooms.delete(code);
      return { ok: false, error: { code: 'INVALID_SETTINGS', message: joined.error.message } };
    }
    return { ok: true, room };
  }

  join(session: ClientSession, code: string, password: string | undefined): JoinRoomResult {
    if (session.room !== null) {
      return { ok: false, error: { code: 'ALREADY_IN_ROOM', message: 'already in a room' } };
    }
    const room = this.get(code);
    if (room === undefined) {
      return { ok: false, error: { code: 'ROOM_NOT_FOUND', message: `no room "${code}"` } };
    }
    const joined = room.join(session, password);
    if (!joined.ok) return { ok: false, error: joined.error };
    return { ok: true, room };
  }

  leave(session: ClientSession): void {
    const room = session.room;
    if (room === null) return;
    room.leave(session);
    // Une salle vidée disparaît: son code redevient disponible.
    if (room.isEmpty) this.rooms.delete(room.code);
  }

  tick(): void {
    for (const room of this.rooms.values()) {
      if (room.match === null) continue;
      room.tick();
    }
  }

  private settingsFor(
    patch: unknown,
    rules: StatRulesDefinition,
    defaultSettings: RoomSettings,
  ): { ok: true; settings: RoomSettings } | { ok: false; error: CreateRoomError } {
    if (patch === undefined) return { ok: true, settings: { ...defaultSettings } };
    const applied = applySettingsPatch(defaultSettings, patch, rules);
    if (applied.ok) return applied;
    return { ok: false, error: { code: 'INVALID_SETTINGS', message: applied.reason } };
  }

  private freeCode(): string {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = generateRoomCode(this.randomInt);
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('no free room code left');
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
