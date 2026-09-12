import type {
  CombatPhaseKind,
  EntityId,
  LoadedMap,
  PlayerId,
  TeamId,
  TelegraphKind,
  TilesetDefinition,
  Vec2,
} from '@ninjarena/core';

export interface TelegraphView {
  kind: TelegraphKind;
  color: string;
  size: number;
  progress: number;
  anchor: Vec2;
  direction: Vec2;
}

export interface MeleeArcView {
  range: number;
  arcDegrees: number;
}

export interface PlayerView {
  id: PlayerId;
  teamId: TeamId;
  position: Vec2;
  aim: Vec2;
  phase: CombatPhaseKind;
  isLocal: boolean;
  visible: boolean;
  healthRatio: number;
  shieldRatio: number;
  telegraph: TelegraphView | null;
  activeArc: MeleeArcView | null;
  isDashing: boolean;
}

export interface ProjectileView {
  id: EntityId;
  position: Vec2;
  radius: number;
  color: string;
  trail: boolean;
}

export interface ZoneView {
  id: EntityId;
  position: Vec2;
  radius: number;
  color: string;
  progress: number;
}

export interface ObstacleView {
  id: EntityId;
  points: Vec2[];
  color: string;
  remaining: number;
}

export interface RenderFrame {
  camera: Vec2;
  players: PlayerView[];
  projectiles: ProjectileView[];
  zones: ZoneView[];
  obstacles: ObstacleView[];
  isFfa: boolean;
}

export interface Renderer {
  init(container: HTMLElement): Promise<void>;
  setMap(map: LoadedMap, tileset: TilesetDefinition): void;
  render(frame: RenderFrame): void;
  worldToScreen(position: Vec2): Vec2;
  dispose(): void;
}
