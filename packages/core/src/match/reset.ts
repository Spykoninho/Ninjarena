import type { Vec2 } from '../math/vec2';
import { normalPhase } from '../player/phase';
import type { PlayerState } from '../player/state';
import type { SimulationContext } from '../simulation/context';
import { computeStats } from '../stats/formulas';
import { removeObstacle } from '../simulation/entities/obstacle';
import { playersOf } from '../simulation/world';
import { spawnPositionFor } from './spawns';

export function respawnPlayer(ctx: SimulationContext, player: PlayerState, position: Vec2): void {
  player.position = { x: position.x, y: position.y };
  player.velocity = { x: 0, y: 0 };
  // Les stats repartent de la répartition: un sacrifice de chakra ne dure que la manche.
  player.stats = computeStats(
    ctx.characters.get(player.characterId).baseStats,
    player.build,
    ctx.rules,
  );
  player.health = player.stats.maxHealth;
  player.chakra = player.stats.maxChakra;
  player.statuses = [];
  for (const slot of player.abilities) slot.readyAt = 0;
  // setPhase refuse de quitter DEAD: la renaissance écrit la phase directement.
  player.phase = normalPhase();
  ctx.events.push({ type: 'phaseChanged', tick: ctx.now, playerId: player.id, phase: 'NORMAL' });
}

export function clearTransientEntities(ctx: SimulationContext): void {
  for (const projectile of Object.values(ctx.world.projectiles)) {
    ctx.events.push({
      type: 'projectileDestroyed',
      tick: ctx.now,
      projectileId: projectile.id,
      reason: 'expired',
      position: { x: projectile.position.x, y: projectile.position.y },
    });
  }
  ctx.world.projectiles = {};
  // Une zone balayée ne se déclenche pas: elle disparaît sans toucher personne.
  ctx.world.pending = {};
  for (const obstacle of Object.values(ctx.world.obstacles)) removeObstacle(ctx, obstacle);
}

export function resetWorldForRound(ctx: SimulationContext): void {
  for (const player of playersOf(ctx.world)) {
    respawnPlayer(ctx, player, spawnPositionFor(ctx.map, ctx.matchConfig, player, ctx.world));
  }
  clearTransientEntities(ctx);
}
