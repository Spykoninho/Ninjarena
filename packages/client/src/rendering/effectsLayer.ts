import type { Vec2 } from '@ninjarena/core';
import type { Texture } from 'pixi.js';
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { DamageTone } from '../feedback/cues';
import { P } from './art/nativeArt';

const PARTICLE_SIZE = 0.5;
const PARTICLE_LIFE_MS = 160;
const PARTICLE_LIFE_JITTER_MS = 80;
const PARTICLE_SPEED = 45;
const PARTICLE_SPEED_JITTER = 35;
const PARTICLE_DRAG = 0.88;
const MAX_PARTICLES = 64;

const RING_LIFE_MS = 160;
const RING_START_RATIO = 0.35;
const RING_END_RATIO = 1;

const AFTERIMAGE_LIFE_MS = 120;
const AFTERIMAGE_ALPHA = 0.45;

const NUMBER_LIFE_MS = 900;
const NUMBER_RISE = 16;
const NUMBER_OFFSET = -14;
const NUMBER_POP_MS = 120;
const NUMBER_POP_SCALE = 1.6;
const NUMBER_SPREAD = 6;
const NUMBER_COLORS: Record<DamageTone, number> = {
  dealt: 0xffd166,
  taken: 0xff7867,
  other: 0xf5edcd,
  heal: 0x92d8b4,
};

const COLUMN_LIFE_MS = 320;
const PUFF_LIFE_MS = 520;

const SLASH_LIFE_MS = 150;

interface Particle {
  node: Graphics;
  velocity: Vec2;
  ageMs: number;
  lifeMs: number;
}

interface Ring {
  node: Graphics;
  color: string;
  size: number;
  ageMs: number;
}

interface Afterimage {
  node: Sprite;
  ageMs: number;
}

interface DamageNumber {
  node: Text;
  origin: Vec2;
  ageMs: number;
}

interface Slash {
  node: Graphics;
  range: number;
  half: number;
  color: string;
  ageMs: number;
}

interface Column {
  node: Graphics;
  radius: number;
  color: string;
  ageMs: number;
}

interface Puff {
  node: Graphics;
  color: string;
  ageMs: number;
}

// La couche des effets vit au-dessus des entités et ne connaît que des positions monde.
export class EffectsLayer {
  readonly container = new Container();
  private readonly particles: Particle[] = [];
  private readonly rings: Ring[] = [];
  private readonly afterimages: Afterimage[] = [];
  private readonly numbers: DamageNumber[] = [];
  private readonly particlePool: Graphics[] = [];
  private readonly ringPool: Graphics[] = [];
  private readonly afterimagePool: Sprite[] = [];
  private readonly numberPool: Text[] = [];
  private seed = 0;
  private readonly portals: { node: Graphics; age: number; arriving: boolean }[] = [];
  private readonly slashes: Slash[] = [];
  private readonly columns: Column[] = [];
  private readonly puffs: Puff[] = [];

  // Colonne venue du ciel: elle tombe sur la marque puis s'efface, sans couvrir l'anticipation.
  column(position: Vec2, color: string, radius: number): void {
    if (this.columns.length >= 8) return;
    const node = new Graphics();
    node.position.set(position.x, position.y);
    this.container.addChild(node);
    this.columns.push({ node, radius, color, ageMs: 0 });
  }

  puff(position: Vec2, color: string): void {
    if (this.puffs.length >= 12) return;
    const node = new Graphics();
    node.position.set(position.x, position.y - 6);
    this.container.addChild(node);
    this.puffs.push({ node, color, ageMs: 0 });
  }

  // Croissant de coupe orienté sur la visée; l'éventail translucide reste la zone touchée.
  slash(position: Vec2, angle: number, range: number, arcDegrees: number, color: string): void {
    if (this.slashes.length >= 16) return;
    const node = new Graphics();
    node.position.set(position.x, position.y - 4);
    node.rotation = angle;
    this.container.addChild(node);
    this.slashes.push({ node, range, half: (arcDegrees * Math.PI) / 360, color, ageMs: 0 });
  }

  portal(position: Vec2, arriving: boolean): void {
    if (this.portals.length >= 16) return;
    const node = new Graphics();
    node.position.set(position.x, position.y - 7);
    this.container.addChild(node);
    this.portals.push({ node, age: 0, arriving });
  }

