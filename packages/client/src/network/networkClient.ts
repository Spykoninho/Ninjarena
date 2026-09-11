import type { ClientMessage, ServerMessage } from '@ninjarena/protocol';
import { clientMessageCodec, serverMessageCodec } from '@ninjarena/protocol';

const MAX_LOGGED_CHARS = 120;

export class NetworkClient {
  private socket: WebSocket | null = null;
  private messageHandler: ((message: ServerMessage) => void) | null = null;
  private closeHandler: (() => void) | null = null;

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      this.socket = socket;
      socket.addEventListener('open', () => {
        resolve();
      });
      socket.addEventListener('error', () => {
        // Une erreur après l'ouverture n'a plus de promesse à rejeter: la fermeture suit de toute façon.
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
        this.socket = null;
        this.closeHandler?.();
      });
    });
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
  }
}
