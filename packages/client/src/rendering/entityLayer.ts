import type { EntityId, PlayerId, TeamId, Vec2 } from '@ninjarena/core';
import { Container, Graphics } from 'pixi.js';
import { drawPlayerGraphic, drawVitals, teamColor } from './placeholderArt';
import type { ObstacleView, PlayerView, ProjectileView, RenderFrame, ZoneView } from './renderer';
import { drawMeleeArc, drawTelegraph, drawWall, drawZone } from './telegraphArt';

const PLAYER_RADIUS = 6;
const AIM_LENGTH = 16;
const AIM_COLOR = 0xf5f5f5;
const LOCAL_OUTLINE_COLOR = 0xffffff;
const VITALS_OFFSET = -PLAYER_RADIUS - 5;
const DEAD_ALPHA = 0.25;
const DASH_ALPHA = 0.7;
const TRAIL_LENGTH = 7;
const TRAIL_ALPHA = 0.35;
const MOVED_EPSILON = 1e-4;
const FLASH_MS = 60;
const FLASH_ALPHA = 0.85;
const FLASH_COLOR = 0xffffff;

interface PlayerNode {
  container: Container;
  aim: Graphics;
  arc: Graphics;
  vitals: Graphics;
  flash: Graphics;
  flashMs: number;
  color: number;
  healthRatio: number;
  shieldRatio: number;
  arcKey: string;
}

export interface PlayerSample {
  position: Vec2;
  color: number;
}

interface ProjectileNode {
  container: Container;
  trail: Graphics | null;
  previous: Vec2;
}

interface ObstacleNode {
  graphics: Graphics;
  remaining: number;
}

// Le layer possède les nœuds Pixi des entités: le renderer ne garde que l'application et la carte.
export class EntityLayer {
  readonly container = new Container();
  private readonly ground = new Container();
  private readonly entities = new Container();
  private readonly players = new Map<PlayerId, PlayerNode>();
  private readonly telegraphs = new Map<PlayerId, Graphics>();
  private readonly projectiles = new Map<EntityId, ProjectileNode>();
  private readonly zones = new Map<EntityId, Graphics>();
  private readonly obstacles = new Map<EntityId, ObstacleNode>();

  constructor() {
    // Télégraphes, zones et murs passent sous les entités: ils annoncent le sol.
    this.container.addChild(this.ground, this.entities);
  }

  sync(frame: RenderFrame): void {
    const localTeamId = frame.players.find((player) => player.isLocal)?.teamId ?? null;
    this.syncPlayers(frame.players, localTeamId, frame.isFfa);
    this.syncTelegraphs(frame.players);
    this.syncZones(frame.zones);
    this.syncObstacles(frame.obstacles);
    this.syncProjectiles(frame.projectiles);
  }

  // Le flash de coup s'éteint tout seul: la couche avance avec le temps réel du rendu.
  advance(dtMs: number): void {
    for (const node of this.players.values()) {
      if (node.flashMs <= 0) continue;
      node.flashMs = Math.max(0, node.flashMs - dtMs);
      node.flash.alpha = FLASH_ALPHA * (node.flashMs / FLASH_MS);
      if (node.flashMs === 0) node.flash.visible = false;
    }
  }

  flashPlayer(playerId: PlayerId, color: number = FLASH_COLOR): void {
    const node = this.players.get(playerId);
    if (node === undefined) return;
    node.flash.tint = color;
    node.flash.alpha = FLASH_ALPHA;
    node.flash.visible = true;
    node.flashMs = FLASH_MS;
  }

  playerSample(playerId: PlayerId): PlayerSample | null {
    const node = this.players.get(playerId);
    if (node === undefined) return null;
    return {
      position: { x: node.container.position.x, y: node.container.position.y },
      color: node.color,
    };
  }

  clear(): void {
    this.players.clear();
    this.telegraphs.clear();
    this.projectiles.clear();
    this.zones.clear();
    this.obstacles.clear();
  }

  private syncPlayers(
    views: readonly PlayerView[],
    localTeamId: TeamId | null,
    isFfa: boolean,
  ): void {
    const seen = new Set<PlayerId>();
    for (const view of views) {
      seen.add(view.id);
      const node = this.players.get(view.id) ?? this.createPlayerNode(view, localTeamId, isFfa);
      node.container.position.set(view.position.x, view.position.y);
      node.container.visible = view.visible;
      node.container.alpha = alphaOf(view);
      node.aim.rotation = Math.atan2(view.aim.y, view.aim.x);
      node.arc.rotation = node.aim.rotation;
      if (node.healthRatio !== view.healthRatio || node.shieldRatio !== view.shieldRatio) {
        node.healthRatio = view.healthRatio;
        node.shieldRatio = view.shieldRatio;
        drawVitals(node.vitals, view.healthRatio, view.shieldRatio);
      }
      this.syncArc(node, view);
    }
    removeMissing(this.players, seen, (node) => node.container);
  }

  private syncArc(node: PlayerNode, view: PlayerView): void {
    const arc = view.activeArc;
    node.arc.visible = arc !== null;
    if (arc === null) return;
    const key = `${arc.range}:${arc.arcDegrees}`;
    if (node.arcKey === key) return;
    node.arcKey = key;
    drawMeleeArc(node.arc, arc);
  }

