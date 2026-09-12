import { describe, expect, it, onTestFinished } from 'vitest';
import { loadContent } from '@ninjarena/content';
import type { MapDocument } from '@ninjarena/core';
import { emptyBuild, migrateMapDocument, neutralInput, tickDurationMs } from '@ninjarena/core';
import type { ClientMessage, ServerMessage } from '@ninjarena/protocol';
import { PROTOCOL_VERSION, clientMessageCodec, serverMessageCodec } from '@ninjarena/protocol';
import { loadServerConfig } from './config/serverConfig';
import { InMemoryMapRepository } from './persistence/mapRepository';
import { InMemoryMatchResultRepository } from './persistence/matchResultRepository';
import { GameServer } from './server';
import { FakeConnection } from './testing/fakeConnection';
import type { Connection, ServerTransport } from './transport/types';

class StubTransport implements ServerTransport {
  private handler: ((connection: Connection) => void) | null = null;

  onConnection(handler: (connection: Connection) => void): void {
    this.handler = handler;
  }

  listen(): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  accept(id: string): FakeConnection {
    const connection = new FakeConnection(id);
    this.handler?.(connection);
    return connection;
  }
}

// Un minuteur virtuel remplace l'horloge réelle: la boucle avance pas à pas.
class VirtualTimers {
  private time = 0;
  private nextHandle = 1;
  private readonly pending = new Map<number, { at: number; callback: () => void }>();

  readonly now = (): number => this.time;

  readonly schedule = (callback: () => void, delayMs: number): unknown => {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.pending.set(handle, { at: this.time + delayMs, callback });
    return handle;
  };

  readonly cancel = (handle: unknown): void => {
    this.pending.delete(handle as number);
  };

  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      const due = [...this.pending.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (due === undefined) break;
      this.pending.delete(due[0]);
      this.time = due[1].at;
      due[1].callback();
    }
    this.time = target;
  }
}

const TECHNIQUE_IDS = ['blink', 'chakra-shield', 'lightning-dash'];

const startServer = async (
  env: Record<string, string> = {},
  timers?: VirtualTimers,
): Promise<{ server: GameServer; transport: StubTransport; logs: string[] }> => {
  const transport = new StubTransport();
  const logs: string[] = [];
  const server = new GameServer({
    config: loadServerConfig(env),
    transport,
    content: loadContent(),
    results: new InMemoryMatchResultRepository(),
    maps: new InMemoryMapRepository(),
    log: (line) => logs.push(line),
    ...(timers === undefined
      ? {}
      : { now: timers.now, schedule: timers.schedule, cancel: timers.cancel }),
  });
  await server.start();
  // La boucle de tick tourne sur de vrais timers par défaut: chaque test la coupe en sortant.
  onTestFinished(() => server.stop());
  return { server, transport, logs };
};

const decodeAll = (connection: FakeConnection): ServerMessage[] =>
  connection.sent
    .map((raw) => serverMessageCodec.decode(raw))
    .filter((message): message is ServerMessage => message !== null);

const messagesOf = <T extends ServerMessage['type']>(
  connection: FakeConnection,
  type: T,
): Extract<ServerMessage, { type: T }>[] =>
  decodeAll(connection).filter(
    (message): message is Extract<ServerMessage, { type: T }> => message.type === type,
  );

const lastOf = <T extends ServerMessage['type']>(
  connection: FakeConnection,
  type: T,
): Extract<ServerMessage, { type: T }> | undefined => messagesOf(connection, type).at(-1);

// La bibliothèque de cartes répond via de vraies promesses: les micro-tâches doivent s'écouler.
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const hello = (connection: FakeConnection, name: string): void => {
  connection.receive(
    clientMessageCodec.encode({ type: 'hello', protocolVersion: PROTOCOL_VERSION, name }),
  );
};

const send = (connection: FakeConnection, message: ClientMessage): void => {
  connection.receive(clientMessageCodec.encode(message));
};

const loadoutMessage = (): ClientMessage => ({
  type: 'setLoadout',
  loadout: { build: emptyBuild(), basicAttackId: 'kunai-strike', techniqueIds: TECHNIQUE_IDS },
});

const readyUp = (connection: FakeConnection): void => {
  send(connection, loadoutMessage());
  send(connection, { type: 'setReady', ready: true });
};

const codeOf = (connection: FakeConnection): string => {
  const room = lastOf(connection, 'roomState');
  if (room === undefined) throw new Error('no roomState was broadcast');
  return room.room.code;
};

function smallMap(
  overrides: { id?: string; name?: string; objects?: (number | null)[][] } = {},
): MapDocument {
  const size = 8;
  return migrateMapDocument({
    version: 1,
    id: overrides.id ?? 'pocket',
    name: overrides.name ?? 'Pocket',
    tileset: 'default',
    width: size,
    height: size,
    layers: {
      ground: Array.from({ length: size }, () => new Array<number>(size).fill(0)),
      objects:
        overrides.objects ??
        Array.from({ length: size }, () => new Array<number | null>(size).fill(null)),
    },
    colliders: [],
    spawns: [
      { x: 1, y: 1 },
      { x: 6, y: 6 },
    ],
  });
}

function walledMap(): MapDocument {
  const size = 8;
  const objects = Array.from({ length: size }, () => new Array<number | null>(size).fill(null));
  objects[1]![1] = 3; // 3 = mur dans le tileset "default"
  return smallMap({ id: 'walled', name: 'Walled', objects });
}

