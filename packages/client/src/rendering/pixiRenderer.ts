import type {
  EntityId,
  LoadedMap,
  PlayerId,
  TeamId,
  TilesetDefinition,
  Vec2,
} from '@ninjarena/core';
import { Application, Container, Graphics, TextureStyle } from 'pixi.js';
import { drawPlayerGraphic, teamColor } from './placeholderArt';
import type { PlayerView, ProjectileView, RenderFrame, Renderer } from './renderer';

const BACKGROUND_COLOR = '#101014';
const EMPTY_TILE_ID = -1;
const PLAYER_RADIUS = 6;
const AIM_LENGTH = 16;
const AIM_COLOR = 0xf5f5f5;
const LOCAL_OUTLINE_COLOR = 0xffffff;
const PROJECTILE_COLOR = 0xf0e6c8;
const HEALTH_BAR_WIDTH = 16;
const HEALTH_BAR_HEIGHT = 2;
const HEALTH_BAR_BACKGROUND = 0x30303a;
const HEALTH_BAR_COLOR = 0x6bd46b;
const DEAD_ALPHA = 0.25;

interface PlayerNode {
  container: Container;
  aim: Graphics;
  health: Graphics;
  healthRatio: number;
}

export class PixiRenderer implements Renderer {
  private readonly zoom: number;
  private readonly worldContainer = new Container();
  private readonly entityLayer = new Container();
  private readonly playerNodes = new Map<PlayerId, PlayerNode>();
  private readonly projectileNodes = new Map<EntityId, Container>();
  private app: Application | null = null;
  private mapLayer: Container | null = null;

  constructor(options: { zoom: number }) {
    this.zoom = options.zoom;
  }

  async init(container: HTMLElement): Promise<void> {
    // Le filtrage doit être choisi avant la première texture: sinon les tuiles sortent floues.
    TextureStyle.defaultOptions.scaleMode = 'nearest';
    const app = new Application();
    await app.init({
      resizeTo: container,
      antialias: false,
      resolution: 1,
      roundPixels: true,
      background: BACKGROUND_COLOR,
    });
    container.appendChild(app.canvas);
    this.worldContainer.scale.set(this.zoom);
    this.worldContainer.addChild(this.entityLayer);
    app.stage.addChild(this.worldContainer);
    this.app = app;
  }

  setMap(map: LoadedMap, tileset: TilesetDefinition): void {
    const layer = new Container();
    layer.addChild(tileLayer(map, tileset, (tx, ty) => map.groundTileIdAt(tx, ty)));
    layer.addChild(tileLayer(map, tileset, (tx, ty) => map.objectTileIdAt(tx, ty)));
    this.mapLayer?.destroy({ children: true });
    this.worldContainer.addChildAt(layer, 0);
    this.mapLayer = layer;
  }

  render(frame: RenderFrame): void {
    const app = this.app;
    if (app === null) return;
    this.worldContainer.position.set(
      Math.round(app.screen.width / 2 - frame.camera.x * this.zoom),
      Math.round(app.screen.height / 2 - frame.camera.y * this.zoom),
    );
    const localTeamId = frame.players.find((player) => player.isLocal)?.teamId ?? null;
    this.syncPlayers(frame.players, localTeamId);
    this.syncProjectiles(frame.projectiles);
  }

  worldToScreen(position: Vec2): Vec2 {
    return {
      x: this.worldContainer.position.x + position.x * this.zoom,
      y: this.worldContainer.position.y + position.y * this.zoom,
    };
  }

  dispose(): void {
    this.playerNodes.clear();
    this.projectileNodes.clear();
    this.app?.destroy({ removeView: true }, { children: true });
    this.app = null;
    this.mapLayer = null;
  }

