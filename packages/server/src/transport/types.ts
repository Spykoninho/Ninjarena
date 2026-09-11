export interface Connection {
  readonly id: string;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onMessage(handler: (raw: string) => void): void;
  onClose(handler: () => void): void;
}

export interface ServerTransport {
  onConnection(handler: (connection: Connection) => void): void;
  listen(): Promise<void>;
  close(): Promise<void>;
}
