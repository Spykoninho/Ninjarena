import type { PlayerId } from '@ninjarena/core';
import type { ServerMessage } from '@ninjarena/protocol';
import { serverMessageCodec } from '@ninjarena/protocol';
import type { Connection } from '../transport/types';
import { InputQueue } from './inputQueue';

export class ClientSession {
  readonly id: string;
  readonly connection: Connection;
  readonly inputs: InputQueue;
  playerId: PlayerId | null = null;
  name: string;
  ready = false;
  invalidMessages = 0;

  constructor(connection: Connection, inputQueueCapacity: number) {
    this.id = connection.id;
    this.connection = connection;
    this.inputs = new InputQueue(inputQueueCapacity);
    this.name = connection.id;
  }

  send(message: ServerMessage): void {
    this.connection.send(serverMessageCodec.encode(message));
  }
}
