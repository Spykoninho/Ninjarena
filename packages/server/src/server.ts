import { randomInt as cryptoRandomInt } from 'node:crypto';
import type { GameContent } from '@ninjarena/content';
import { DEFAULT_CHARACTER_ID, DEFAULT_MAP_ID } from '@ninjarena/content';
import type { RoomSettings } from '@ninjarena/core';
import { defaultRoomSettings, tickDurationMs } from '@ninjarena/core';
import type { ClientMessage } from '@ninjarena/protocol';
import { PROTOCOL_VERSION, clientMessageCodec } from '@ninjarena/protocol';
import { AccountService } from './accounts/accountService';
import type { AccountResult } from './accounts/accountService';
import type { ServerConfig } from './config/serverConfig';
import type { RoomResult } from './lobby/room';
import { Room } from './lobby/room';
import { RoomManager } from './lobby/roomManager';
import { MapLibrary } from './maps/mapLibrary';
import { TickLoop } from './match/tickLoop';
import type { AccountRepository } from './persistence/accountRepository';
import type { MapRepository } from './persistence/mapRepository';
import type { MatchResult, MatchResultRepository } from './persistence/matchResultRepository';
import { ClientSession } from './session/clientSession';
import type { Connection, ServerTransport } from './transport/types';

export interface GameServerDeps {
  config: ServerConfig;
  transport: ServerTransport;
  content: GameContent;
  results: MatchResultRepository;
  maps: MapRepository;
  accounts: AccountRepository;
  log?: (line: string) => void;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancel?: (handle: unknown) => void;
  randomInt?: (max: number) => number;
}

type RoomMessage = Extract<
  ClientMessage,
  {
    type:
      | 'leaveRoom'
      | 'updateSettings'
      | 'setLoadout'
      | 'setReady'
      | 'switchTeam'
      | 'startMatch'
      | 'input';
  }
>;

const MAX_INVALID_MESSAGES = 20;

export class GameServer {
  private readonly config: ServerConfig;
  private readonly transport: ServerTransport;
  private readonly content: GameContent;
  private readonly results: MatchResultRepository;
  private readonly mapLibrary: MapLibrary;
  private readonly accounts: AccountService;
  private readonly log: (line: string) => void;
  private readonly roomManager: RoomManager;
  private readonly now: () => number;
  private readonly schedule: (callback: () => void, delayMs: number) => unknown;
  private readonly cancel: (handle: unknown) => void;
  private loop: TickLoop | null = null;
  private openConnections = 0;