  private syncPlayers(views: readonly PlayerView[], localTeamId: TeamId | null): void {
    const seen = new Set<PlayerId>();
    for (const view of views) {
      seen.add(view.id);
      const node = this.playerNodes.get(view.id) ?? this.createPlayerNode(view, localTeamId);
      node.container.position.set(view.position.x, view.position.y);
      node.container.visible = view.visible;
      node.container.alpha = view.phase === 'DEAD' ? DEAD_ALPHA : 1;
      node.aim.rotation = Math.atan2(view.aim.y, view.aim.x);
      if (node.healthRatio !== view.healthRatio) {
        node.healthRatio = view.healthRatio;
        drawHealthBar(node.health, view.healthRatio);
      }
    }
    removeMissing(this.playerNodes, seen, (node) => node.container);
  }

  private syncProjectiles(views: readonly ProjectileView[]): void {
    const seen = new Set<EntityId>();
    for (const view of views) {
      seen.add(view.id);
      let node = this.projectileNodes.get(view.id);
      if (node === undefined) {
        node = new Container();
        const body = new Graphics();
        body.circle(0, 0, view.radius).fill(PROJECTILE_COLOR);
        node.addChild(body);
        this.entityLayer.addChild(node);
        this.projectileNodes.set(view.id, node);
      }
      node.position.set(view.position.x, view.position.y);
    }
    removeMissing(this.projectileNodes, seen, (node) => node);
  }

  private createPlayerNode(view: PlayerView, localTeamId: TeamId | null): PlayerNode {
    const container = new Container();
    const body = new Graphics();
    drawPlayerGraphic(body, teamColor(view.teamId, localTeamId), PLAYER_RADIUS);
    if (view.isLocal) {
      const outline = PLAYER_RADIUS + 2;
      body
        .rect(-outline, -outline, outline * 2, outline * 2)
        .stroke({ color: LOCAL_OUTLINE_COLOR, width: 1, alignment: 1 });
    }
    const aim = new Graphics();
    aim.moveTo(PLAYER_RADIUS, 0).lineTo(AIM_LENGTH, 0).stroke({ color: AIM_COLOR, width: 1 });
    const health = new Graphics();
    health.position.set(0, -PLAYER_RADIUS - 5);
    drawHealthBar(health, view.healthRatio);
    container.addChild(aim, body, health);
    this.entityLayer.addChild(container);
    const node: PlayerNode = { container, aim, health, healthRatio: view.healthRatio };
    this.playerNodes.set(view.id, node);
    return node;
  }
}

function drawHealthBar(g: Graphics, ratio: number): void {
  const clamped = Math.max(0, Math.min(1, ratio));
  g.clear();
  g.rect(-HEALTH_BAR_WIDTH / 2, 0, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT).fill(HEALTH_BAR_BACKGROUND);
  if (clamped <= 0) return;
  g.rect(-HEALTH_BAR_WIDTH / 2, 0, HEALTH_BAR_WIDTH * clamped, HEALTH_BAR_HEIGHT).fill(
    HEALTH_BAR_COLOR,
  );
}

function removeMissing<T>(
  nodes: Map<string, T>,
  seen: ReadonlySet<string>,
  containerOf: (node: T) => Container,
): void {
  for (const [id, node] of nodes) {
    if (seen.has(id)) continue;
    containerOf(node).destroy({ children: true });
    nodes.delete(id);
  }
}

function tileLayer(
  map: LoadedMap,
  tileset: TilesetDefinition,
  tileIdAt: (tx: number, ty: number) => number,
): Graphics {
  const g = new Graphics();
  const size = map.tileSize;
  for (let ty = 0; ty < map.heightInTiles; ty++) {
    for (let tx = 0; tx < map.widthInTiles; tx++) {
      const id = tileIdAt(tx, ty);
      if (id === EMPTY_TILE_ID) continue;
      const tile = tileset.tiles[String(id)];
      if (tile === undefined) continue;
      g.rect(tx * size, ty * size, size, size).fill(tile.color);
    }
  }
  return g;
}
