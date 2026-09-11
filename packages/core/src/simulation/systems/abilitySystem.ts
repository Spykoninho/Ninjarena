import { progressCast, startCast } from '../../abilities/casting';
import { validateAbilityUse } from '../../abilities/validate';
import type { PlayerState } from '../../player/state';
import type { SimulationContext } from '../context';
import type { PlayerInputs } from '../input';
import { isAbilityHeld } from '../input';
import { alivePlayers } from '../world';

export function abilitySystem(ctx: SimulationContext, inputs: PlayerInputs): void {
  for (const player of alivePlayers(ctx.world)) {
    const held = inputs[player.id]?.abilityHeld ?? 0;
    // Seul un front montant déclenche un cast: garder la touche enfoncée ne relance rien.
    const pressed = held & ~player.previousAbilityHeld;
    player.previousAbilityHeld = held;
    if (pressed !== 0) castFirstPressed(ctx, player, pressed);
    progressCast(ctx, player);
  }
}

function castFirstPressed(ctx: SimulationContext, player: PlayerState, pressed: number): void {
  for (let slot = 0; slot < player.abilities.length; slot++) {
    if (!isAbilityHeld(pressed, slot)) continue;
    const result = validateAbilityUse(ctx, player, slot);
    if (result.ok) {
      startCast(ctx, player, slot, result.ability);
      return;
    }
    ctx.events.push({
      type: 'abilityRejected',
      tick: ctx.now,
      playerId: player.id,
      slot,
      reason: result.reason,
    });
  }
}
