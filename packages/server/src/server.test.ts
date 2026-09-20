import { describe, expect, it, onTestFinished } from 'vitest';
import { loadContent } from '@ninjarena/content';
import type { MapDocument } from '@ninjarena/core';
import { emptyBuild, migrateMapDocument, neutralInput, tickDurationMs } from '@ninjarena/core';
import type { ClientMessage, ServerMessage } from '@ninjarena/protocol';
import { PROTOCOL_VERSION, clientMessageCodec, serverMessageCodec } from '@ninjarena/protocol';
import { loadServerConfig } from './config/serverConfig';
import { InMemoryAccountRepository } from './persistence/accountRepository';
import type { MapRepository } from './persistence/mapRepository';
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
  maps?: MapRepository,
): Promise<{ server: GameServer; transport: StubTransport; logs: string[] }> => {
  const transport = new StubTransport();
  const logs: string[] = [];
  const server = new GameServer({
    config: loadServerConfig(env),
    transport,
    content: loadContent(),
    results: new InMemoryMatchResultRepository(),
    maps: maps ?? new InMemoryMapRepository(),
    accounts: new InMemoryAccountRepository(),
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

// Simule une panne du dépôt de cartes: le catch de `listMaps`/`getMap`/`saveMap` doit répondre.
class FailingMapRepository extends InMemoryMapRepository {
  override list(): Promise<MapDocument[]> {
    return Promise.reject(new Error('disk error'));
  }
}

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

// `RoomManager.create` lance `refreshMap()` sans l'attendre: il faut vidanger une macro-tâche.
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// Le hachage d'un mot de passe tourne hors de la boucle d'événements: on attend la réponse elle-même.
const settled = async (connection: FakeConnection): Promise<void> => {
  const before = connection.sent.length;
  for (let attempt = 0; attempt < 200 && connection.sent.length === before; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

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

  it('closes a connection that keeps sending unreadable frames, once', async () => {
    const { transport, logs } = await startServer();
    const connection = transport.accept('c1');
    for (let i = 0; i < 19; i++) connection.receive('not a frame');
    expect(connection.closed).toBe(false);
    for (let i = 0; i < 6; i++) connection.receive('not a frame');
    expect(connection.closed).toBe(true);
    expect(connection.closeCode).toBe(1008);
    expect(logs.filter((line) => line.includes('invalid messages'))).toHaveLength(1);
  });

  it('answers every unreadable frame with INVALID_MESSAGE before it closes the connection', async () => {
    const { transport } = await startServer();
    const connection = transport.accept('c1');
    connection.receive('not a frame');
    expect(lastOf(connection, 'error')).toMatchObject({ code: 'INVALID_MESSAGE' });
    expect(connection.closed).toBe(false);

    for (let i = 0; i < 19; i++) connection.receive('not a frame');
    expect(connection.closed).toBe(true);
    expect(
      messagesOf(connection, 'error').filter((error) => error.code === 'INVALID_MESSAGE'),
    ).toHaveLength(20);
  });

  it('refuses a socket beyond the connection cap and frees the slot on close', async () => {
    const { transport } = await startServer({ NINJARENA_MAX_CONNECTIONS: '1' });
    const first = transport.accept('c1');
    const refused = transport.accept('c2');
    expect(first.closed).toBe(false);
    expect(refused.closed).toBe(true);
    expect(refused.closeCode).toBe(1013);
    first.close();
    expect(transport.accept('c3').closed).toBe(false);
  });

  it('answers a ping with a pong echoing sentAt', async () => {
    const { transport } = await startServer();
    const connection = transport.accept('c1');
    hello(connection, 'one');
    send(connection, { type: 'ping', sentAt: 1234 });
    expect(lastOf(connection, 'pong')).toMatchObject({ sentAt: 1234 });
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

  it('answers SERVER_ERROR when the map repository is unavailable', async () => {
    const { transport } = await startServer({}, undefined, new FailingMapRepository());
    const connection = transport.accept('c1');
    hello(connection, 'kunoichi');

    send(connection, { type: 'listMaps' });
    await flush();

    expect(lastOf(connection, 'error')).toMatchObject({ code: 'SERVER_ERROR' });
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

  it('registers, logs out and logs back into an account, keeping its name over hello', async () => {
    const { transport } = await startServer();
    const connection = transport.accept('c1');
    hello(connection, 'guest');

    send(connection, { type: 'register', name: 'kage', password: 'shadow' });
    await settled(connection);
    expect(lastOf(connection, 'accountState')?.account).toEqual({
      name: 'kage',
      rating: 100,
      wins: 0,
      losses: 0,
    });

    hello(connection, 'someone-else');
    send(connection, { type: 'createRoom' });
    expect(lastOf(connection, 'roomState')?.room.players[0]?.name).toBe('kage');

    send(connection, { type: 'logout' });
    expect(lastOf(connection, 'error')).toMatchObject({ code: 'ALREADY_IN_ROOM' });
    send(connection, { type: 'leaveRoom' });
    send(connection, { type: 'logout' });
    expect(lastOf(connection, 'accountState')?.account).toBeNull();

    send(connection, { type: 'login', name: 'kage', password: 'nope' });
    await settled(connection);
    expect(lastOf(connection, 'error')).toMatchObject({ code: 'BAD_CREDENTIALS' });
    send(connection, { type: 'login', name: 'kage', password: 'shadow' });
    await settled(connection);
    expect(lastOf(connection, 'accountState')?.account).toMatchObject({ name: 'kage' });
  });

  it('resumes an account from its token on a new connection, silently drops a revoked one', async () => {
    const { server, transport } = await startServer();
    const first = transport.accept('c1');
    hello(first, 'guest');
    send(first, { type: 'register', name: 'kage', password: 'shadow' });
    await settled(first);
    const token = lastOf(first, 'accountState')?.token;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    if (token === undefined) throw new Error('no token');

    // Le rechargement de la page coupe la socket: la suivante reprend le compte sans mot de passe.
    first.close();
    const second = transport.accept('c2');
    hello(second, 'guest');
    send(second, { type: 'resume', token });
    await settled(second);
    expect(lastOf(second, 'accountState')).toEqual({
      type: 'accountState',
      account: { name: 'kage', rating: 100, wins: 0, losses: 0 },
    });
    send(second, { type: 'createRoom' });
    expect(lastOf(second, 'roomState')?.room.players[0]?.name).toBe('kage');
    send(second, { type: 'leaveRoom' });
    send(second, { type: 'logout' });
    await settled(second);

    const third = transport.accept('c3');
    hello(third, 'guest');
    send(third, { type: 'resume', token });
    await settled(third);
    expect(lastOf(third, 'accountState')).toEqual({ type: 'accountState', account: null });
    expect(lastOf(third, 'error')).toBeUndefined();
    expect(server.rooms.count).toBe(0);
  });

  it('keeps guests out of a ranked room and blocks its start until everyone has an account', async () => {
    const { transport } = await startServer();
    const host = transport.accept('c1');
    const guest = transport.accept('c2');
    hello(host, 'one');
    hello(guest, 'two');

    send(host, { type: 'createRoom', settings: { ranked: true } });
    expect(lastOf(host, 'error')).toMatchObject({ code: 'NOT_LOGGED_IN' });

    send(host, { type: 'register', name: 'kage', password: 'shadow' });
    await settled(host);
    send(host, { type: 'createRoom', settings: { ranked: true } });
    const code = codeOf(host);
    await flush(); // laisse la salle charger sa carte avant de démarrer
    expect(lastOf(host, 'roomState')?.room.players[0]?.rating).toBe(100);

    send(guest, { type: 'joinRoom', code });
    expect(lastOf(guest, 'error')).toMatchObject({ code: 'NOT_LOGGED_IN' });

    send(host, { type: 'updateSettings', patch: { ranked: false } });
    send(guest, { type: 'joinRoom', code });
    send(host, { type: 'updateSettings', patch: { ranked: true } });
    readyUp(host);
    readyUp(guest);
    expect(lastOf(host, 'roomState')?.room.startBlockers).toEqual(['RANKED_NEEDS_ACCOUNT']);
    send(host, { type: 'startMatch' });
    expect(lastOf(host, 'error')).toMatchObject({ code: 'CANNOT_START' });
  });

  it('settles the ratings of a ranked match on a forfeit and lists them on the leaderboard', async () => {
    const timers = new VirtualTimers();
    const { transport } = await startServer({ NINJARENA_TICK_RATE: '30' }, timers);
    const host = transport.accept('c1');
    const guest = transport.accept('c2');
    hello(host, 'one');
    hello(guest, 'two');
    send(host, { type: 'register', name: 'kage', password: 'shadow' });
    send(guest, { type: 'register', name: 'hanzo', password: 'shadow' });
    await settled(host);
    await settled(guest);

    send(host, { type: 'createRoom', settings: { ranked: true } });
    const code = codeOf(host);
    await flush(); // laisse la salle charger sa carte avant de démarrer
    send(guest, { type: 'joinRoom', code });
    readyUp(host);
    readyUp(guest);
    send(host, { type: 'startMatch' });
    const tickMs = tickDurationMs({ tickRate: 30 });
    for (let i = 0; i < 400 && lastOf(host, 'roomState')?.room.status !== 'IN_GAME'; i++) {
      timers.advance(tickMs);
    }

    guest.close();

    expect(lastOf(host, 'roomState')?.room.status).toBe('FINISHED');
    expect(lastOf(host, 'accountState')?.account).toEqual({
      name: 'kage',
      rating: 115,
      wins: 1,
      losses: 0,
    });
    expect(lastOf(host, 'roomState')?.room.players[0]?.rating).toBe(115);

    await flush();
    send(host, { type: 'getLeaderboard' });
    await flush();
    expect(lastOf(host, 'leaderboard')?.entries).toEqual([
      { name: 'kage', rating: 115, wins: 1, losses: 0 },
      { name: 'hanzo', rating: 85, wins: 0, losses: 1 },
    ]);
  });

  it('pairs two queued accounts into a locked ranked room that starts by itself', async () => {
    const timers = new VirtualTimers();
    const { transport } = await startServer({ NINJARENA_TICK_RATE: '30' }, timers);
    const guest = transport.accept('c0');
    const one = transport.accept('c1');
    const two = transport.accept('c2');
    hello(guest, 'guest');
    hello(one, 'one');
    hello(two, 'two');
    send(guest, { type: 'joinQueue' });
    expect(lastOf(guest, 'error')).toMatchObject({ code: 'NOT_LOGGED_IN' });

    send(one, { type: 'register', name: 'kage', password: 'shadow' });
    send(two, { type: 'register', name: 'hanzo', password: 'shadow' });
    await settled(one);
    await settled(two);
    send(one, { type: 'joinQueue' });
    expect(lastOf(one, 'queueState')).toEqual({ type: 'queueState', queued: true, size: 1 });
    send(two, { type: 'joinQueue' });
    expect(lastOf(one, 'queueState')).toEqual({ type: 'queueState', queued: true, size: 2 });

    // L'appariement tourne une fois par seconde: un tick ne suffit pas, une seconde oui.
    const tickMs = tickDurationMs({ tickRate: 30 });
    timers.advance(1000 + tickMs);
    await flush();
    expect(lastOf(one, 'queueState')).toEqual({ type: 'queueState', queued: false, size: 0 });
    const room = lastOf(two, 'roomState')?.room;
    expect(room).toMatchObject({
      locked: true,
      settings: { ranked: true, mode: 'team', teamCount: 2, playersPerTeam: 1 },
    });
    expect(room?.players.map((player) => player.name)).toEqual(['kage', 'hanzo']);
    expect(codeOf(one)).toBe(room?.code);

    send(one, { type: 'updateSettings', patch: { bestOf: 5 } });
    expect(lastOf(one, 'error')).toMatchObject({ code: 'WRONG_STATUS' });

    readyUp(one);
    readyUp(two);
    for (let i = 0; i < 10 && lastOf(one, 'roomState')?.room.status === 'WAITING'; i++) {
      timers.advance(tickMs);
    }
    expect(lastOf(one, 'roomState')?.room.status).toBe('STARTING');
    expect(messagesOf(two, 'matchStarted')).toHaveLength(1);
  });

  it('drops a player from the queue when they leave it, open a room or disconnect', async () => {
    const timers = new VirtualTimers();
    const { server, transport } = await startServer({}, timers);
    const one = transport.accept('c1');
    const two = transport.accept('c2');
    hello(one, 'one');
    hello(two, 'two');
    send(one, { type: 'register', name: 'kage', password: 'shadow' });
    send(two, { type: 'register', name: 'hanzo', password: 'shadow' });
    await settled(one);
    await settled(two);

    send(one, { type: 'joinQueue' });
    send(one, { type: 'leaveQueue' });
    expect(lastOf(one, 'queueState')).toEqual({ type: 'queueState', queued: false, size: 0 });
    send(one, { type: 'joinQueue' });
    send(two, { type: 'joinQueue' });
    expect(lastOf(one, 'queueState')?.size).toBe(2);
    send(two, { type: 'createRoom' });
    expect(lastOf(one, 'queueState')?.size).toBe(1);
    expect(server.queue.size).toBe(1);
    one.close();
    expect(server.queue.size).toBe(0);
  });

  it('ignores input from a session outside any room but refuses the other room messages', async () => {
    const { transport } = await startServer();
    const connection = transport.accept('c1');
    hello(connection, 'one');
    send(connection, { type: 'input', seq: 1, input: neutralInput() });
    expect(messagesOf(connection, 'error')).toHaveLength(0);
    send(connection, { type: 'setReady', ready: true });
    expect(lastOf(connection, 'error')).toMatchObject({ code: 'NOT_IN_ROOM' });
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
