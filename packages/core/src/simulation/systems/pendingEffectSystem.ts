import type { EffectContext } from '../../abilities/effects/executor';
import { affectablePlayers } from '../../abilities/effects/executor';
import { distance } from '../../math/vec2';
import type { SimulationContext } from '../context';
import type { PendingEffect } from '../entities/pendingEffect';
import { firePending, pendingContextOf } from '../entities/pendingEffect';

export function pendingEffectSystem(ctx: SimulationContext): void {
  for (const pending of Object.values(ctx.world.pending)) {
    // Une grappe déjà partie dans ce tick n'a plus rien à déclencher.
    if (ctx.world.pending[pending.id] === undefined) continue;
    const context = pendingContextOf(ctx, pending);
    if (pending.fireAt > ctx.now && !tripped(context, pending)) continue;
    firePending(ctx, pending);
  }
}

// Une mine part au passage: une cible qu'elle peut toucher entre dans son rayon de déclenchement.
function tripped(context: EffectContext, pending: PendingEffect): boolean {
  if (pending.triggerRadius <= 0) return false;
  return affectablePlayers(context).some(
    (player) => distance(pending.position, player.position) <= pending.triggerRadius,
  );
}
