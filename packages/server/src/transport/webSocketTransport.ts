import type { RawData } from 'ws';
import { WebSocket, WebSocketServer } from 'ws';
import type { Connection, ServerTransport } from './types';

class WebSocketConnection implements Connection {
  readonly id: string;
  private readonly socket: WebSocket;

  constructor(id: string, socket: WebSocket) {
    this.id = id;
    this.socket = socket;
  }

  send(data: string): void {
    if (this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(data);
  }

  close(code?: number, reason?: string): void {
    this.socket.close(code, reason);
  }

  onMessage(handler: (raw: string) => void): void {
    this.socket.on('message', (data: RawData, isBinary: boolean) => {
      // Le protocole est textuel: une trame binaire est ignorée plutôt qu'interprétée.
      if (isBinary) return;
      handler(data.toString());
    });
  }

  onClose(handler: () => void): void {
    this.socket.on('close', handler);
  }
}

export class WebSocketTransport implements ServerTransport {
  private readonly host: string;
  private readonly port: number;
  private server: WebSocketServer | null = null;
  private connectionHandler: ((connection: Connection) => void) | null = null;
  private connectionCount = 0;

  constructor(options: { host: string; port: number }) {
    this.host = options.host;
    this.port = options.port;
  }

  onConnection(handler: (connection: Connection) => void): void {
    this.connectionHandler = handler;
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = new WebSocketServer({ host: this.host, port: this.port });
      this.server = server;
      server.on('connection', (socket) => {
        // Une socket cliente en erreur ne doit pas faire tomber le serveur.
        socket.on('error', () => socket.terminate());
        this.connectionCount += 1;
        this.connectionHandler?.(new WebSocketConnection(`c${this.connectionCount}`, socket));
      });
      server.once('error', reject);
      server.once('listening', resolve);
    });
  }

  close(): Promise<void> {
    const server = this.server;
    if (server === null) return Promise.resolve();
    this.server = null;
    return new Promise((resolve, reject) => {
      // Sans fermeture des sockets restants, le serveur n'atteint jamais son rappel de fin.
      for (const client of server.clients) client.terminate();
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}
