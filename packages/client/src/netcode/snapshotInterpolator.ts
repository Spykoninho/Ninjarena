import { lerp } from '@ninjarena/core';
import type {
  EntityId,
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
}

const DEFAULT_MAX_SNAPSHOTS = 32;

export class SnapshotInterpolator {
  private readonly snapshots: WorldState[] = [];
  private readonly maxSnapshots: number;

  constructor(maxSnapshots: number = DEFAULT_MAX_SNAPSHOTS) {
    this.maxSnapshots = Math.max(1, Math.floor(maxSnapshots));
  }

  push(world: WorldState): void {
    const newest = this.latest;
    // Un snapshot qui n'avance pas le tick est ignoré: le réseau peut livrer dans le désordre.
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
  };
}

function blendEntities<T extends { position: Vec2 }>(
  from: Record<string, T>,
  to: Record<string, T>,
  t: number,
): Record<string, T & { renderPosition: Vec2 }> {
  const blended: Record<string, T & { renderPosition: Vec2 }> = {};
  // Une entité absente du snapshot récent garde sa dernière position connue.
  for (const [id, state] of Object.entries(from)) {
    blended[id] = { ...state, renderPosition: { ...state.position } };
  }
  for (const [id, state] of Object.entries(to)) {
    const previous = from[id];
    const renderPosition =
      previous === undefined ? { ...state.position } : lerp(previous.position, state.position, t);
    blended[id] = { ...state, renderPosition };
  }
  return blended;
}
