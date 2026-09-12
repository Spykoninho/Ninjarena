import { lerp } from '@ninjarena/core';
import type {
  EntityId,
  ObstacleState,
  PendingEffect,
  PlayerId,
  PlayerState,
  ProjectileState,
  Vec2,
  WorldState,
} from '@ninjarena/core';

export interface EntityView {
  position: Vec2;
}

export interface InterpolatedWorld {
  players: Record<PlayerId, PlayerState & { renderPosition: Vec2 }>;
  projectiles: Record<EntityId, ProjectileState & { renderPosition: Vec2 }>;
  pending: Record<EntityId, PendingEffect>;
  obstacles: Record<EntityId, ObstacleState>;
}

const DEFAULT_MAX_SNAPSHOTS = 32;

export class SnapshotInterpolator {
  private readonly snapshots: WorldState[] = [];
  private readonly maxSnapshots: number;

  constructor(maxSnapshots: number = DEFAULT_MAX_SNAPSHOTS) {
    this.maxSnapshots = Math.max(1, Math.floor(maxSnapshots));
  }

  // L'interpolateur s'approprie le snapshot reçu: l'appelant passe un état qu'il n'utilise plus (sim.snapshot()).
  push(world: WorldState): void {
    const newest = this.latest;
    // Un tick qui ne progresse pas est ignoré, doublon compris: le réseau peut livrer dans le désordre.
    if (newest !== null && world.tick <= newest.tick) return;
    this.snapshots.push(world);
    while (this.snapshots.length > this.maxSnapshots) this.snapshots.shift();
  }

  get latest(): WorldState | null {
    return this.snapshots[this.snapshots.length - 1] ?? null;
  }

  sample(renderTick: number): InterpolatedWorld | null {
    const oldest = this.snapshots[0];
    const newest = this.latest;
    if (oldest === undefined || newest === null) return null;
    if (renderTick <= oldest.tick) return blendWorlds(oldest, oldest, 0);
    if (renderTick >= newest.tick) return blendWorlds(newest, newest, 0);
    let from = oldest;
    for (const to of this.snapshots) {
      if (to.tick <= renderTick) {
        from = to;
        continue;
      }
      const span = to.tick - from.tick;
      return blendWorlds(from, to, span <= 0 ? 0 : (renderTick - from.tick) / span);
    }
    return blendWorlds(newest, newest, 0);
  }
}

function blendWorlds(from: WorldState, to: WorldState, t: number): InterpolatedWorld {
  return {
    players: blendEntities(from.players, to.players, t),
    projectiles: blendEntities(from.projectiles, to.projectiles, t),
    // Zones et murs ne bougent pas: seul l'état le plus récent compte, sans interpolation.
    pending: to.pending,
    obstacles: to.obstacles,
  };
}

function blendEntities<T extends { position: Vec2 }>(
  from: Record<string, T>,
  to: Record<string, T>,
  t: number,
): Record<string, T & { renderPosition: Vec2 }> {
  const blended: Record<string, T & { renderPosition: Vec2 }> = {};
  // L'état discret vient du snapshot ancien: il doit décrire l'instant rendu, pas un futur déjà reçu.
  for (const [id, state] of Object.entries(from)) {
    const next = to[id];
    const renderPosition =
      next === undefined ? { ...state.position } : lerp(state.position, next.position, t);
    blended[id] = { ...state, renderPosition };
  }
  // Une entité apparue seulement dans le snapshot récent est affichée depuis celui-ci.
  for (const [id, state] of Object.entries(to)) {
    if (from[id] === undefined) blended[id] = { ...state, renderPosition: { ...state.position } };
  }
  return blended;
}
