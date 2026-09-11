import type {
  CombatPhaseKind,
  EntityId,
  LoadedMap,
  PlayerId,
  TeamId,
  TilesetDefinition,
  Vec2,
} from '@ninjarena/core';

export interface PlayerView {
  id: PlayerId;
  teamId: TeamId;
  position: Vec2;
  aim: Vec2;
  phase: CombatPhaseKind;
  isLocal: boolean;
  visible: boolean;
  healthRatio: number;
}

export interface ProjectileView {
  id: EntityId;
  position: Vec2;
  radius: number;
}

export interface RenderFrame {
  camera: Vec2;
  players: PlayerView[];
  projectiles: ProjectileView[];
}

export interface Renderer {
  init(container: HTMLElement): Promise<void>;
  setMap(map: LoadedMap, tileset: TilesetDefinition): void;
  render(frame: RenderFrame): void;
  worldToScreen(position: Vec2): Vec2;
  dispose(): void;
}
