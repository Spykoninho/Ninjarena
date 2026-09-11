import { describe, expect, it, onTestFinished } from 'vitest';
import { loadContent } from '@ninjarena/content';
import { neutralInput } from '@ninjarena/core';
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

const startServer = async (): Promise<{ server: GameServer; transport: StubTransport }> => {
  const transport = new StubTransport();
  const server = new GameServer({
    config: loadServerConfig({ NINJARENA_AUTO_START: 'false' }),
    transport,
    content: CONTENT,
    repository: new InMemoryMatchResultRepository(),
  });
  await server.start();
  // La boucle de tick tourne sur de vrais timers: chaque test la coupe en sortant.
  onTestFinished(() => server.stop());
  return { server, transport };
};

const messagesOf = (connection: FakeConnection): ServerMessage[] =>
  connection.sent
    .map((raw) => serverMessageCodec.decode(raw))
    .filter((message): message is ServerMessage => message !== null);

const join = (
  connection: FakeConnection,
  name: string,
  protocolVersion = PROTOCOL_VERSION,
): void => {
  connection.receive(clientMessageCodec.encode({ type: 'join', protocolVersion, name }));
};

describe('GameServer', () => {
  it('refuses a join that speaks another protocol version', async () => {
    const { server, transport } = await startServer();
    const connection = transport.accept('c1');
    join(connection, 'one', PROTOCOL_VERSION + 1);
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

  it('refuses a third player on a duel room', async () => {
    const { server, transport } = await startServer();
    join(transport.accept('c1'), 'one');
    join(transport.accept('c2'), 'two');
    const third = transport.accept('c3');
    join(third, 'three');
    expect(messagesOf(third)).toMatchObject([{ type: 'error', code: 'ROOM_FULL' }]);
    expect(Object.keys(server.defaultRoom.simulation.world.players)).toEqual(['c1', 'c2']);
  });

  it('closes a connection that keeps sending unreadable frames', async () => {
    const { transport } = await startServer();
    const connection = transport.accept('c1');
    for (let i = 0; i < 20; i++) connection.receive('not a frame');
    expect(connection.closed).toBe(true);
    expect(connection.closeCode).toBe(1008);
  });

  it('answers a ping with a pong echoing sentAt', async () => {
    const { transport } = await startServer();
    const connection = transport.accept('c1');
    join(connection, 'one');
    connection.receive(clientMessageCodec.encode({ type: 'ping', sentAt: 1234 }));
    expect(messagesOf(connection).at(-1)).toMatchObject({ type: 'pong', sentAt: 1234 });
  });

  it('sends welcome before the room state on a valid join', async () => {
    const { transport } = await startServer();
    const connection = transport.accept('c1');
    join(connection, 'one');
    expect(messagesOf(connection).map((message) => message.type)).toEqual(['welcome', 'roomState']);
  });
});
