import type { EntityId, PlayerId, Vec2 } from '@ninjarena/core';
import { ColorMatrixFilter, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { P, pen, surface, symbol, teams } from './art/nativeArt';
import type { Direction } from './art/nativeArt';
import { animationOf, facing, poseFrame, skinIndex, teamCodes } from './art/presentation';
import type { Animation } from './art/presentation';
import type { Prop, SpriteArt } from './art/spriteArt';
import type { MeleeArcView, PlayerView, ProjectileView, RenderFrame } from './renderer';
import { drawMeleeArc, drawTelegraph, drawWall, drawZone, drawProjectile } from './telegraphArt';

interface PlayerNode {
  flashFilter: ColorMatrixFilter;
  container: Container;
  labels: Container;
  body: Sprite;
  marker: Sprite;
  status: Graphics;
  vitals: Graphics;
  arc: Graphics;
  aim: Graphics;
  flashMs: number;
  flashColor: number;
  color: number;
  view: PlayerView;
  direction: Direction;
  animation: Animation;
  age: number;
  distance: number;
  moving: boolean;
  releasedAt: number | null;
  prop: Prop;
  poseKey: string;
  teamKey: string;
}
export interface PlayerSample {
  position: Vec2;
  color: number;
  texture: Texture;
}
interface ProjectileNode {
  container: Container;
  body: Graphics;
}

export class EntityLayer {
  readonly container = new Container();
  readonly depth = new Container();
  private readonly ground = new Container();
  private readonly labels = new Container();
  private readonly players = new Map<PlayerId, PlayerNode>();
  private readonly telegraphs = new Map<PlayerId, Graphics>();
  private readonly zones = new Map<EntityId, Graphics>();
  private readonly obstacles = new Map<EntityId, Graphics>();
  private readonly projectiles = new Map<EntityId, ProjectileNode>();
  private readonly markerTextures = new Map<string, Texture>();
  private time = 0;
  // Le croissant de coupe part de la couche des effets, au moment où l'éventail devient actif.
  onMelee: ((position: Vec2, angle: number, arc: MeleeArcView, color: number) => void) | null =
    null;

  constructor(private readonly art: SpriteArt) {
    this.depth.sortableChildren = true;
    this.container.addChild(this.ground, this.depth, this.labels);
  }

  sync(frame: RenderFrame): void {
    const codes = teamCodes(frame.players.map((p) => p.teamId));
    const seen = new Set<string>();
    for (const view of frame.players) {
      seen.add(view.id);
      const node = this.players.get(view.id) ?? this.createPlayer(view);
      const distance = Math.hypot(
        view.position.x - node.view.position.x,
        view.position.y - node.view.position.y,
      );
      node.moving = view.velocity
        ? Math.hypot(view.velocity.x, view.velocity.y) > 0.1
        : distance > 0.01;
      if (distance < 20) node.distance += distance;
      node.direction = facing(view.aim, node.direction);
      const next = animationOf(view.phase, node.moving, view.basicCast ?? false, node.flashMs > 0);
      // Un nouveau cast enchaîné garde la même animation: son relâchement retombé la relance.
      const restarted = view.castReleased === false && node.view.castReleased === true;
      if (node.animation !== next || restarted) {
        node.animation = next;
        node.age = 0;
        node.releasedAt = null;
      }
      if (view.castReleased && node.releasedAt === null) node.releasedAt = node.age;
      node.prop =
        view.castFamily === 'projectile'
          ? 'shuriken'
          : view.castFamily === 'melee'
            ? 'kunai'
            : 'none';
      if (view.activeArc && !node.view.activeArc && view.visible)
        this.onMelee?.(
          { x: node.container.x, y: node.container.y },
          Math.atan2(view.aim.y, view.aim.x),
          view.activeArc,
          node.color,
        );
      node.view = view;
      node.container.position.set(
        Math.round(view.position.x * 2) / 2,
        Math.round(view.position.y * 2) / 2,
      );
      node.container.zIndex = view.position.y;
      node.labels.position.copyFrom(node.container.position);
      node.container.visible = view.visible;
      node.labels.visible = view.visible && view.phase !== 'DEAD';
      const code = codes.get(view.teamId) ?? 0,
        teamKey = `${code}:${view.isLocal}`;
      node.color = Number.parseInt((teams[code % teams.length] ?? P.ivory).slice(1), 16);
      if (node.teamKey !== teamKey) {
        node.marker.texture = this.markerTexture(code, view.isLocal);
        node.teamKey = teamKey;
      }
      node.aim.visible = view.isLocal && view.phase !== 'DEAD';
      node.aim.position.set(
        Math.round(view.aim.x * 15 * 2) / 2,
        Math.round(view.aim.y * 15 * 2) / 2,
      );
      // Barre encadrée, graduée au quart: la perte se lit en crans, pas en pente continue.
      node.vitals.clear().rect(-6, -18.5, 12, 2.5).fill(P.ink);
      node.vitals.rect(-5.5, -18, 11, 1.5).fill(P.ui);
      node.vitals.rect(-5.5, -18, Math.round(22 * view.healthRatio) / 2, 1).fill(P.danger);
      node.vitals.rect(-5.5, -17, Math.round(22 * view.healthRatio) / 2, 0.5).fill(0xb8483c);
      for (const tick of [-2.75, 0, 2.75])
        node.vitals.rect(tick - 0.25, -18, 0.5, 1.5).fill({ color: P.ink, alpha: 0.6 });
      if (view.shieldRatio > 0)
        node.vitals.rect(-5.5, -19.5, Math.round(22 * view.shieldRatio) / 2, 0.5).fill(P.mint);
      node.arc.visible = view.activeArc !== null;
      if (view.activeArc) {
        drawMeleeArc(node.arc, view.activeArc);
        node.arc.rotation = Math.atan2(view.aim.y, view.aim.x);
      }
      this.drawStatus(node);
      this.players.set(view.id, node);
    }
    for (const [id, node] of this.players)
      if (!seen.has(id)) {
        node.container.destroy({ children: true });
        node.labels.destroy({ children: true });
        this.players.delete(id);
      }
    const telegraphs = new Set<string>();
    for (const view of frame.players) {
      if (!view.visible || !view.telegraph) continue;
      telegraphs.add(view.id);
      const g = this.graphic(this.telegraphs, view.id, this.ground);
      g.position.set(view.telegraph.anchor.x, view.telegraph.anchor.y);
      drawTelegraph(g, view.telegraph);
    }
    this.removeGraphics(this.telegraphs, telegraphs);
    const zones = new Set<string>();
    for (const view of frame.zones) {
      zones.add(view.id);
      const g = this.graphic(this.zones, view.id, this.ground);
      g.position.set(view.position.x, view.position.y);
      drawZone(g, view);
    }
    this.removeGraphics(this.zones, zones);
    const obstacles = new Set<string>();
    for (const view of frame.obstacles) {
      obstacles.add(view.id);
      const g = this.graphic(this.obstacles, view.id, this.depth);
      drawWall(g, view);
      g.alpha = Math.max(0.3, view.remaining);
      g.zIndex = Math.max(...view.points.map((p) => p.y));
    }
    this.removeGraphics(this.obstacles, obstacles);
    this.syncProjectiles(frame.projectiles);
  }

  advance(dt: number): void {
    this.time += dt;
    for (const node of this.players.values()) {
      node.age += dt;
      node.flashMs = Math.max(0, node.flashMs - dt);
      const frame = poseFrame(
        node.animation,
        node.age,
        node.distance,
        node.releasedAt === null ? null : node.age - node.releasedAt,
      );
      const key = `${node.direction}:${node.animation}:${frame}:${node.prop}`;
      if (node.poseKey !== key) {
        node.body.texture = this.art.pose(
          node.direction,
          node.animation,
          frame,
          skinIndex(node.view.id),
          node.prop,
        );
        node.poseKey = key;
      }
      node.body.tint = node.flashMs > 0 ? node.flashColor : 0xffffff;
      node.body.filters = node.flashMs > 0 ? [node.flashFilter] : [];
      node.container.alpha = node.animation === 'death' ? Math.max(0.2, 1 - node.age / 1800) : 1;
    }
  }

  flashPlayer(id: PlayerId, color = 0xf5edcd): void {
    const node = this.players.get(id);
    if (node) {
      node.flashMs = 65;
      node.flashColor = color;
    }
  }
  playerSample(id: PlayerId): PlayerSample | null {
    const node = this.players.get(id);
    return !node || !node.view.visible
      ? null
      : {
          position: { x: node.container.x, y: node.container.y },
          color: node.color,
          texture: node.body.texture,
        };
  }

  clear(): void {
    for (const node of this.players.values()) {
      node.container.destroy({ children: true });
      node.labels.destroy({ children: true });
    }
    this.players.clear();
    for (const collection of [this.telegraphs, this.zones, this.obstacles]) {
      for (const g of collection.values()) g.destroy();
      collection.clear();
    }
    for (const node of this.projectiles.values()) node.container.destroy({ children: true });
    this.projectiles.clear();
  }
  dispose(): void {
    this.clear();
    for (const texture of this.markerTextures.values()) texture.destroy(true);
    this.markerTextures.clear();
  }

  private drawStatus(node: PlayerNode): void {
    const v = node.view,
      g = node.status;
    g.clear();
    if (v.shieldRatio > 0 || v.invulnerable) {
      const points = [
        { x: -7, y: -13 },
        { x: 0, y: -16 },
        { x: 7, y: -13 },
        { x: 6, y: -3 },
        { x: 0, y: 1 },
        { x: -6, y: -3 },
      ];
      g.poly(points).fill({ color: P.mint, alpha: 0.08 }).stroke({ color: P.mint, width: 0.5 });
    }
    if (v.rooted || v.phase === 'STUNNED') {
      g.ellipse(0, 0, 6, 2).stroke({ color: P.violet, width: 0.5 });
      g.rect(-2, -23, 4, 3).fill(P.violet);
      g.rect(-1.5, -25, 3, 3).stroke({ color: P.violet, width: 0.5 });
      g.rect(0, -22, 0.5, 1).fill(P.ink);
      if (v.phase === 'STUNNED') g.rect(-3, -26, 6, 0.5).fill(P.ivory);
    }
    if (v.slowed)
      g.moveTo(-5, 0)
        .lineTo(-2, 2)
        .lineTo(0, 0)
        .lineTo(2, 2)
        .lineTo(5, 0)
        .stroke({ color: P.cyan, width: 0.5 });
  }

  private createPlayer(view: PlayerView): PlayerNode {
    const container = new Container(),
      labels = new Container();
    const shadow = new Graphics().ellipse(0, 0, 4.5, 1.5).fill({ color: P.ink, alpha: 0.3 });
    const body = new Sprite(this.art.pose('s', 'idle', 0, skinIndex(view.id)));
    body.anchor.set(0.5, 45 / 64);
    body.scale.set(0.5);
    const arc = new Graphics(),
      status = new Graphics(),
      vitals = new Graphics();
    const marker = new Sprite();
    marker.anchor.set(0.5, 40 / 48);
    marker.scale.set(0.5);
    // Réticule 7 x 7 à centre vide: quatre traits ivoire sur un sous-contour d'encre.
    const aim = new Graphics();
    for (const [x, y, w, h] of [
      [-2, -0.25, 1.5, 0.5],
      [0.5, -0.25, 1.5, 0.5],
      [-0.25, -2, 0.5, 1.5],
      [-0.25, 0.5, 0.5, 1.5],
    ] as const) {
      aim.rect(x - 0.5, y - 0.5, w + 1, h + 1).fill({ color: P.ink, alpha: 0.7 });
      aim.rect(x, y, w, h).fill(P.ivory);
    }
    container.addChild(shadow, arc, body, status);
    labels.addChild(marker, vitals, aim);
    this.depth.addChild(container);
    this.labels.addChild(labels);
    const flashFilter = new ColorMatrixFilter();
    flashFilter.brightness(2, false);
    return {
      flashFilter,
      container,
      labels,
      body,
      marker,
      status,
      vitals,
      arc,
      aim,
      flashMs: 0,
      flashColor: 0xf5edcd,
      color: 0xffffff,
      view,
      direction: 's',
      animation: 'idle',
      age: 0,
      distance: 0,
      moving: false,
      releasedAt: null,
      prop: 'none',
      poseKey: '',
      teamKey: '',
    };
  }

  private markerTexture(code: number, local: boolean): Texture {
    const key = `${code}:${local}`;
    let texture = this.markerTextures.get(key);
    if (texture) return texture;
    const canvas = surface(32, 48),
      c = pen(canvas),
      color = teams[code % teams.length] ?? P.ivory;
    c.fillStyle = P.ink;
    c.fillRect(12, 42, 9, 6);
    symbol(c, code, 14, 43, color);
    c.fillStyle = color;
    c.fillRect(5, 39, 1, 3);
    c.fillRect(26, 39, 1, 3);
    c.fillRect(6, 42, 3, 1);
    c.fillRect(23, 42, 3, 1);
    // More than eight teams remain distinguishable via extra binary ticks.
    for (let bit = 0; bit < 4; bit++)
      if (Math.floor(code / 8) & (1 << bit)) c.fillRect(10 + bit * 3, 40, 2, 1);
    if (local) {
      c.fillStyle = P.ivory;
      c.fillRect(13, 4, 2, 1);
      c.fillRect(15, 5, 2, 1);
      c.fillRect(17, 4, 2, 1);
    }
    texture = Texture.from(canvas);
    this.markerTextures.set(key, texture);
    return texture;
  }
  private syncProjectiles(views: readonly ProjectileView[]): void {
    const seen = new Set<string>();
    for (const view of views) {
      seen.add(view.id);
      let node = this.projectiles.get(view.id);
      if (!node) {
        const container = new Container(),
          body = new Graphics();
        container.addChild(body);
        this.depth.addChild(container);
        node = { container, body };
        this.projectiles.set(view.id, node);
      }
      node.container.position.set(
        Math.round(view.position.x * 2) / 2,
        Math.round(view.position.y * 2) / 2,
      );
      node.container.zIndex = view.position.y + 1;
      drawProjectile(node.body, view, this.time);
    }
    for (const [id, node] of this.projectiles)
      if (!seen.has(id)) {
        node.container.destroy({ children: true });
        this.projectiles.delete(id);
      }
  }
  private graphic(map: Map<string, Graphics>, id: string, parent: Container): Graphics {
    let g = map.get(id);
    if (!g) {
      g = new Graphics();
      parent.addChild(g);
      map.set(id, g);
    }
    return g;
  }
  private removeGraphics(map: Map<string, Graphics>, seen: Set<string>): void {
    for (const [id, g] of map)
      if (!seen.has(id)) {
        g.destroy();
        map.delete(id);
      }
  }
}
