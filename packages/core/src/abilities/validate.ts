import type { AbilityDefinition } from '../definitions';
import { canAct, isAlive } from '../player/rules';
import type { AbilitySlot, PlayerState } from '../player/state';
import type { SimulationContext } from '../simulation/context';
import type { AbilityUseRejection } from './rejection';

export type AbilityUseResult =
  | { ok: true; ability: AbilityDefinition; slot: AbilitySlot }
  | { ok: false; reason: AbilityUseRejection };

export function validateAbilityUse(
  ctx: SimulationContext,
  player: PlayerState,
  slotIndex: number,
): AbilityUseResult {
  if (!isAlive(player)) return { ok: false, reason: 'DEAD' };
  const slot = player.abilities[slotIndex];
  if (slot === undefined) return { ok: false, reason: 'NO_SUCH_SLOT' };
  if (!canAct(player)) return { ok: false, reason: 'BUSY' };
  if (slot.readyAt > ctx.now) return { ok: false, reason: 'ON_COOLDOWN' };
  const ability = ctx.abilities.get(slot.abilityId);
  if (player.energy < ability.energyCost) return { ok: false, reason: 'NOT_ENOUGH_ENERGY' };
  return { ok: true, ability, slot };
}
