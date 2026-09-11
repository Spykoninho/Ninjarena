import type { SimulationContext } from '../simulation/context';
import type { CombatPhaseState } from './phase';
import type { PlayerState } from './state';

export function setPhase(
  ctx: SimulationContext,
  player: PlayerState,
  phase: CombatPhaseState,
): boolean {
  // La mort est terminale: aucune autre phase ne peut la remplacer.
  if (player.phase.kind === 'DEAD') return false;
  player.phase = phase;
  ctx.events.push({
    type: 'phaseChanged',
    tick: ctx.now,
    playerId: player.id,
    phase: phase.kind,
  });
  return true;
}
