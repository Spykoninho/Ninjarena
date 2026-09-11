import type { PlayerInput } from '@ninjarena/core';

export interface PendingInput {
  seq: number;
  input: PlayerInput;
}

const DEFAULT_MAX_PENDING = 120;

export class PredictionBuffer {
  private readonly entries: PendingInput[] = [];
  private readonly maxPending: number;
  private lastPushedSeq: number | null = null;

  constructor(maxPending: number = DEFAULT_MAX_PENDING) {
    this.maxPending = Math.max(1, Math.floor(maxPending));
  }

  push(seq: number, input: PlayerInput): void {
    // Les seq sont attendues croissantes: une seq qui ne progresse pas est un doublon, on l'ignore.
    if (this.lastPushedSeq !== null && seq <= this.lastPushedSeq) return;
    this.lastPushedSeq = seq;
    this.entries.push({ seq, input });
    // Au-delà de la capacité les plus anciennes entrées sont perdues: le serveur ne les rejouera plus.
    while (this.entries.length > this.maxPending) this.entries.shift();
  }

  acknowledge(lastProcessedSeq: number): void {
    const firstKept = this.entries.findIndex((entry) => entry.seq > lastProcessedSeq);
    if (firstKept === -1) this.entries.length = 0;
    else if (firstKept > 0) this.entries.splice(0, firstKept);
  }

  get pending(): readonly PendingInput[] {
    return this.entries;
  }
}