  burst(position: Vec2, color: string, count: number): void {
    for (let index = 0; index < count; index++) {
      if (this.particles.length >= MAX_PARTICLES) return;
      const angle = this.random() * Math.PI * 2;
      const speed = PARTICLE_SPEED + this.random() * PARTICLE_SPEED_JITTER;
      const node = this.particlePool.pop() ?? newParticle();
      node.tint = color;
      node.alpha = 1;
      node.visible = true;
      node.position.set(position.x, position.y);
      this.container.addChild(node);
      this.particles.push({
        node,
        velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        ageMs: 0,
        lifeMs: PARTICLE_LIFE_MS + this.random() * PARTICLE_LIFE_JITTER_MS,
      });
    }
  }

  impact(position: Vec2, color: string, size: number): void {
    if (this.rings.length >= 32) return;
    const node = this.ringPool.pop() ?? new Graphics();
    // Un anneau recyclé garde son tracé: il s'efface avant d'être remis en scène.
    node.clear();
    node.position.set(position.x, position.y);
    this.container.addChild(node);
    this.rings.push({ node, color, size, ageMs: 0 });
  }

  afterimage(position: Vec2, color: number, texture: Texture): void {
    if (this.afterimages.length >= 16) return;
    const node = this.afterimagePool.pop() ?? new Sprite();
    node.texture = texture;
    node.anchor.set(0.5, 45 / 64);
    node.scale.set(0.5);
    node.tint = color;
    node.position.set(position.x, position.y);
    node.alpha = AFTERIMAGE_ALPHA;
    this.container.addChild(node);
    this.afterimages.push({ node, ageMs: 0 });
  }

  // Le chiffre naît gros puis se pose: le coup se lit même au milieu d'une mêlée.
  damageNumber(position: Vec2, amount: number, tone: DamageTone): void {
    if (this.numbers.length >= 24) return;
    const node = this.numberPool.pop() ?? newDamageText();
    node.text = tone === 'heal' ? `+${damageLabel(amount)}` : damageLabel(amount);
    node.style.fill = NUMBER_COLORS[tone];
    node.alpha = 1;
    node.scale.set(NUMBER_POP_SCALE);
    // Deux coups au même endroit ne se recouvrent pas: chaque chiffre s'écarte un peu au hasard.
    const spread = (this.random() - 0.5) * 2 * NUMBER_SPREAD;
    const origin = { x: position.x + spread, y: position.y + NUMBER_OFFSET };
    node.position.set(origin.x, origin.y);
    this.container.addChild(node);
    this.numbers.push({ node, origin, ageMs: 0 });
  }

  advance(dtMs: number): void {
    const seconds = dtMs / 1000;
    for (let i = this.portals.length - 1; i >= 0; i--) {
      const p = this.portals[i];
      if (!p) continue;
      p.age += dtMs;
      if (p.age >= 260) {
        p.node.destroy();
        this.portals.splice(i, 1);
        continue;
      }
      const progress = p.age / 260,
        spread = p.arriving ? 1 - progress : progress;
      p.node.clear();
      for (const dx of [-1, 1]) {
        const x = dx * (3 + Math.floor(spread * 5));
        p.node
          .moveTo(x, -6)
          .lineTo(x, -3)
          .moveTo(x, 6)
          .lineTo(x, 3)
          .stroke({ color: P.violet, width: 0.5 });
      }
      for (let j = 0; j < 5; j++) {
        p.node
          .rect(((j % 3) - 1) * (1 + spread * 5), -9 + j * 3, 0.5, 2)
          .fill({ color: P.ivory, alpha: 1 - progress });
      }
    }
    this.advanceSlashes(dtMs);
    this.advanceColumns(dtMs);
    this.advancePuffs(dtMs);
    this.advanceParticles(dtMs, seconds);
    this.advanceRings(dtMs);
    this.advanceAfterimages(dtMs);
    this.advanceNumbers(dtMs);
  }

  clear(): void {
    for (const p of this.portals) p.node.destroy();
    this.portals.length = 0;
    for (const s of this.slashes) s.node.destroy();
    this.slashes.length = 0;
    for (const c of this.columns) c.node.destroy();
    this.columns.length = 0;
    for (const p of this.puffs) p.node.destroy();
    this.puffs.length = 0;
    this.container.removeChildren();
    destroyAll(this.particles, (particle) => particle.node, this.particlePool);
    destroyAll(this.rings, (ring) => ring.node, this.ringPool);
    destroyAll(this.afterimages, (image) => image.node, this.afterimagePool);
    destroyAll(this.numbers, (number) => number.node, this.numberPool);
  }

