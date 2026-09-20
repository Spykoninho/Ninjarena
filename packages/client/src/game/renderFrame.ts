import type {
  AbilityDefinition,
  CombatPhaseState,
  DefinitionCatalog,
  ObstacleState,
  PendingEffect,
  PlayerId,
  PlayerState,
  ProjectileState,
  Vec2,
  WorldState,
  LoadedMap,
  Shape,
} from '@ninjarena/core';
import { abilityFamily } from '../rendering/art/abilityVisual';
import { dashPreviewDistance } from '../rendering/art/telegraphGeometry';
import { add, getStatus, isVisibleTo, normalize, scale } from '@ninjarena/core';
import type { InterpolatedWorld } from '../netcode/snapshotInterpolator';
import type {
  MeleeArcView,
  ObstacleView,
  PlayerView,
  ProjectileView,
  RenderFrame,
  TelegraphView,
  ZoneView,
} from '../rendering/renderer';

export interface RenderFrameInput {
  localPlayerId: PlayerId;
  predicted: WorldState;
  localRenderPosition: Vec2;
  alpha: number;
  dt: number;
  remotes: InterpolatedWorld | null;
  abilities: DefinitionCatalog<AbilityDefinition>;
  tick: number;
  isFfa: boolean;
  cameraTarget: Vec2;
  map?: LoadedMap;
  friendlyFire?: boolean;
}

type CastingPhase = Extract<CombatPhaseState, { kind: 'CASTING' }>;

export function buildRenderFrame(input: RenderFrameInput): RenderFrame {
  const local = input.predicted.players[input.localPlayerId];
  const players: PlayerView[] = [];
  if (local !== undefined) {
    players.push(toPlayerView(input, local, input.localRenderPosition, input.tick, true, true));
  }
  const remoteTick = remoteTickOf(input);
  for (const remote of Object.values(input.remotes?.players ?? {})) {
    // Le joueur local vient de la prédiction, jamais de l'interpolation.
    if (remote.id === input.localPlayerId) continue;
    const visible = local === undefined || isVisibleTo(remote, local);
    players.push(toPlayerView(input, remote, remote.renderPosition, remoteTick, false, visible));
  }
  return {
    camera: input.cameraTarget,
    players,
    projectiles: projectileViews(input),
    zones: zoneViews(input),
    obstacles: obstacleViews(input),
    isFfa: input.isFfa,
  };
}

function projectileViews(input: RenderFrameInput): ProjectileView[] {
  const views: ProjectileView[] = [];
  // Les tirs du joueur local partent de sa simulation: ils apparaissent sans attendre le serveur.
  for (const projectile of own(input.predicted.projectiles, input.localPlayerId)) {
    const position = add(projectile.position, scale(projectile.velocity, input.dt * input.alpha));
    views.push({
      ...toProjectileView(projectile, position, input.abilities),
      dangerous: dangerousFor(projectile.ownerId, projectile.teamId, input),
    });
  }
  for (const projectile of others(input.remotes?.projectiles, input.localPlayerId)) {
    views.push({
      ...toProjectileView(projectile, projectile.renderPosition, input.abilities),
      dangerous: dangerousFor(projectile.ownerId, projectile.teamId, input),
    });
  }
  return views;
}

function zoneViews(input: RenderFrameInput): ZoneView[] {
  const views: ZoneView[] = [];
  for (const pending of own(input.predicted.pending, input.localPlayerId)) {
    const view = toZoneView(pending, input.tick);
    push(
      views,
      view ? { ...view, dangerous: dangerousFor(pending.ownerId, pending.teamId, input) } : null,
    );
  }
  for (const pending of others(input.remotes?.pending, input.localPlayerId)) {
    const view = toZoneView(pending, remoteTickOf(input));
    push(
      views,
      view ? { ...view, dangerous: dangerousFor(pending.ownerId, pending.teamId, input) } : null,
    );
  }
  return views;
}

function obstacleViews(input: RenderFrameInput): ObstacleView[] {
  const views: ObstacleView[] = [];
  for (const obstacle of own(input.predicted.obstacles, input.localPlayerId)) {
    views.push(toObstacleView(obstacle, input.tick, input.dt));
  }
  for (const obstacle of others(input.remotes?.obstacles, input.localPlayerId)) {
    views.push(toObstacleView(obstacle, remoteTickOf(input), input.dt));
  }
  return views;
}

