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
} from '@ninjarena/core';
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
}

type CastingPhase = Extract<CombatPhaseState, { kind: 'CASTING' }>;

// La durée de vie d'un mur n'est pas dans l'état: il s'efface sur sa dernière seconde de jeu.
const OBSTACLE_FADE_TICKS = 60;

export function buildRenderFrame(input: RenderFrameInput): RenderFrame {
  const local = input.predicted.players[input.localPlayerId];
  const players: PlayerView[] = [];
  if (local !== undefined) {
    players.push(toPlayerView(input, local, input.localRenderPosition, true, true));
  }
  for (const remote of Object.values(input.remotes?.players ?? {})) {
    // Le joueur local vient de la prédiction, jamais de l'interpolation.
    if (remote.id === input.localPlayerId) continue;
    const visible = local === undefined || isVisibleTo(remote, local);
    players.push(toPlayerView(input, remote, remote.renderPosition, false, visible));
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
  return Object.values(input.remotes?.projectiles ?? {}).map((projectile) =>
    toProjectileView(projectile, projectile.renderPosition),
  );
}

function zoneViews(input: RenderFrameInput): ZoneView[] {
  const views: ZoneView[] = [];
  for (const pending of Object.values(input.remotes?.pending ?? {})) {
    push(views, toZoneView(pending, input.tick));
  }
  return views;
}

function obstacleViews(input: RenderFrameInput): ObstacleView[] {
  return Object.values(input.remotes?.obstacles ?? {}).map((obstacle) =>
    toObstacleView(obstacle, input.tick),
  );
}

function push<T>(views: T[], view: T | null): void {
  if (view !== null) views.push(view);
}

function toPlayerView(
  input: RenderFrameInput,
  player: PlayerState,
  position: Vec2,
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
        : toTelegraphView(casting, ability, player.aim, position, input.tick),
    activeArc:
      casting === null || ability === null ? null : toArcView(casting, ability, input.tick),
    isDashing: player.phase.kind === 'DASHING',
  };
}

function toTelegraphView(
  casting: CastingPhase,
  ability: AbilityDefinition,
  aim: Vec2,
  position: Vec2,
  tick: number,
): TelegraphView | null {
  const telegraph = ability.telegraph;
  if (telegraph === null) return null;
  const direction = normalize(aim);
  const distance = telegraph.anchor === 'aim' ? aimedDistance(ability, telegraph.size) : 0;
  return {
    kind: telegraph.kind,
    color: telegraph.color,
    size: telegraph.size,
    progress: progressOf(tick - casting.startedAt, casting.activatesAt - casting.startedAt),
    anchor: add(position, scale(direction, distance)),
    direction,
  };
}

function aimedDistance(ability: AbilityDefinition, size: number): number {
  const first = ability.effects[0];
  // Une zone visée frappe à sa portée: le télégraphe annonce ce point, pas le bout de la visée.
  if (first?.type === 'area' && first.origin === 'aim') return first.range;
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
  return { range: first.range, arcDegrees: first.arcDegrees };
}

function toProjectileView(projectile: ProjectileState, position: Vec2): ProjectileView {
  return {
    id: projectile.id,
    position,
    radius: projectile.radius,
    color: projectile.visual.color,
    trail: projectile.visual.trail,
  };
}

function toZoneView(pending: PendingEffect, tick: number): ZoneView | null {
  // Un déclencheur sans rayon ni visuel ne s'annonce pas: il n'y a rien à dessiner au sol.
  if (pending.radius === null || pending.visual === null) return null;
  return {
    id: pending.id,
    position: pending.position,
    radius: pending.radius,
    color: pending.visual.color,
    progress: progressOf(tick - pending.createdAt, pending.fireAt - pending.createdAt),
  };
}

function toObstacleView(obstacle: ObstacleState, tick: number): ObstacleView {
  return {
    id: obstacle.id,
    points: [...obstacle.shape.points],
    color: obstacle.visual.color,
    remaining: clamp01((obstacle.expiresAt - tick) / OBSTACLE_FADE_TICKS),
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
