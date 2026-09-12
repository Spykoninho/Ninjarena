import type { Vec2 } from '@ninjarena/core';
import { Container, Graphics, Text } from 'pixi.js';
import { drawPlayerGraphic } from './placeholderArt';

const PARTICLE_SIZE = 1.2;
const PARTICLE_LIFE_MS = 420;
const PARTICLE_LIFE_JITTER_MS = 180;
const PARTICLE_SPEED = 45;
const PARTICLE_SPEED_JITTER = 35;
const PARTICLE_DRAG = 0.88;
const MAX_PARTICLES = 240;

const RING_LIFE_MS = 260;
const RING_START_RATIO = 0.35;
const RING_END_RATIO = 1.45;

const AFTERIMAGE_LIFE_MS = 220;
const AFTERIMAGE_ALPHA = 0.45;
const AFTERIMAGE_RADIUS = 6;

const NUMBER_LIFE_MS = 700;
const NUMBER_RISE = 14;
const NUMBER_OFFSET = -10;

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
  node: Graphics;
  ageMs: number;
}

interface DamageNumber {
  node: Text;
  origin: Vec2;
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
  private readonly afterimagePool: Graphics[] = [];
  private readonly numberPool: Text[] = [];
  private seed = 0;

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
    const node = this.ringPool.pop() ?? new Graphics();
    node.position.set(position.x, position.y);
    this.container.addChild(node);
    this.rings.push({ node, color, size, ageMs: 0 });
  }

  afterimage(position: Vec2, color: number): void {
    const node = this.afterimagePool.pop() ?? new Graphics();
    node.clear();
    drawPlayerGraphic(node, color, AFTERIMAGE_RADIUS);
    node.position.set(position.x, position.y);
    node.alpha = AFTERIMAGE_ALPHA;
    this.container.addChild(node);
    this.afterimages.push({ node, ageMs: 0 });
  }

  damageNumber(position: Vec2, amount: number): void {
    const node = this.numberPool.pop() ?? newDamageText();
    node.text = String(Math.round(amount));
    node.alpha = 1;
    const origin = { x: position.x, y: position.y + NUMBER_OFFSET };
    node.position.set(origin.x, origin.y);
    this.container.addChild(node);
    this.numbers.push({ node, origin, ageMs: 0 });
  }

  advance(dtMs: number): void {
    const seconds = dtMs / 1000;
    this.advanceParticles(dtMs, seconds);
    this.advanceRings(dtMs);
    this.advanceAfterimages(dtMs);
    this.advanceNumbers(dtMs);
  }

  clear(): void {
    this.container.removeChildren();
    this.particles.length = 0;
    this.rings.length = 0;
    this.afterimages.length = 0;
    this.numbers.length = 0;
    this.particlePool.length = 0;
    this.ringPool.length = 0;
    this.afterimagePool.length = 0;
    this.numberPool.length = 0;
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
      ring.node.circle(0, 0, radius).stroke({ color: ring.color, width: 1, alpha: 1 - ratio });
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
      number.node.alpha = 1 - ratio * ratio;
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
      fontSize: 9,
      fontWeight: 'bold',
      fill: 0xfff2c4,
      stroke: { color: 0x101014, width: 3 },
    },
  });
  node.anchor.set(0.5, 1);
  return node;
}
