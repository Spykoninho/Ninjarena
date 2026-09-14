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
import type { VisualCue } from '../feedback/cues';

export interface TelegraphView {
  kind: TelegraphKind;
  color: string;
  size: number;
  progress: number;
  family?: string;
  dangerous?: boolean;
  width?: number;
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
  velocity?: Vec2;
  basicCast?: boolean;
  castFamily?: string;
  castReleased?: boolean;
  rooted?: boolean;
  slowed?: boolean;
  invulnerable?: boolean;
}

export interface ProjectileView {
  id: EntityId;
  position: Vec2;
  radius: number;
  color: string;
  trail: boolean;
  direction: Vec2;
  family?: string;
  dangerous?: boolean;
}

export interface ZoneView {
  dangerous?: boolean;
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
  render(frame: RenderFrame, elapsedMs: number): void;
  showCue(cue: VisualCue): void;
  setShake(offset: Vec2): void;
  worldToScreen(position: Vec2): Vec2;
  dispose(): void;
}
