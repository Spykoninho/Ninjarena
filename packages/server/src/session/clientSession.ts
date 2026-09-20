import type { PlayerId } from '@ninjarena/core';
import type { AccountView, ServerMessage } from '@ninjarena/protocol';
import { serverMessageCodec } from '@ninjarena/protocol';
import type { Room } from '../lobby/room';
import type { Connection } from '../transport/types';
import { InputQueue } from './inputQueue';

export class ClientSession {
  readonly id: string;
  readonly connection: Connection;
  readonly inputs: InputQueue;
  introduced = false;
  name: string;
  room: Room | null = null;
  account: AccountView | null = null;
  // L'empreinte du jeton qui a ouvert le compte: c'est lui que la déconnexion révoque.
  sessionToken: string | null = null;
  playerId: PlayerId | null = null;
  invalidMessages = 0;
  closed = false;

  constructor(connection: Connection, inputQueueCapacity: number) {
    this.id = connection.id;
    this.connection = connection;
    this.inputs = new InputQueue(inputQueueCapacity);
    this.name = connection.id;
  }

  send(message: ServerMessage): void {
    this.connection.send(serverMessageCodec.encode(message));
  }

  close(code: number, reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.connection.close(code, reason);
  }
}
