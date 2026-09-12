import { describe, expect, it, onTestFinished } from 'vitest';
import { loadContent } from '@ninjarena/content';
import { emptyBuild, neutralInput } from '@ninjarena/core';
import type { Build } from '@ninjarena/core';
import type { ServerMessage } from '@ninjarena/protocol';
import { PROTOCOL_VERSION, clientMessageCodec, serverMessageCodec } from '@ninjarena/protocol';
import { loadServerConfig } from './config/serverConfig';
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

const CONTENT = loadContent();

const TECHNIQUE_IDS = ['blink', 'chakra-shield', 'lightning-dash'];

const startServer = async (
  env: Record<string, string> = {},
): Promise<{ server: GameServer; transport: StubTransport; logs: string[] }> => {
  const transport = new StubTransport();
  const logs: string[] = [];
  const server = new GameServer({
    config: loadServerConfig({ NINJARENA_AUTO_START: 'false', ...env }),
    transport,
    content: CONTENT,
    repository: new InMemoryMatchResultRepository(),
    log: (line) => logs.push(line),
  });
  await server.start();
  // La boucle de tick tourne sur de vrais timers: chaque test la coupe en sortant.
  onTestFinished(() => server.stop());
  return { server, transport, logs };
};

const messagesOf = (connection: FakeConnection): ServerMessage[] =>
  connection.sent
    .map((raw) => serverMessageCodec.decode(raw))
    .filter((message): message is ServerMessage => message !== null);

interface JoinOverrides {
  protocolVersion?: number;
  build?: Build;
  techniqueIds?: string[];
}

const join = (connection: FakeConnection, name: string, overrides: JoinOverrides = {}): void => {
  connection.receive(
    clientMessageCodec.encode({
      type: 'join',
      protocolVersion: overrides.protocolVersion ?? PROTOCOL_VERSION,
      name,
      build: overrides.build ?? emptyBuild(),
      techniqueIds: overrides.techniqueIds ?? TECHNIQUE_IDS,
    }),
  );
};

describe('GameServer', () => {
  it('refuses a join that speaks another protocol version', async () => {
    const { server, transport } = await startServer();
    const connection = transport.accept('c1');
    join(connection, 'one', { protocolVersion: PROTOCOL_VERSION + 1 });
    expect(messagesOf(connection)).toEqual([
      {
        type: 'error',
        code: 'PROTOCOL_VERSION',
        message: `server speaks protocol ${PROTOCOL_VERSION}`,
      },
    ]);
    expect(server.defaultRoom.simulation.world.players).toEqual({});
  });

  it('answers an input sent before joining with NOT_JOINED', async () => {
    const { transport } = await startServer();
    const connection = transport.accept('c1');
    connection.receive(clientMessageCodec.encode({ type: 'input', seq: 1, input: neutralInput() }));
    expect(messagesOf(connection)).toMatchObject([{ type: 'error', code: 'NOT_JOINED' }]);
  });

  it('refuses a join that overspends the build budget', async () => {
    const { server, transport } = await startServer();
    const connection = transport.accept('c1');
    join(connection, 'one', { build: { ...emptyBuild(), vitality: 5, strength: 5, power: 1 } });
    const messages = messagesOf(connection);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ type: 'error', code: 'INVALID_LOADOUT' });
    expect(messages[0]).toHaveProperty('message', expect.stringContaining('budget'));
    expect(server.defaultRoom.simulation.world.players).toEqual({});
    expect(server.defaultRoom.sessions).toHaveLength(0);
  });

  it('refuses a join whose loadout leaves a technique slot empty', async () => {
    const { server, transport } = await startServer();
    const connection = transport.accept('c1');
    join(connection, 'one', { techniqueIds: ['blink', 'chakra-shield'] });
    expect(messagesOf(connection)).toMatchObject([{ type: 'error', code: 'INVALID_LOADOUT' }]);
    expect(server.defaultRoom.simulation.world.players).toEqual({});
  });

  it('refuses a third player on a duel room', async () => {
    const { server, transport } = await startServer();
    join(transport.accept('c1'), 'one');
    join(transport.accept('c2'), 'two');
    const third = transport.accept('c3');
    join(third, 'three');
    expect(messagesOf(third)).toMatchObject([{ type: 'error', code: 'ROOM_FULL' }]);
    expect(Object.keys(server.defaultRoom.simulation.world.players)).toEqual(['c1', 'c2']);
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
    join(connection, 'one');
    connection.receive(clientMessageCodec.encode({ type: 'ping', sentAt: 1234 }));
    expect(messagesOf(connection).at(-1)).toMatchObject({ type: 'pong', sentAt: 1234 });
  });

  it('sends welcome before a room state carrying the chosen techniques', async () => {
    const { server, transport } = await startServer();
    const connection = transport.accept('c1');
    join(connection, 'one', { build: { ...emptyBuild(), vitality: 3 } });
    const messages = messagesOf(connection);
    expect(messages.map((message) => message.type)).toEqual(['welcome', 'roomState']);
    expect(messages[1]).toMatchObject({
      type: 'roomState',
      players: [{ id: 'c1', name: 'one', techniqueIds: TECHNIQUE_IDS }],
    });
    expect(server.defaultRoom.simulation.world.players['c1']?.stats.maxHealth).toBe(136);
  });
});
