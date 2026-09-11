import type { Connection } from '../transport/types';

export class FakeConnection implements Connection {
  readonly id: string;
  readonly sent: string[] = [];
  closed = false;
  closeCode: number | null = null;
  private messageHandler: ((raw: string) => void) | null = null;
  private closeHandler: (() => void) | null = null;

  constructor(id: string) {
    this.id = id;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number): void {
    if (this.closed) return;
    this.closed = true;
    this.closeCode = code ?? null;
    this.closeHandler?.();
  }

  onMessage(handler: (raw: string) => void): void {
    this.messageHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  receive(raw: string): void {
    this.messageHandler?.(raw);
  }
}
