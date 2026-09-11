import type { GameContent } from '@ninjarena/content';
import { DEFAULT_CHARACTER_ID, loadMap } from '@ninjarena/content';
import type { WorldEvent } from '@ninjarena/core';
import { GameSimulation, tickDurationMs } from '@ninjarena/core';
import type { ClientMessage } from '@ninjarena/protocol';
import { PROTOCOL_VERSION, clientMessageCodec } from '@ninjarena/protocol';
import type { ServerConfig } from './config/serverConfig';
import { Room } from './lobby/room';
import { RoomManager } from './lobby/roomManager';
import { MatchHost } from './match/matchHost';
import { TickLoop } from './match/tickLoop';
import type { MatchResultRepository } from './persistence/matchResultRepository';
import { ClientSession } from './session/clientSession';
import type { Connection, ServerTransport } from './transport/types';

export interface GameServerDeps {
  config: ServerConfig;
  transport: ServerTransport;
  content: GameContent;
  repository: MatchResultRepository;
  log?: (line: string) => void;
}

type JoinMessage = Extract<ClientMessage, { type: 'join' }>;
type JoinedMessage = Exclude<ClientMessage, { type: 'join' }>;

const DEFAULT_ROOM_ID = 'default';
const MAX_INVALID_MESSAGES = 20;

export class GameServer {
  private readonly config: ServerConfig;
  private readonly transport: ServerTransport;
  private readonly content: GameContent;
  private readonly repository: MatchResultRepository;
  private readonly log: (line: string) => void;
  private readonly rooms: RoomManager;
  private loop: TickLoop | null = null;

  constructor(deps: GameServerDeps) {
    this.config = deps.config;
    this.transport = deps.transport;
    this.content = deps.content;
    this.repository = deps.repository;
    this.log = deps.log ?? (() => {});
    this.rooms = new RoomManager(() => this.createDefaultRoom());
  }

  async start(): Promise<void> {
    const room = this.rooms.getOrCreateDefault();
    const host = new MatchHost({
      simulation: room.simulation,
      sessions: () => room.sessions,
      snapshotEveryTicks: this.snapshotEveryTicks(),
      onEvents: (events) => {
        this.storeFinishedMatches(room, events);
      },
    });
    const loop = new TickLoop(tickDurationMs({ tickRate: this.config.tickRate }), () => {
      host.tick();
    });
    this.transport.onConnection((connection) => {
      this.handleConnection(room, connection);
    });
    await this.transport.listen();
    loop.start();
    this.loop = loop;
  }

  async stop(): Promise<void> {
    this.loop?.stop();
    this.loop = null;
    await this.transport.close();
  }

  private createDefaultRoom(): Room {
    const matchConfig = this.content.matchModes.get(this.config.matchModeId);
    const simulation = new GameSimulation({
      map: loadMap(this.content, this.config.mapId),
      abilities: this.content.abilities,
      characters: this.content.characters,
      matchConfig,
      config: { tickRate: this.config.tickRate },
    });
    return new Room({
      id: DEFAULT_ROOM_ID,
      matchConfig,
      simulation,
      characterId: DEFAULT_CHARACTER_ID,
      autoStartWhenFull: this.config.autoStartWhenFull,
    });
  }

  private snapshotEveryTicks(): number {
    return Math.max(1, Math.round(this.config.tickRate / this.config.snapshotRate));
  }

  private handleConnection(room: Room, connection: Connection): void {
    const session = new ClientSession(connection, this.config.inputQueueCapacity);
    connection.onMessage((raw) => {
      this.handleMessage(room, session, raw);
    });
    connection.onClose(() => {
      room.leave(session);
    });
  }

  private handleMessage(room: Room, session: ClientSession, raw: string): void {
    const message = clientMessageCodec.decode(raw);
    if (message === null) {
      // Une trame illisible est jetée sans réponse; un flot d'entre elles ferme la connexion.
      session.invalidMessages += 1;
      if (session.invalidMessages !== MAX_INVALID_MESSAGES) return;
      this.log(`closing ${session.id} after ${MAX_INVALID_MESSAGES} invalid messages`);
      session.connection.close(1008, 'invalid messages');
      return;
    }
    if (message.type === 'join') {
      this.handleJoin(room, session, message);
      return;
    }
    if (session.playerId === null) {
      session.send({ type: 'error', code: 'NOT_JOINED', message: 'join the room first' });
      return;
    }
    this.handleJoinedMessage(room, session, message);
  }

  private handleJoin(room: Room, session: ClientSession, message: JoinMessage): void {
    if (message.protocolVersion !== PROTOCOL_VERSION) {
      session.send({
        type: 'error',
        code: 'PROTOCOL_VERSION',
        message: `server speaks protocol ${PROTOCOL_VERSION}`,
      });
      return;
    }
    // Un second `join` ne doit pas dupliquer le joueur déjà présent dans la simulation.
    if (session.playerId !== null) return;
    if (room.isFull) {
      session.send({ type: 'error', code: 'ROOM_FULL', message: 'the room is full' });
      return;
    }
    // Le client doit connaître son identifiant avant le `roomState` diffusé par la salle.
    session.send({
      type: 'welcome',
      playerId: session.id,
      tickRate: this.config.tickRate,
      snapshotRate: this.config.snapshotRate,
      mapId: this.config.mapId,
      matchConfig: room.matchConfig,
    });
    room.join(session, message.name);
  }

  private handleJoinedMessage(room: Room, session: ClientSession, message: JoinedMessage): void {
    switch (message.type) {
      case 'ready':
        room.setReady(session, true);
        return;
      case 'input':
        session.inputs.push(message.seq, message.input);
        return;
      case 'ping':
        session.send({ type: 'pong', sentAt: message.sentAt, serverTime: Date.now() });
        return;
      default: {
        const exhaustive: never = message;
        return exhaustive;
      }
    }
  }

  private storeFinishedMatches(room: Room, events: readonly WorldEvent[]): void {
    for (const event of events) {
      if (event.type !== 'matchEnded') continue;
      this.repository
        .save({
          roomId: room.id,
          matchModeId: room.matchConfig.id,
          winnerTeamId: event.winnerTeamId,
          scores: { ...room.simulation.world.match.scores },
          endedAt: Date.now(),
        })
        .catch((error: unknown) => {
          this.log(`failed to store match result: ${String(error)}`);
        });
    }
  }
}