describe('GameServer dispatch', () => {
  it('requires hello before anything else and rejects an unsupported protocol version', async () => {
    const { transport } = await startServer();
    const connection = transport.accept('c1');

    send(connection, { type: 'createRoom' });
    expect(lastOf(connection, 'error')).toMatchObject({ code: 'NOT_INTRODUCED' });

    connection.receive(
      clientMessageCodec.encode({
        type: 'hello',
        protocolVersion: 2,
        name: 'one',
      }),
    );
    expect(lastOf(connection, 'error')).toMatchObject({ code: 'PROTOCOL_VERSION' });
  });

  it('creates and joins a room by code, and refuses a third player once full', async () => {
    const { transport } = await startServer();
    const host = transport.accept('c1');
    const guest = transport.accept('c2');
    hello(host, 'one');
    hello(guest, 'two');

    send(host, { type: 'createRoom' });
    const code = codeOf(host);

    send(guest, { type: 'joinRoom', code });
    expect(lastOf(host, 'roomState')?.room.players).toHaveLength(2);
    expect(lastOf(guest, 'roomState')?.room.players).toHaveLength(2);

    const third = transport.accept('c3');
    hello(third, 'three');
    send(third, { type: 'joinRoom', code });
    expect(lastOf(third, 'error')).toMatchObject({ code: 'ROOM_FULL' });
  });

  it('starts a match once both players are ready and streams the first snapshot to them alone', async () => {
    const timers = new VirtualTimers();
    const { transport } = await startServer({ NINJARENA_SNAPSHOT_RATE: '60' }, timers);
    const host = transport.accept('c1');
    const guest = transport.accept('c2');
    const bystander = transport.accept('c3');
    hello(host, 'one');
    hello(guest, 'two');
    hello(bystander, 'three');

    send(host, { type: 'createRoom' });
    const code = codeOf(host);
    await flush(); // laisse la salle charger sa carte avant de démarrer
    send(guest, { type: 'joinRoom', code });
    readyUp(host);
    readyUp(guest);

    send(host, { type: 'startMatch' });
    expect(lastOf(host, 'matchStarted')).toBeDefined();
    expect(lastOf(guest, 'matchStarted')).toBeDefined();

    timers.advance(tickDurationMs({ tickRate: 60 }));

    expect(messagesOf(host, 'snapshot')).toHaveLength(1);
    expect(messagesOf(guest, 'snapshot')).toHaveLength(1);
    expect(messagesOf(bystander, 'snapshot')).toHaveLength(0);
  });

  it('saves, lists and fetches a custom map, and rejects one with a blocked spawn', async () => {
    const { transport } = await startServer();
    const connection = transport.accept('c1');
    hello(connection, 'kunoichi');

    send(connection, { type: 'saveMap', document: smallMap() });
    await flush();
    const saved = lastOf(connection, 'mapSaved');
    expect(saved).toBeDefined();
    const mapList = lastOf(connection, 'mapList');
    expect(mapList?.maps.map((map) => map.id)).toEqual(
      expect.arrayContaining([saved?.id, 'arena']),
    );

    send(connection, { type: 'getMap', id: saved?.id ?? '' });
    await flush();
    expect(lastOf(connection, 'mapDocument')).toMatchObject({
      document: { id: saved?.id, author: 'kunoichi' },
    });

    send(connection, { type: 'getMap', id: 'nope' });
    await flush();
    expect(lastOf(connection, 'error')).toMatchObject({ code: 'MAP_NOT_FOUND' });

    send(connection, { type: 'saveMap', document: walledMap() });
    await flush();
    expect(lastOf(connection, 'error')).toMatchObject({ code: 'INVALID_MAP' });
  });

  it('lets a player leave the room and promotes the remaining player to host', async () => {
    const { transport } = await startServer();
    const host = transport.accept('c1');
    const guest = transport.accept('c2');
    hello(host, 'one');
    hello(guest, 'two');
    send(host, { type: 'createRoom' });
    const code = codeOf(host);
    send(guest, { type: 'joinRoom', code });

    send(host, { type: 'leaveRoom' });

    expect(lastOf(host, 'roomLeft')).toBeDefined();
    expect(lastOf(guest, 'roomState')?.room.hostId).toBe('c2');
  });

  it('migrates the host and removes the room as connections close', async () => {
    const { server, transport } = await startServer();
    const host = transport.accept('c1');
    const guest = transport.accept('c2');
    hello(host, 'one');
    hello(guest, 'two');
    send(host, { type: 'createRoom' });
    const code = codeOf(host);
    send(guest, { type: 'joinRoom', code });

    host.close();
    expect(lastOf(guest, 'roomState')?.room.hostId).toBe('c2');

    guest.close();
    expect(server.rooms.count).toBe(0);
  });

  it('drops input sent before a match starts and refuses ready once the game is running', async () => {
    const timers = new VirtualTimers();
    const { transport } = await startServer({ NINJARENA_TICK_RATE: '30' }, timers);
    const host = transport.accept('c1');
    const guest = transport.accept('c2');
    hello(host, 'one');
    hello(guest, 'two');
    send(host, { type: 'createRoom' });
    const code = codeOf(host);
    await flush(); // laisse la salle charger sa carte avant de démarrer
    send(guest, { type: 'joinRoom', code });

    send(host, { type: 'input', seq: 1, input: neutralInput() });
    expect(messagesOf(host, 'error')).toHaveLength(0);

    readyUp(host);
    readyUp(guest);
    send(host, { type: 'startMatch' });

    const tickMs = tickDurationMs({ tickRate: 30 });
    for (let i = 0; i < 400 && lastOf(host, 'roomState')?.room.status !== 'IN_GAME'; i++) {
      timers.advance(tickMs);
    }
    expect(lastOf(host, 'roomState')?.room.status).toBe('IN_GAME');

    send(guest, { type: 'setReady', ready: false });
    expect(lastOf(guest, 'error')).toMatchObject({ code: 'WRONG_STATUS' });
  });
});
