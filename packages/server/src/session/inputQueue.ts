import type { PlayerInput } from '@ninjarena/core';

export interface QueuedInput {
  seq: number;
  input: PlayerInput;
}

export class InputQueue {
  private readonly capacity: number;
  private readonly queued: QueuedInput[] = [];
  private lastQueuedSeq = -1;
  private lastConsumed: QueuedInput | null = null;

  constructor(capacity: number) {
    this.capacity = Math.max(1, Math.floor(capacity));
  }

  push(seq: number, input: PlayerInput): void {
    // Un paquet rejoué ou réordonné ne doit jamais faire reculer l'entrée d'un joueur.
    if (seq <= this.lastQueuedSeq) return;
    this.lastQueuedSeq = seq;
    this.queued.push({ seq, input });
    // Un client trop rapide perd ses entrées les plus anciennes plutôt que de prendre du retard.
    if (this.queued.length > this.capacity) this.queued.shift();
  }

  next(): QueuedInput | null {
    const queued = this.queued.shift();
    if (queued !== undefined) {
      this.lastConsumed = queued;
      return queued;
    }
    // Client en retard: on rejoue sa dernière entrée sans avancer l'accusé de réception.
    return this.lastConsumed;
  }

  get lastProcessedSeq(): number {
    return this.lastConsumed?.seq ?? -1;
  }

  get size(): number {
    return this.queued.length;
  }
}