// Ce qui vient de l'interpolateur décrit un instant passé: sa progression se lit à ce tick-là.
function remoteTickOf(input: RenderFrameInput): number {
  return input.remotes?.tick ?? input.tick;
}

function own<T extends { ownerId: PlayerId }>(
  entities: Record<string, T>,
  localPlayerId: PlayerId,
): T[] {
  return Object.values(entities).filter((entity) => entity.ownerId === localPlayerId);
}

function others<T extends { ownerId: PlayerId }>(
  entities: Record<string, T> | undefined,
  localPlayerId: PlayerId,
): T[] {
  return Object.values(entities ?? {}).filter((entity) => entity.ownerId !== localPlayerId);
}

function push<T>(views: T[], view: T | null): void {
  if (view !== null) views.push(view);
}

function toPlayerView(
  input: RenderFrameInput,
  player: PlayerState,
  position: Vec2,
  tick: number,
  isLocal: boolean,
  visible: boolean,
): PlayerView {
  const casting = player.phase.kind === 'CASTING' ? player.phase : null;
  const ability = casting === null ? null : input.abilities.get(casting.abilityId);
  return {
    id: player.id,
    teamId: player.teamId,
    position,
    aim: player.aim,
    phase: player.phase.kind,
    isLocal,
    visible,
    healthRatio: ratioOf(player.health, player.stats.maxHealth),
    shieldRatio: ratioOf(getStatus(player, 'SHIELDED')?.magnitude ?? 0, player.stats.maxHealth),
    telegraph:
      casting === null || ability === null
        ? null
        : toTelegraphView(
            casting,
            ability,
            player.aim,
            position,
            tick,
            input.map,
            dangerousFor(player.id, player.teamId, input),
            player.stats.colliderRadius,
            [
              ...Object.values(input.predicted.obstacles),
              ...Object.values(input.remotes?.obstacles ?? {}),
            ].map((o) => o.shape),
            player.aimDistance,
          ),
    activeArc: casting === null || ability === null ? null : toArcView(casting, ability, tick),
    isDashing: player.phase.kind === 'DASHING',
    velocity: player.velocity,
    basicCast: ability?.kind === 'basic',
    castFamily: ability === null ? undefined : abilityFamily(ability),
    castAbilityId: ability === null ? undefined : ability.id,
    // Le relâchement suit le tick d'activation: la pose de frappe ne devance jamais le coup.
    castReleased: casting !== null && (casting.activated || tick >= casting.activatesAt),
    rooted: getStatus(player, 'ROOTED') !== undefined,
    slowed: getStatus(player, 'SLOWED') !== undefined,
    hasted: getStatus(player, 'HASTED') !== undefined,
    stealthed: getStatus(player, 'INVISIBLE') !== undefined,
    invulnerable: getStatus(player, 'INVULNERABLE') !== undefined,
  };
}

function toTelegraphView(
  casting: CastingPhase,
  ability: AbilityDefinition,
  aim: Vec2,
  position: Vec2,
  tick: number,
  map?: LoadedMap,
  dangerous = true,
  colliderRadius = 5,
  obstacles: readonly Shape[] = [],
  aimDistance: number | null = null,
): TelegraphView | null {
  const telegraph = ability.telegraph;
  if (telegraph === null) return null;
  // Le télégraphe annonce le coup: il disparaît dès que la capacité part.
  if (casting.activated || tick >= casting.activatesAt) return null;
  const direction = normalize(aim);
  const distance =
    telegraph.anchor === 'aim' ? aimedDistance(ability, telegraph.size, aimDistance) : 0;
  const first = ability.effects[0];
  let anchor = add(position, scale(direction, distance));
  if (first?.type === 'area' && map)
    anchor = {
      x: Math.max(0, Math.min(map.widthInUnits, anchor.x)),
      y: Math.max(0, Math.min(map.heightInUnits, anchor.y)),
    };
  const terrainFactor =
    first?.type === 'area' && map
      ? first.terrain.reduce(
          (factor, rule) =>
            map.terrainAt(anchor).tags.includes(rule.tag)
              ? factor * (rule.radiusMultiplier ?? 1)
              : factor,
          1,
        )
      : 1;
  return {
    dangerous,
    family: abilityFamily(ability),
    arc: first?.type === 'melee' ? first.arcDegrees : undefined,
    width:
      first?.type === 'spawnEntity'
        ? first.thickness
        : first?.type === 'dash'
          ? colliderRadius
          : first?.type === 'projectile' && first.pierce
            ? first.radius
            : undefined,
    kind: telegraph.kind,
    color: telegraph.color,
    size:
      first?.type === 'area'
        ? first.radius * terrainFactor
        : first?.type === 'spawnEntity'
          ? first.width
          : first?.type === 'dash'
            ? map
              ? dashPreviewDistance(
                  map,
                  position,
                  direction,
                  first.distance,
                  colliderRadius,
                  obstacles,
                )
              : first.distance
            : first?.type === 'melee'
              ? first.range
              : telegraph.size,
    progress: progressOf(tick - casting.startedAt, casting.activatesAt - casting.startedAt),
    anchor,
    direction,
  };
}

