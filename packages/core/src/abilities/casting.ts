import type { AbilityDefinition } from '../definitions';
import { normalPhase } from '../player/phase';
import { setPhase } from '../player/phaseTransitions';
import type { PlayerState } from '../player/state';
import type { SimulationContext } from '../simulation/context';
import { executeActivationEffects } from './effects/activationEffects';

export function startCast(
  ctx: SimulationContext,
  player: PlayerState,
  slotIndex: number,
  ability: AbilityDefinition,
): void {
  const slot = player.abilities[slotIndex];
  if (slot === undefined) return;
  player.chakra -= ability.chakraCost;
  slot.readyAt = ctx.now + ctx.ticks(ability.cooldownMs);
  const activatesAt = ctx.now + ctx.ticks(ability.startupMs);
  setPhase(ctx, player, {
    kind: 'CASTING',
    slot: slotIndex,
    abilityId: ability.id,
    startedAt: ctx.now,
    activatesAt,
    endsAt: activatesAt + ctx.ticks(ability.recoveryMs),
    activated: false,
  });
  ctx.events.push({
    type: 'abilityCast',
    tick: ctx.now,
    playerId: player.id,
    abilityId: ability.id,
    slot: slotIndex,
  });
  // Une capacité sans startup s'active dans le tick du cast.
  progressCast(ctx, player);
}

export function progressCast(ctx: SimulationContext, player: PlayerState): void {
  const phase = player.phase;
  if (phase.kind !== 'CASTING') return;
  if (!phase.activated && ctx.now >= phase.activatesAt) {
    phase.activated = true;
    executeActivationEffects(ctx, player, ctx.abilities.get(phase.abilityId));
    ctx.events.push({
      type: 'abilityActivated',
      tick: ctx.now,
      playerId: player.id,
      abilityId: phase.abilityId,
    });
  }
  // Un effet peut remplacer la phase (dash): seul un cast encore en cours se termine ici.
  if (player.phase === phase && phase.activated && ctx.now >= phase.endsAt) {
    setPhase(ctx, player, normalPhase());
  }
}
