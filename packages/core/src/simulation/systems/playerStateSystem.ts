import { normalPhase } from '../../player/phase';
import { setPhase } from '../../player/phaseTransitions';
import { isAlive } from '../../player/rules';
import type { PlayerState } from '../../player/state';
import { removeExpiredStatuses } from '../../player/status';
import type { SimulationContext } from '../context';
import { playersOf } from '../world';

export function playerStateSystem(ctx: SimulationContext): void {
  for (const player of playersOf(ctx.world)) {
    if (!isAlive(player)) continue;
    expireTimedPhase(ctx, player);
    removeExpiredStatuses(player, ctx.now);
    regenerateChakra(player, ctx.dt);
  }
}

function expireTimedPhase(ctx: SimulationContext, player: PlayerState): void {
  // CASTING est exclu: le système de capacités gère sa propre fin de cast.
  const phase = player.phase;
  switch (phase.kind) {
    case 'DASHING':
    case 'STUNNED':
    case 'KNOCKBACK':
      if (phase.endsAt <= ctx.now) setPhase(ctx, player, normalPhase());
      return;
    default:
      return;
  }
}

function regenerateChakra(player: PlayerState, dt: number): void {
  const regenerated = player.chakra + player.stats.chakraRegenPerSecond * dt;
  player.chakra = Math.min(player.stats.maxChakra, regenerated);
}
