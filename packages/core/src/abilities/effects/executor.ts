import { canAffect } from '../../combat/damage';
import type { AbilityDefinition, Effect, EffectOfType } from '../../definitions';
import type { Vec2 } from '../../math/vec2';
import { isZero, normalize } from '../../math/vec2';
import { isDamageable } from '../../player/rules';
import type { PlayerState } from '../../player/state';
import type { SimulationContext } from '../../simulation/context';
import type { PlayerId, TeamId } from '../../simulation/ids';
import { playersOf } from '../../simulation/world';
import type { EffectListName, EffectRef } from '../effectRef';
import { childPath, effectList, rootPath } from '../effectRef';
import { applyStatusHandler } from './handlers/applyStatus';
import { damageHandler } from './handlers/damage';
import { dashHandler } from './handlers/dash';
import { knockbackHandler } from './handlers/knockback';
import { meleeHandler } from './handlers/melee';
import { projectileHandler } from './handlers/projectile';
import { shieldHandler } from './handlers/shield';
import { stunHandler } from './handlers/stun';
import { teleportHandler } from './handlers/teleport';

export interface EffectContext {
  ctx: SimulationContext;
  casterId: PlayerId;
  teamId: TeamId;
  origin: Vec2;
  direction: Vec2;
  target?: PlayerState;
  source: EffectRef;
}

export type EffectHandler<K extends Effect['type']> = (
  effect: EffectOfType<K>,
  context: EffectContext,
  path: string,
) => void;

export type EffectHandlers = { [K in Effect['type']]: EffectHandler<K> };

export const effectHandlers: EffectHandlers = {
  projectile: projectileHandler,
  melee: meleeHandler,
  dash: dashHandler,
  teleport: teleportHandler,
  shield: shieldHandler,
  damage: damageHandler,
  knockback: knockbackHandler,
  stun: stunHandler,
  applyStatus: applyStatusHandler,
  // Provisoire: remplacé par les zones et murs.
  area: unavailable('area'),
  spawnEntity: unavailable('spawnEntity'),
  delayedTrigger: unavailable('delayedTrigger'),
};

export function executeEffects(
  effects: readonly Effect[],
  context: EffectContext,
  paths: readonly string[],
): void {
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    const path = paths[i];
    if (effect === undefined || path === undefined) continue;
    handlerFor(effect)(effect, context, path);
  }
}

export function executeList(
  ability: AbilityDefinition,
  listPath: string,
  list: EffectListName,
  context: EffectContext,
): void {
  const effects = effectList(ability, listPath, list);
  executeEffects(
    effects,
    context,
    effects.map((_, index) => childPath(listPath, list, index)),
  );
}

export function executeAbilityEffects(
  ctx: SimulationContext,
  caster: PlayerState,
  ability: AbilityDefinition,
): void {
  const context: EffectContext = {
    ctx,
    casterId: caster.id,
    teamId: caster.teamId,
    origin: { x: caster.position.x, y: caster.position.y },
    direction: aimOf(caster),
    source: { abilityId: ability.id, path: '' },
  };
  executeEffects(
    ability.effects,
    context,
    ability.effects.map((_, index) => rootPath(index)),
  );
}

export function casterOf(context: EffectContext): PlayerState | undefined {
  return context.ctx.world.players[context.casterId];
}

export function affectablePlayers(context: EffectContext): PlayerState[] {
  const ctx = context.ctx;
  const caster = casterOf(context);
  return playersOf(ctx.world).filter((player) => {
    if (caster !== undefined) return canAffect(ctx, caster, player);
    // Lanceur parti: l'équipe portée par l'effet garde les règles de tir allié.
    if (!isDamageable(player)) return false;
    return ctx.matchConfig.friendlyFire || context.teamId !== player.teamId;
  });
}

const DEFAULT_AIM: Vec2 = { x: 1, y: 0 };

export function aimOf(caster: PlayerState): Vec2 {
  return isZero(caster.aim) ? DEFAULT_AIM : normalize(caster.aim);
}

function unavailable<K extends Effect['type']>(type: K): EffectHandler<K> {
  return () => {
    throw new Error(`effect "${type}" is not available yet`);
  };
}

type AnyEffectHandler = (effect: Effect, context: EffectContext, path: string) => void;

function handlerFor(effect: Effect): AnyEffectHandler {
  // Le discriminant garantit l'appariement handler/effet, que TypeScript ne peut pas corréler ici.
  return effectHandlers[effect.type] as AnyEffectHandler;
}
