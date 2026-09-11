import type { GameSimulation, PlayerId, WorldState } from '@ninjarena/core';
import type { PendingInput } from './predictionBuffer';

export function reconcile(
  simulation: GameSimulation,
  localPlayerId: PlayerId,
  serverWorld: WorldState,
  pending: readonly PendingInput[],
): void {
  simulation.restore(serverWorld);
  // Les autres joueurs rejouent en entrée neutre: ils sont affichés depuis l'interpolateur, pas depuis cette simulation.
  for (const entry of pending) simulation.step({ [localPlayerId]: entry.input });
}
