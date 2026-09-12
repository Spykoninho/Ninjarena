import type { GameSimulation, PlayerId, PlayerInput, WorldEvent } from '@ninjarena/core';
import { sanitizePlayerInput } from '@ninjarena/core';
import type { ClientSession } from '../session/clientSession';

export interface MatchHostOptions {
  simulation: GameSimulation;
  sessions: () => readonly ClientSession[];
  snapshotEveryTicks: number;
  onEvents?: (events: readonly WorldEvent[]) => void;
}

export class MatchHost {
  private readonly simulation: GameSimulation;
  private readonly sessions: () => readonly ClientSession[];
  private readonly snapshotEveryTicks: number;
  private readonly onEvents: ((events: readonly WorldEvent[]) => void) | null;
  private pendingEvents: WorldEvent[] = [];
  private ticksSinceSnapshot = 0;

  constructor(options: MatchHostOptions) {
    this.simulation = options.simulation;
    this.sessions = options.sessions;
    this.snapshotEveryTicks = Math.max(1, Math.floor(options.snapshotEveryTicks));
    this.onEvents = options.onEvents ?? null;
  }

  tick(): void {
    const sessions = this.sessions();
    const inputs: Record<PlayerId, PlayerInput> = {};
    for (const session of sessions) {
      if (session.playerId === null) continue;
      const queued = session.inputs.next();
      if (queued === null) continue;
      // Une entrée client n'est qu'une intention: elle est normalisée avant d'atteindre la simulation.
      inputs[session.playerId] = sanitizePlayerInput(queued.input);
    }
    const events = this.simulation.step(inputs);
    this.pendingEvents.push(...events);
    this.onEvents?.(events);
    this.ticksSinceSnapshot += 1;
    if (this.ticksSinceSnapshot < this.snapshotEveryTicks) return;
    this.ticksSinceSnapshot = 0;
    this.sendSnapshots(sessions);
  }

  // Une fin de partie ne tombe pas forcément sur un tick d'instantané: la salle force l'envoi.
  flush(): void {
    this.ticksSinceSnapshot = 0;
    this.sendSnapshots(this.sessions());
  }

  private sendSnapshots(sessions: readonly ClientSession[]): void {
    // Point d'accroche du futur filtre de visibilité: le monde deviendra propre à chaque session.
    const world = this.simulation.snapshot();
    const events = this.pendingEvents;
    this.pendingEvents = [];
    for (const session of sessions) {
      session.send({
        type: 'snapshot',
        tick: world.tick,
        lastProcessedSeq: session.inputs.lastProcessedSeq,
        world,
        events,
      });
    }
  }
}