  private syncTelegraphs(views: readonly PlayerView[]): void {
    const seen = new Set<PlayerId>();
    for (const view of views) {
      const telegraph = view.telegraph;
      if (telegraph === null || !view.visible) continue;
      seen.add(view.id);
      let graphics = this.telegraphs.get(view.id);
      if (graphics === undefined) {
        graphics = new Graphics();
        this.ground.addChild(graphics);
        this.telegraphs.set(view.id, graphics);
      }
      graphics.position.set(telegraph.anchor.x, telegraph.anchor.y);
      // Un télégraphe s'anime à chaque image: son tracé est refait à chaque fois.
      drawTelegraph(graphics, telegraph);
    }
    removeMissing(this.telegraphs, seen, (graphics) => graphics);
  }

  private syncZones(views: readonly ZoneView[]): void {
    const seen = new Set<EntityId>();
    for (const view of views) {
      seen.add(view.id);
      let graphics = this.zones.get(view.id);
      if (graphics === undefined) {
        graphics = new Graphics();
        this.ground.addChild(graphics);
        this.zones.set(view.id, graphics);
      }
      graphics.position.set(view.position.x, view.position.y);
      drawZone(graphics, view);
    }
    removeMissing(this.zones, seen, (graphics) => graphics);
  }

  private syncObstacles(views: readonly ObstacleView[]): void {
    const seen = new Set<EntityId>();
    for (const view of views) {
      seen.add(view.id);
      let node = this.obstacles.get(view.id);
      if (node === undefined) {
        const graphics = new Graphics();
        // Le polygone est figé: seule l'alpha du nœud suit la fin de vie du mur.
        drawWall(graphics, view);
        this.ground.addChild(graphics);
        node = { graphics, remaining: -1 };
        this.obstacles.set(view.id, node);
      }
      if (node.remaining !== view.remaining) {
        node.remaining = view.remaining;
        node.graphics.alpha = view.remaining;
      }
    }
    removeMissing(this.obstacles, seen, (node) => node.graphics);
  }

  private syncProjectiles(views: readonly ProjectileView[]): void {
    const seen = new Set<EntityId>();
    for (const view of views) {
      seen.add(view.id);
      const node = this.projectiles.get(view.id) ?? this.createProjectileNode(view);
      node.container.position.set(view.position.x, view.position.y);
      if (node.trail !== null) {
        const dx = view.position.x - node.previous.x;
        const dy = view.position.y - node.previous.y;
        // La traînée pointe à l'opposé du déplacement: un tir immobile garde son orientation.
        if (Math.abs(dx) > MOVED_EPSILON || Math.abs(dy) > MOVED_EPSILON) {
          node.trail.rotation = Math.atan2(dy, dx);
        }
      }
      node.previous = { x: view.position.x, y: view.position.y };
    }
    removeMissing(this.projectiles, seen, (node) => node.container);
  }

  private createPlayerNode(
    view: PlayerView,
    localTeamId: TeamId | null,
    isFfa: boolean,
  ): PlayerNode {
    const container = new Container();
    const color = teamColor(view.teamId, localTeamId, isFfa);
    const body = new Graphics();
    drawPlayerGraphic(body, color, PLAYER_RADIUS);
    if (view.isLocal) {
      const outline = PLAYER_RADIUS + 2;
      body
        .rect(-outline, -outline, outline * 2, outline * 2)
        .stroke({ color: LOCAL_OUTLINE_COLOR, width: 1, alignment: 1 });
    }
    const aim = new Graphics();
    aim.moveTo(PLAYER_RADIUS, 0).lineTo(AIM_LENGTH, 0).stroke({ color: AIM_COLOR, width: 1 });
    const arc = new Graphics();
    arc.visible = false;
    const vitals = new Graphics();
    vitals.position.set(0, VITALS_OFFSET);
    drawVitals(vitals, view.healthRatio, view.shieldRatio);
    const flash = new Graphics();
    flash
      .rect(-PLAYER_RADIUS, -PLAYER_RADIUS, PLAYER_RADIUS * 2, PLAYER_RADIUS * 2)
      .fill(FLASH_COLOR);
    flash.visible = false;
    container.addChild(arc, aim, body, flash, vitals);
    this.entities.addChild(container);
    const node: PlayerNode = {
      container,
      aim,
      arc,
      vitals,
      flash,
      flashMs: 0,
      color,
      healthRatio: view.healthRatio,
      shieldRatio: view.shieldRatio,
      arcKey: '',
    };
    this.players.set(view.id, node);
    return node;
  }

  private createProjectileNode(view: ProjectileView): ProjectileNode {
    const container = new Container();
    const body = new Graphics();
    body.circle(0, 0, view.radius).fill(view.color);
    let trail: Graphics | null = null;
    if (view.trail) {
      trail = new Graphics();
      trail
        .moveTo(-view.radius, 0)
        .lineTo(-view.radius - TRAIL_LENGTH, 0)
        .stroke({ color: view.color, width: view.radius, alpha: TRAIL_ALPHA });
      container.addChild(trail);
    }
    container.addChild(body);
    this.entities.addChild(container);
    const node: ProjectileNode = { container, trail, previous: { ...view.position } };
    this.projectiles.set(view.id, node);
    return node;
  }
}

function alphaOf(view: PlayerView): number {
  if (view.phase === 'DEAD') return DEAD_ALPHA;
  return view.isDashing ? DASH_ALPHA : 1;
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