  private advanceSlashes(dtMs: number): void {
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      if (!s) continue;
      s.ageMs += dtMs;
      const p = s.ageMs / SLASH_LIFE_MS;
      if (p >= 1) {
        s.node.destroy();
        this.slashes.splice(i, 1);
        continue;
      }
      // Le bord avant balaie l'arc en premier, le bord arrière le rattrape et efface le croissant.
      const lead = -s.half + 2 * s.half * Math.min(1, p * 1.7),
        trail = -s.half + 2 * s.half * Math.max(0, (p - 0.4) * 1.7);
      const outer = s.range - 1,
        inner = Math.max(2, s.range - 4);
      s.node.clear();
      if (lead - trail > 0.05) {
        // Polygone explicite: deux arcs échantillonnés, arrondis au demi-pixel d'art.
        const points: Vec2[] = [];
        const steps = Math.max(3, Math.ceil(((lead - trail) * outer) / 1.5));
        for (let k = 0; k <= steps; k++) {
          const a = trail + ((lead - trail) * k) / steps;
          points.push({ x: half(Math.cos(a) * outer), y: half(Math.sin(a) * outer) });
        }
        for (let k = steps; k >= 0; k--) {
          const a = trail + ((lead - trail) * k) / steps;
          points.push({ x: half(Math.cos(a) * inner), y: half(Math.sin(a) * inner) });
        }
        s.node
          .poly(points)
          .fill({ color: P.ivory, alpha: 0.85 })
          .stroke({ color: s.color, width: 0.5, alpha: 0.9 });
      }
      for (let k = 0; k < 3; k++) {
        const a = lead - k * 0.12,
          r = outer + 1 + k;
        s.node
          .rect(Math.round(Math.cos(a) * r * 2) / 2, Math.round(Math.sin(a) * r * 2) / 2, 0.5, 0.5)
          .fill({ color: k ? s.color : P.ivory, alpha: 1 - p });
      }
    }
  }

  private advanceColumns(dtMs: number): void {
    for (let i = this.columns.length - 1; i >= 0; i--) {
      const c = this.columns[i];
      if (!c) continue;
      c.ageMs += dtMs;
      const p = c.ageMs / COLUMN_LIFE_MS;
      if (p >= 1) {
        c.node.destroy();
        this.columns.splice(i, 1);
        continue;
      }
      // Descente en un tiers du temps, puis la colonne se resserre et s'éteint.
      const drop = Math.min(1, p * 3),
        fade = p < 0.33 ? 1 : 1 - (p - 0.33) / 0.67;
      const height = 90,
        top = -height * drop,
        width = Math.max(1, c.radius * 0.6 * fade);
      c.node.clear();
      c.node
        .rect(-width, top, width * 2, height * drop)
        .fill({ color: c.color, alpha: 0.45 * fade });
      c.node
        .rect(-width * 0.35, top, width * 0.7, height * drop)
        .fill({ color: P.ivory, alpha: 0.9 * fade });
      c.node.ellipse(0, 0, c.radius * fade, c.radius * 0.4 * fade).fill({
        color: c.color,
        alpha: 0.3 * fade,
      });
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3 + p * 2;
        c.node
          .rect(Math.cos(a) * c.radius * 0.8 * p, Math.sin(a) * c.radius * 0.35 * p - 2, 1, 1)
          .fill({ color: P.gold, alpha: fade });
      }
    }
  }

  private advancePuffs(dtMs: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const puff = this.puffs[i];
      if (!puff) continue;
      puff.ageMs += dtMs;
      const p = puff.ageMs / PUFF_LIFE_MS;
      if (p >= 1) {
        puff.node.destroy();
        this.puffs.splice(i, 1);
        continue;
      }
      puff.node.clear();
      for (const [dx, dy, r] of [
        [-4, 1, 4],
        [4, -1, 4.5],
        [0, -5, 3.5],
      ] as const) {
        const spread = 1 + p * 1.5;
        puff.node
          .circle(dx * spread, dy * spread - p * 6, r + p * 3)
          .fill({ color: puff.color, alpha: 0.55 * (1 - p) });
        puff.node
          .circle(dx * spread - 1, dy * spread - p * 6 - 1, (r + p * 3) * 0.5)
          .fill({ color: P.ivory, alpha: 0.25 * (1 - p) });
      }
    }
  }

  private advanceParticles(dtMs: number, seconds: number): void {
    for (let index = this.particles.length - 1; index >= 0; index--) {
      const particle = this.particles[index];
      if (particle === undefined) continue;
      particle.ageMs += dtMs;
      const ratio = particle.ageMs / particle.lifeMs;
      if (ratio >= 1) {
        this.release(this.particles, index, particle.node, this.particlePool);
        continue;
      }
      const drag = Math.pow(PARTICLE_DRAG, dtMs / 16);
      particle.velocity.x *= drag;
      particle.velocity.y *= drag;
      particle.node.position.x += particle.velocity.x * seconds;
      particle.node.position.y += particle.velocity.y * seconds;
      particle.node.alpha = 1 - ratio;
    }
  }

  private advanceRings(dtMs: number): void {
    for (let index = this.rings.length - 1; index >= 0; index--) {
      const ring = this.rings[index];
      if (ring === undefined) continue;
      ring.ageMs += dtMs;
      const ratio = ring.ageMs / RING_LIFE_MS;
      if (ratio >= 1) {
        this.release(this.rings, index, ring.node, this.ringPool);
        continue;
      }
      const radius = ring.size * (RING_START_RATIO + (RING_END_RATIO - RING_START_RATIO) * ratio);
      ring.node.clear();
      if (ring.size > 12) {
        ring.node
          .circle(0, 0, ring.size)
          .stroke({ color: ring.color, width: 0.5, alpha: 1 - ratio });
      }
      const r = Math.min(radius, 10),
        points = [];
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4,
          length = i % 2 ? r * 0.32 : r;
        points.push({
          x: Math.round(Math.cos(angle) * length * 2) / 2,
          y: Math.round(Math.sin(angle) * length * 2) / 2,
        });
      }
      ring.node.poly(points).fill({ color: ring.color, alpha: 1 - ratio });
      ring.node.rect(-0.5, -1, 1, 2).fill({ color: P.ivory, alpha: 1 - ratio });
    }
  }

  private advanceAfterimages(dtMs: number): void {
    for (let index = this.afterimages.length - 1; index >= 0; index--) {
      const afterimage = this.afterimages[index];
      if (afterimage === undefined) continue;
      afterimage.ageMs += dtMs;
      const ratio = afterimage.ageMs / AFTERIMAGE_LIFE_MS;
      if (ratio >= 1) {
        this.release(this.afterimages, index, afterimage.node, this.afterimagePool);
        continue;
      }
      afterimage.node.alpha = AFTERIMAGE_ALPHA * (1 - ratio);
    }
  }

  private advanceNumbers(dtMs: number): void {
    for (let index = this.numbers.length - 1; index >= 0; index--) {
      const number = this.numbers[index];
      if (number === undefined) continue;
      number.ageMs += dtMs;
      const ratio = number.ageMs / NUMBER_LIFE_MS;
      if (ratio >= 1) {
        this.release(this.numbers, index, number.node, this.numberPool);
        continue;
      }
      number.node.position.y = number.origin.y - NUMBER_RISE * ratio;
      number.node.alpha = 1 - ratio * ratio * ratio;
      const pop = Math.min(1, number.ageMs / NUMBER_POP_MS);
      number.node.scale.set(NUMBER_POP_SCALE - (NUMBER_POP_SCALE - 1) * pop);
    }
  }

  private release<T, N extends Container>(live: T[], index: number, node: N, pool: N[]): void {
    this.container.removeChild(node);
    pool.push(node);
    live.splice(index, 1);
  }

  // Un bruit graine évite `Math.random` et garde la même gerbe d'une exécution à l'autre.
  private random(): number {
    this.seed = (this.seed + 1) >>> 0;
    let value = Math.imul(this.seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
    value = (value ^ (value >>> 13)) >>> 0;
    value = Math.imul(value, 0xc2b2ae35) >>> 0;
    return ((value ^ (value >>> 16)) >>> 0) / 0x100000000;
  }
}

// Les nœuds vivants et ceux du réservoir se détruisent ensemble: rien ne reste sur le GPU.
function destroyAll<T>(live: T[], nodeOf: (item: T) => Container, pool: Container[]): void {
  for (const item of live) nodeOf(item).destroy();
  for (const node of pool) node.destroy();
  live.length = 0;
  pool.length = 0;
}

function newParticle(): Graphics {
  const node = new Graphics();
  const half = PARTICLE_SIZE / 2;
  node.rect(-half, -half, PARTICLE_SIZE, PARTICLE_SIZE).fill(0xffffff);
  return node;
}

function newDamageText(): Text {
  const node = new Text({
    text: '',
    style: {
      fontFamily: 'monospace',
      fontSize: 8,
      fontWeight: 'bold',
      fill: 0xf5edcd,
      stroke: { color: 0x101014, width: 2 },
    },
  });
  node.anchor.set(0.5, 1);
  return node;
}

// Un coup sous 10 points garde sa décimale: `3.5` et `4` ne sont pas le même coup.
function damageLabel(amount: number): string {
  return amount < 10 ? String(Math.round(amount * 10) / 10) : String(Math.round(amount));
}

function half(value: number): number {
  return Math.round(value * 2) / 2;
}