  constructor(deps: GameServerDeps) {
    this.config = deps.config;
    this.transport = deps.transport;
    this.content = deps.content;
    this.results = deps.results;
    this.log = deps.log ?? (() => {});
    this.accounts = new AccountService({ repository: deps.accounts, log: this.log });
    this.mapLibrary = new MapLibrary({
      content: deps.content,
      repository: deps.maps,
      maxStoredMaps: deps.config.maxStoredMaps,
    });
    this.roomManager = new RoomManager({
      maxRooms: deps.config.maxRooms,
      randomInt: deps.randomInt ?? ((max) => cryptoRandomInt(max)),
      createRoom: (code, passwordHash, settings) => this.createRoom(code, passwordHash, settings),
      log: this.log,
    });
    // Les minuteurs sont injectables: les tests pilotent la boucle sans horloge réelle.
    this.now = deps.now ?? (() => performance.now());
    this.schedule = deps.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.cancel =
      deps.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  get rooms(): RoomManager {
    return this.roomManager;
  }

  async start(): Promise<void> {
    this.transport.onConnection((connection) => {
      this.handleConnection(connection);
    });
    await this.transport.listen();
    const loop = new TickLoop(
      tickDurationMs({ tickRate: this.config.tickRate }),
      () => {
        this.roomManager.tick();
      },
      { now: this.now, schedule: this.schedule, cancel: this.cancel },
    );
    loop.start();
    this.loop = loop;
  }

  async stop(): Promise<void> {
    this.loop?.stop();
    this.loop = null;
    await this.transport.close();
  }

  private createRoom(code: string, passwordHash: Buffer | null, settings: RoomSettings): Room {
    return new Room({
      code,
      passwordHash,
      settings,
      content: this.content,
      maps: this.mapLibrary,
      tickRate: this.config.tickRate,
      snapshotEveryTicks: this.snapshotEveryTicks(),
      postMatchTicks: this.postMatchTicks(),
      characterId: DEFAULT_CHARACTER_ID,
      onMatchEnded: (result) => {
        this.storeMatchResult(result);
        return result.settings.ranked ? this.accounts.settle(result) : [];
      },
    });
  }

  private snapshotEveryTicks(): number {
    return Math.max(1, Math.round(this.config.tickRate / this.config.snapshotRate));
  }

  private postMatchTicks(): number {
    const tickMs = tickDurationMs({ tickRate: this.config.tickRate });
    return Math.round(this.config.postMatchMs / tickMs);
  }

  private storeMatchResult(result: MatchResult): void {
    void this.results.save(result).catch((error: unknown) => {
      this.log(`failed to store match result: ${reasonOf(error)}`);
    });
  }

  private handleConnection(connection: Connection): void {
    // Un socket de trop est refusé avant toute allocation: aucune salle ne le voit jamais.
    if (this.openConnections >= this.config.maxConnections) {
      this.log(`refusing ${connection.id}: ${this.config.maxConnections} connections already open`);
      connection.close(1013, 'server full');
      return;
    }
    this.openConnections += 1;
    const session = new ClientSession(connection, this.config.inputQueueCapacity);
    connection.onMessage((raw) => {
      this.handleMessage(session, raw);
    });
    connection.onClose(() => {
      this.openConnections -= 1;
      this.roomManager.leave(session);
      this.accounts.logout(session);
    });
  }

  private handleMessage(session: ClientSession, raw: string): void {
    const message = clientMessageCodec.decode(raw);
    if (message === null) {
      session.send({ type: 'error', code: 'INVALID_MESSAGE', message: 'unreadable message' });
      // Une trame illisible reçoit une erreur; un flot d'entre elles ferme quand même la connexion.
      session.invalidMessages += 1;
      if (session.invalidMessages < MAX_INVALID_MESSAGES || session.closed) return;
      this.log(`closing ${session.id} after ${MAX_INVALID_MESSAGES} invalid messages`);
      session.close(1008, 'invalid messages');
      return;
    }
    if (message.type === 'hello') {
      this.handleHello(session, message);
      return;
    }
    if (!session.introduced) {
      session.send({ type: 'error', code: 'NOT_INTRODUCED', message: 'send hello first' });
      return;
    }
    switch (message.type) {
      case 'ping':
        session.send({ type: 'pong', sentAt: message.sentAt, serverTime: Date.now() });
        return;
      case 'register':
      case 'login':
        this.handleAccountAccess(session, message);
        return;
      case 'logout':
        this.handleLogout(session);
        return;
      case 'getLeaderboard':
        this.handleLeaderboard(session);
        return;
      case 'createRoom':
        this.handleCreateRoom(session, message);
        return;
      case 'joinRoom':
        this.handleJoinRoom(session, message);
        return;
      case 'listMaps':
        this.handleListMaps(session);
        return;
      case 'getMap':
        this.handleGetMap(session, message);
        return;
      case 'saveMap':
        this.handleSaveMap(session, message);
        return;
      case 'leaveRoom':
      case 'updateSettings':
      case 'setLoadout':
      case 'setReady':
      case 'switchTeam':
      case 'startMatch':
      case 'input':
        this.handleRoomMessage(session, message);
        return;
      default: {
        const exhaustive: never = message;
        return exhaustive;
      }
    }
  }

  private handleHello(
    session: ClientSession,
    message: Extract<ClientMessage, { type: 'hello' }>,
  ): void {
    if (message.protocolVersion !== PROTOCOL_VERSION) {
      session.send({
        type: 'error',
        code: 'PROTOCOL_VERSION',
        message: `server speaks protocol ${PROTOCOL_VERSION}`,
      });
      return;
    }
    if (session.room !== null) {
      session.send({ type: 'error', code: 'ALREADY_IN_ROOM', message: 'already in a room' });
      return;
    }
    // Un `hello` répété hors salle ne fait que renommer la session; un compte garde son pseudo.
    session.introduced = true;
    if (session.account === null) session.name = message.name;
    session.send({ type: 'welcome', sessionId: session.id });
  }

  private handleAccountAccess(
    session: ClientSession,
    message: Extract<ClientMessage, { type: 'register' | 'login' }>,
  ): void {
    if (session.room !== null) {
      session.send({ type: 'error', code: 'ALREADY_IN_ROOM', message: 'leave the room first' });
      return;
    }
    const access: Promise<AccountResult> =
      message.type === 'register'
        ? this.accounts.register(session, message.name, message.password)
        : this.accounts.login(session, message.name, message.password);
    void access
      .then((result) => {
        if (!result.ok) {
          session.send({ type: 'error', code: result.error.code, message: result.error.message });
          return;
        }
        session.send({ type: 'accountState', account: result.account });
      })
      .catch((error: unknown) => {
        this.log(`${message.type} failed for ${session.id}: ${reasonOf(error)}`);
        session.send({ type: 'error', code: 'SERVER_ERROR', message: 'accounts are unavailable' });
      });
  }

  private handleLogout(session: ClientSession): void {
    if (session.room !== null) {
      session.send({ type: 'error', code: 'ALREADY_IN_ROOM', message: 'leave the room first' });
      return;
    }
    this.accounts.logout(session);
    session.send({ type: 'accountState', account: null });
  }

  private handleLeaderboard(session: ClientSession): void {
    void this.accounts
      .leaderboard()
      .then((entries) => {
        session.send({ type: 'leaderboard', entries });
      })
      .catch((error: unknown) => {
        this.log(`getLeaderboard failed for ${session.id}: ${reasonOf(error)}`);
        session.send({ type: 'error', code: 'SERVER_ERROR', message: 'accounts are unavailable' });
      });
  }

  private handleCreateRoom(
    session: ClientSession,
    message: Extract<ClientMessage, { type: 'createRoom' }>,
  ): void {
    const defaults = defaultRoomSettings(this.content.statRules, DEFAULT_MAP_ID);
    const created = this.roomManager.create(
      session,
      { password: message.password, settings: message.settings },
      this.content.statRules,
      defaults,
    );
    if (!created.ok) {
      session.send({ type: 'error', code: created.error.code, message: created.error.message });
    }
  }

  private handleJoinRoom(
    session: ClientSession,
    message: Extract<ClientMessage, { type: 'joinRoom' }>,
  ): void {
    const joined = this.roomManager.join(session, message.code, message.password);
    if (!joined.ok) {
      session.send({ type: 'error', code: joined.error.code, message: joined.error.message });
    }
  }

  private handleListMaps(session: ClientSession): void {
    void this.mapLibrary
      .list()
      .then((maps) => {
        session.send({ type: 'mapList', maps });
      })
      .catch((error: unknown) => {
        this.log(`listMaps failed for ${session.id}: ${reasonOf(error)}`);
        session.send({
          type: 'error',
          code: 'SERVER_ERROR',
          message: 'the map library is unavailable',
        });
      });
  }

  private handleGetMap(
    session: ClientSession,
    message: Extract<ClientMessage, { type: 'getMap' }>,
  ): void {
    void this.mapLibrary
      .get(message.id)
      .then((document) => {
        if (document === null) {
          session.send({ type: 'error', code: 'MAP_NOT_FOUND', message: `no map "${message.id}"` });
          return;
        }
        session.send({ type: 'mapDocument', document });
      })
      .catch((error: unknown) => {
        this.log(`getMap failed for ${session.id}: ${reasonOf(error)}`);
        session.send({
          type: 'error',
          code: 'SERVER_ERROR',
          message: 'the map library is unavailable',
        });
      });
  }

  private handleSaveMap(
    session: ClientSession,
    message: Extract<ClientMessage, { type: 'saveMap' }>,
  ): void {
    void this.mapLibrary
      .save(message.document, session.name)
      .then((result) => {
        if (!result.ok) {
          session.send({ type: 'error', code: result.code, message: result.message });
          return;
        }
        session.send({ type: 'mapSaved', id: result.id });
        this.handleListMaps(session);
      })
      .catch((error: unknown) => {
        this.log(`saveMap failed for ${session.id}: ${reasonOf(error)}`);
        session.send({
          type: 'error',
          code: 'SERVER_ERROR',
          message: 'the map library is unavailable',
        });
      });
  }

  private handleRoomMessage(session: ClientSession, message: RoomMessage): void {
    const room = session.room;
    if (room === null) {
      session.send({ type: 'error', code: 'NOT_IN_ROOM', message: 'join a room first' });
      return;
    }
    switch (message.type) {
      case 'leaveRoom':
        this.roomManager.leave(session);
        session.send({ type: 'roomLeft' });
        return;
      case 'updateSettings':
        this.replyIfError(session, room.updateSettings(session, message.patch));
        return;
      case 'setLoadout':
        this.replyIfError(session, room.setLoadout(session, message.loadout));
        return;
      case 'setReady':
        this.replyIfError(session, room.setReady(session, message.ready));
        return;
      case 'switchTeam':
        this.replyIfError(session, room.switchTeam(session, message.team));
        return;
      case 'startMatch':
        this.replyIfError(session, room.start(session));
        return;
      case 'input':
        // Une entrée hors match n'a pas d'effet et n'a pas besoin d'être signalée.
        if (session.playerId === null) return;
        session.inputs.push(message.seq, message.input);
        return;
      default: {
        const exhaustive: never = message;
        return exhaustive;
      }
    }
  }

  private replyIfError(session: ClientSession, result: RoomResult): void {
    if (!result.ok) {
      session.send({ type: 'error', code: result.error.code, message: result.error.message });
    }
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
