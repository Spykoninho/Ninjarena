import type { EffectContext } from '../../abilities/effects/executor';
import { affectablePlayers, executeList } from '../../abilities/effects/executor';
import { EPSILON, distance } from '../../math/vec2';
import type { SimulationContext } from '../context';
import { alivePlayers } from '../world';

export function dashContactSystem(ctx: SimulationContext): void {
  for (const player of alivePlayers(ctx.world)) {
    const phase = player.phase;
    if (phase.kind !== 'DASHING') continue;
    const contact = phase.contact;
    if (contact === undefined) continue;
    const ability = ctx.abilities.get(contact.source.abilityId);
    const context: EffectContext = {
      ctx,
      casterId: player.id,
      teamId: player.teamId,
      origin: { x: player.position.x, y: player.position.y },
      direction: phase.direction,
      source: contact.source,
    };
    for (const target of affectablePlayers(context)) {
      if (contact.hitPlayerIds.includes(target.id)) continue;
      const reach = player.stats.colliderRadius + target.stats.colliderRadius;
      // La séparation des joueurs laisse les colliders exactement jointifs: le contact doit l'accepter.
      if (distance(player.position, target.position) > reach + EPSILON) continue;
      contact.hitPlayerIds.push(target.id);
      ctx.events.push({
        type: 'dashContact',
        tick: ctx.now,
        playerId: player.id,
        targetId: target.id,
      });
      executeList(ability, contact.source.path, 'onContact', {
        ...context,
        target,
        origin: { x: target.position.x, y: target.position.y },
      });
    }
  }
}