function aimedDistance(
  ability: AbilityDefinition,
  size: number,
  aimDistance: number | null,
): number {
  const first = ability.effects[0];
  // Une zone visée frappe à sa portée: le télégraphe annonce ce point, pas le bout de la visée.
  if (first?.type === 'area' && first.origin === 'aim') return first.range;
  if (first?.type === 'area' && first.origin === 'cursor')
    return Math.min(first.range, aimDistance ?? first.range);
  // Un mur apparaît à son décalage: sa marque au sol annonce l'endroit exact où il se dressera.
  if (first?.type === 'spawnEntity') return first.offset;
  return size;
}

function toArcView(
  casting: CastingPhase,
  ability: AbilityDefinition,
  tick: number,
): MeleeArcView | null {
  const first = ability.effects[0];
  if (first?.type !== 'melee') return null;
  if (tick < casting.activatesAt || tick >= casting.activeUntil) return null;
  return first.color === undefined
    ? { range: first.range, arcDegrees: first.arcDegrees }
    : { range: first.range, arcDegrees: first.arcDegrees, color: first.color };
}

function toProjectileView(
  projectile: ProjectileState,
  position: Vec2,
  abilities: DefinitionCatalog<AbilityDefinition>,
): ProjectileView {
  const ability = abilities.get(projectile.source.abilityId);
  const style = projectile.visual.style;
  return {
    ...(ability.tags.includes('control')
      ? { family: 'control' }
      : ability.kind === 'basic'
        ? { family: 'shuriken' }
        : {}),
    ...(style === undefined ? {} : { style }),
    id: projectile.id,
    position,
    radius: projectile.radius,
    color: projectile.visual.color,
    trail: projectile.visual.trail,
    direction: normalize(projectile.velocity),
  };
}

function toZoneView(pending: PendingEffect, tick: number): ZoneView | null {
  // Un déclencheur sans rayon ni visuel ne s'annonce pas: il n'y a rien à dessiner au sol.
  if (pending.radius === null || pending.visual === null) return null;
  const style = pending.visual.style;
  return {
    id: pending.id,
    position: pending.position,
    radius: pending.radius,
    color: pending.visual.color,
    ...(style === undefined ? {} : { style }),
    ...(pending.triggerRadius > 0 ? { trap: pending.triggerRadius } : {}),
    progress: progressOf(tick - pending.createdAt, pending.fireAt - pending.createdAt),
  };
}

function toObstacleView(obstacle: ObstacleState, tick: number, dt: number): ObstacleView {
  return {
    id: obstacle.id,
    points: [...obstacle.shape.points],
    color: obstacle.visual.color,
    // La durée de vie n'est pas dans l'état: le mur s'efface sur sa dernière seconde de jeu.
    remaining: clamp01((obstacle.expiresAt - tick) * dt),
  };
}

function progressOf(elapsed: number, span: number): number {
  // Une fenêtre nulle est déjà écoulée: le télégraphe s'affiche complet.
  return span <= 0 ? 1 : clamp01(elapsed / span);
}

function ratioOf(value: number, max: number): number {
  return max > 0 ? clamp01(value / max) : 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function dangerousFor(ownerId: string, teamId: string, input: RenderFrameInput): boolean {
  const local = input.predicted.players[input.localPlayerId];
  if (ownerId === input.localPlayerId) return false;
  return !local || input.friendlyFire === true || teamId !== local.teamId;
}
