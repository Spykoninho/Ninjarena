import type { ClientMessage, ServerMessage } from '@ninjarena/protocol';
import { clientMessageCodec, serverMessageCodec } from '@ninjarena/protocol';

const MAX_LOGGED_CHARS = 120;

export class NetworkClient {
  private socket: WebSocket | null = null;
  private handshake: Promise<void> | null = null;
  private messageHandler: ((message: ServerMessage) => void) | null = null;
  private closeHandler: (() => void) | null = null;

  connect(url: string): Promise<void> {
    // Un second appel n'ouvre jamais une deuxième socket: la première garde la place côté serveur.
    if (this.handshake !== null) return this.handshake;
    if (this.socket !== null && this.socket.readyState === WebSocket.OPEN) return Promise.resolve();
    const handshake = new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      this.socket = socket;
      socket.addEventListener('open', () => {
        this.handshake = null;
        resolve();
      });
      socket.addEventListener('error', () => {
        if (this.socket !== socket) return;
        // Une erreur après l'ouverture n'a plus de promesse à rejeter: la fermeture suit de toute façon.
        this.handshake = null;
        reject(new Error(`failed to connect to ${url}`));
      });
      socket.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (typeof event.data !== 'string') return;
        const message = serverMessageCodec.decode(event.data);
        if (message === null) {
          console.warn(
            `dropped an unreadable server frame: ${event.data.slice(0, MAX_LOGGED_CHARS)}`,
          );
          return;
        }
        this.messageHandler?.(message);
      });
      socket.addEventListener('close', () => {
        // Une socket périmée ne doit rien invalider de celle qui l'a remplacée.
        if (this.socket !== socket) return;
        this.socket = null;
        this.handshake = null;
        this.closeHandler?.();
      });
    });
    this.handshake = handshake;
    return handshake;
  }

  send(message: ClientMessage): void {
    const socket = this.socket;
    if (socket === null || socket.readyState !== WebSocket.OPEN) return;
    socket.send(clientMessageCodec.encode(message));
  }

  onMessage(handler: (message: ServerMessage) => void): void {
    this.messageHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
    this.handshake = null;
  }
}
