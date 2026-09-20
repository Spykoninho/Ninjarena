import { isAlive } from '../player/rules';
import type { PlayerState } from '../player/state';
import type { SimulationContext } from '../simulation/context';
import type { PlayerId } from '../simulation/ids';

export function applyHeal(
  ctx: SimulationContext,
  target: PlayerState,
  amount: number,
  sourceId: PlayerId | null,
): number {
  if (!isAlive(target) || amount <= 0) return 0;
  // Le soin s'arrête au maximum de vie: seul ce qui est vraiment rendu est annoncé.
  const healed = Math.round(Math.min(target.stats.maxHealth - target.health, amount) * 10) / 10;
  if (healed <= 0) return 0;
  target.health += healed;
  ctx.events.push({
    type: 'healed',
    tick: ctx.now,
    targetId: target.id,
    sourceId,
    amount: healed,
    remainingHealth: target.health,
  });
  return healed;
}
