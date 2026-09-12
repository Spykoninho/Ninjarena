import { applyStatusEffectTicks } from '../../../combat/control';
import type { CombatPhaseState } from '../../../player/phase';
import { setPhase } from '../../../player/phaseTransitions';
import type { EffectHandler } from '../executor';
import { casterOf } from '../executor';

export const dashHandler: EffectHandler<'dash'> = (effect, context, path) => {
  const ctx = context.ctx;
  const caster = casterOf(context);
  if (caster === undefined) return;
  const phase: CombatPhaseState = {
    kind: 'DASHING',
    direction: { x: context.direction.x, y: context.direction.y },
    speed: effect.distance / (effect.durationMs / 1000),
    endsAt: ctx.now + Math.max(1, ctx.ticks(effect.durationMs)),
  };
  if (effect.onContact.length > 0) {
    phase.contact = { source: { abilityId: context.source.abilityId, path }, hitPlayerIds: [] };
  }
  // Le dash remplace la phase CASTING: ces capacités déclarent recoveryMs = 0.
  setPhase(ctx, caster, phase);
  if (effect.invulnerableTicks > 0) {
    applyStatusEffectTicks(ctx, caster, 'INVULNERABLE', effect.invulnerableTicks);
  }
};
