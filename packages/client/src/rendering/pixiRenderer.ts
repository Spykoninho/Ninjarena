import type { LoadedMap, PlayerId, TilesetDefinition, Vec2 } from '@ninjarena/core';
import { Application, Container, Graphics, TextureStyle } from 'pixi.js';
import type { VisualCue } from '../feedback/cues';
import { EffectsLayer } from './effectsLayer';
import { EntityLayer } from './entityLayer';
import type { RenderFrame, Renderer } from './renderer';

const BACKGROUND_COLOR = '#101014';
const EMPTY_TILE_ID = -1;
const MAX_EFFECT_STEP_MS = 100;
const DASH_TRAIL_INTERVAL_MS = 35;

export class PixiRenderer implements Renderer {
  private readonly zoom: number;
  private readonly worldContainer = new Container();
  private readonly entityLayer = new EntityLayer();
  private readonly effectsLayer = new EffectsLayer();
  private app: Application | null = null;
  private mapLayer: Container | null = null;
  private shake: Vec2 = { x: 0, y: 0 };
  private lastRenderMs: number | null = null;
  private dashTrailMs = 0;

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
    this.worldContainer.addChild(this.entityLayer.container, this.effectsLayer.container);
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
    // Les effets avancent avec le temps du rendu: un gel côté jeu les figent aussi.
    const elapsed = this.step();
    this.worldContainer.position.set(
      Math.round(app.screen.width / 2 - (frame.camera.x - this.shake.x) * this.zoom),
      Math.round(app.screen.height / 2 - (frame.camera.y - this.shake.y) * this.zoom),
    );
    this.entityLayer.sync(frame);
    this.entityLayer.advance(elapsed);
    this.effectsLayer.advance(elapsed);
    this.trailDashers(frame, elapsed);
  }

  showCue(cue: VisualCue): void {
    switch (cue.kind) {
      case 'hitFlash':
        return this.entityLayer.flashPlayer(cue.playerId);
      case 'castFlash':
        return this.entityLayer.flashPlayer(cue.playerId, colorValue(cue.color));
      case 'dashTrail':
        return this.afterimage(cue.playerId);
      case 'impact':
        return this.effectsLayer.impact(cue.position, cue.color, cue.size);
      case 'burst':
        return this.effectsLayer.burst(cue.position, cue.color, cue.count);
      case 'damageNumber':
        return this.effectsLayer.damageNumber(cue.position, cue.amount);
    }
  }

  setShake(offset: Vec2): void {
    this.shake = offset;
  }

  worldToScreen(position: Vec2): Vec2 {
    return {
      x: this.worldContainer.position.x + position.x * this.zoom,
      y: this.worldContainer.position.y + position.y * this.zoom,
    };
  }

  dispose(): void {
    this.entityLayer.clear();
    this.effectsLayer.clear();
    this.app?.destroy({ removeView: true }, { children: true });
    this.app = null;
    this.mapLayer = null;
    this.lastRenderMs = null;
  }

  private step(): number {
    const now = performance.now();
    const elapsed = Math.min(MAX_EFFECT_STEP_MS, now - (this.lastRenderMs ?? now));
    this.lastRenderMs = now;
    return elapsed;
  }

  private trailDashers(frame: RenderFrame, elapsed: number): void {
    this.dashTrailMs += elapsed;
    if (this.dashTrailMs < DASH_TRAIL_INTERVAL_MS) return;
    this.dashTrailMs = 0;
    for (const player of frame.players) {
      if (player.isDashing && player.visible) this.afterimage(player.id);
    }
  }

  private afterimage(playerId: PlayerId): void {
    const sample = this.entityLayer.playerSample(playerId);
    if (sample !== null) this.effectsLayer.afterimage(sample.position, sample.color);
  }
}

function colorValue(color: string): number {
  return Number.parseInt(color.slice(1), 16);
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
