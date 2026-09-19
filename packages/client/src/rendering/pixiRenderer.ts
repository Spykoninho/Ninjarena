import type { LoadedMap, PlayerId, TilesetDefinition, Vec2 } from '@ninjarena/core';
import { Application, Container, RenderTexture, Sprite, TextureStyle } from 'pixi.js';
import type { VisualCue } from '../feedback/cues';
import { cameraTranslation } from './cameraTranslation';
import { visualSettings } from './visualSettings';
import { MapArt } from './mapArt';
import { SpriteArt } from './art/spriteArt';
import { ART_SCALE, VIEW_WIDTH, VIEW_HEIGHT, viewport } from './art/presentation';
import { EffectsLayer } from './effectsLayer';
import { EntityLayer } from './entityLayer';
import type { RenderFrame, Renderer } from './renderer';

const BACKGROUND_COLOR = '#101014';
const DASH_TRAIL_INTERVAL_MS = 65;

export class PixiRenderer implements Renderer {
  private readonly zoom: number;
  private readonly worldContainer = new Container();
  private readonly art = new SpriteArt();
  private readonly entityLayer = new EntityLayer(this.art);
  private readonly effectsLayer = new EffectsLayer();
  private app: Application | null = null;
  private mapLayer: MapArt | null = null;
  private target: RenderTexture | null = null;
  private screen: Sprite | null = null;
  private screenScale = 1;
  private viewportKey = '';
  private host: HTMLElement | null = null;
  private elapsed = 0;
  private mapBounds = { x: 320, y: 180 };
  private shake: Vec2 = { x: 0, y: 0 };
  private translation: Vec2 = { x: 0, y: 0 };
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
    this.host = container.parentElement;
    this.worldContainer.scale.set(ART_SCALE);
    this.entityLayer.onMelee = (position, angle, arc, color) =>
      this.effectsLayer.slash(position, angle, arc.range, arc.arcDegrees, hexOf(color));
    this.worldContainer.addChild(this.entityLayer.container, this.effectsLayer.container);
    this.target = RenderTexture.create({ width: VIEW_WIDTH, height: VIEW_HEIGHT, resolution: 1 });
    this.screen = new Sprite(this.target);
    app.stage.addChild(this.screen);
    this.app = app;
  }

  setMap(map: LoadedMap, tileset: TilesetDefinition): void {
    this.mapBounds = { x: map.widthInUnits, y: map.heightInUnits };
    this.mapLayer?.dispose();
    this.entityLayer.clear();
    this.effectsLayer.clear();
    this.elapsed = 0;
    const layer = new MapArt(map, tileset, this.art);
    layer.attachDepth(this.entityLayer.depth);
    this.worldContainer.addChildAt(layer.ground, 0);
    this.mapLayer = layer;
  }

  render(frame: RenderFrame, elapsedMs: number): void {
    const app = this.app;
    if (app === null) return;
    if (!this.screen || !this.target) return;
    const fit = viewport(app.screen.width, app.screen.height, this.zoom);
    this.screenScale = fit.zoom;
    const key = `${app.screen.width}:${app.screen.height}:${fit.zoom}`;
    if (key !== this.viewportKey) {
      this.viewportKey = key;
      // La vue couvre toute la fenêtre: une nouvelle cible à sa taille, le sprite écran la reprend.
      this.target.destroy(true);
      this.target = RenderTexture.create({ width: fit.width, height: fit.height, resolution: 1 });
      this.screen.texture = this.target;
      const style = this.host?.style;
      style?.setProperty('--combat-top', `${Math.max(0, fit.y)}px`);
      style?.setProperty(
        '--combat-bottom',
        `${Math.max(0, app.screen.height - fit.y - fit.height * fit.zoom)}px`,
      );
      style?.setProperty('--combat-side', `${Math.max(0, fit.x)}px`);
    }
    this.screen.position.set(fit.x, fit.y);
    this.screen.scale.set(fit.zoom);
    // Demi-vue en unités monde: la caméra s'arrête au bord de la map, ou se centre si elle est plus petite.
    const halfWidth = fit.width / ART_SCALE / 2,
      halfHeight = fit.height / ART_SCALE / 2;
    const center = {
      x: Math.max(
        Math.min(halfWidth, this.mapBounds.x / 2),
        Math.min(this.mapBounds.x - halfWidth, frame.camera.x),
      ),
      y: Math.max(
        Math.min(halfHeight, this.mapBounds.y / 2),
        Math.min(this.mapBounds.y - halfHeight, frame.camera.y),
      ),
    };
    const camera = cameraTranslation(center, ART_SCALE, { x: fit.width, y: fit.height });
    this.translation = { x: fit.x + camera.x * fit.zoom, y: fit.y + camera.y * fit.zoom };
    this.worldContainer.position.set(
      camera.x + Math.round(this.shake.x * ART_SCALE),
      camera.y + Math.round(this.shake.y * ART_SCALE),
    );
    this.elapsed += elapsedMs;
    this.mapLayer?.advance(visualSettings().motion ? this.elapsed : 0, frame.players);
    this.entityLayer.sync(frame);
    this.entityLayer.advance(elapsedMs);
    this.effectsLayer.advance(elapsedMs);
    this.trailDashers(frame, elapsedMs);
    app.renderer.render({ container: this.worldContainer, target: this.target, clear: true });
  }

  showCue(cue: VisualCue): void {
    switch (cue.kind) {
      case 'portal':
        return this.effectsLayer.portal(cue.position, cue.arriving);
      case 'hitFlash':
        if (!visualSettings().flashes) return;
        return this.entityLayer.flashPlayer(cue.playerId);
      case 'castFlash':
        if (!visualSettings().flashes) return;
        return this.entityLayer.flashPlayer(cue.playerId, colorValue(cue.color));
      case 'dashTrail':
        return this.afterimage(cue.playerId);
      case 'impact':
        return this.effectsLayer.impact(cue.position, cue.color, cue.size);
      case 'burst':
        return this.effectsLayer.burst(cue.position, cue.color, cue.count);
      case 'damageNumber':
        return this.effectsLayer.damageNumber(cue.position, cue.amount, cue.tone);
      case 'playerImpact':
        return this.atPlayer(cue.playerId, (position) => {
          this.effectsLayer.impact(position, cue.color, cue.size);
        });
      case 'playerBurst':
        return this.atPlayer(cue.playerId, (position) => {
          this.effectsLayer.burst(position, cue.color, cue.count);
        });
      case 'playerDamageNumber':
        return this.atPlayer(cue.playerId, (position) => {
          this.effectsLayer.damageNumber(position, cue.amount, cue.tone);
        });
    }
  }

  setShake(offset: Vec2): void {
    this.shake = visualSettings().shake ? offset : { x: 0, y: 0 };
  }

  worldToScreen(position: Vec2): Vec2 {
    return {
      x: this.translation.x + position.x * ART_SCALE * this.screenScale,
      y: this.translation.y + position.y * ART_SCALE * this.screenScale,
    };
  }

  dispose(): void {
    for (const name of ['--combat-top', '--combat-bottom', '--combat-side'])
      this.host?.style.removeProperty(name);
    this.mapLayer?.dispose();
    this.entityLayer.dispose();
    this.effectsLayer.clear();
    this.worldContainer.destroy({ children: true });
    this.art.dispose();
    this.app?.destroy({ removeView: true }, { children: true });
    this.target?.destroy(true);
    this.target = null;
    this.screen = null;
    this.app = null;
    this.mapLayer = null;
  }

  private trailDashers(frame: RenderFrame, elapsedMs: number): void {
    this.dashTrailMs += elapsedMs;
    if (this.dashTrailMs < DASH_TRAIL_INTERVAL_MS) return;
    // Le reste est reporté: un intervalle remis à zéro étirerait la traînée quand l'image rame.
    this.dashTrailMs -= DASH_TRAIL_INTERVAL_MS;
    for (const player of frame.players) {
      if (player.isDashing && player.visible) this.afterimage(player.id);
    }
  }

  private afterimage(playerId: PlayerId): void {
    const sample = this.entityLayer.playerSample(playerId);
    if (sample !== null)
      this.effectsLayer.afterimage(sample.position, sample.color, sample.texture);
  }

  // Un effet ancré sur un joueur part du corps dessiné: le monde prédit est en avance sur lui.
  private atPlayer(playerId: PlayerId, draw: (position: Vec2) => void): void {
    const sample = this.entityLayer.playerSample(playerId);
    if (sample === null) return;
    draw(sample.position);
  }
}

function colorValue(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

function hexOf(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}
