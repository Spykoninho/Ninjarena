import type { Vec2 } from '@ninjarena/core';

const DECAY_MS = 250;
const ZERO: Vec2 = { x: 0, y: 0 };

// Le tremblement est reproductible: un compteur graine le bruit, aucun `Math.random` en jeu.
export class CameraShake {
  private peak = 0;
  private remainingMs = 0;
  private counter = 0;

  add(intensity: number): void {
    if (intensity <= this.amplitude()) return;
    this.peak = intensity;
    this.remainingMs = DECAY_MS;
  }

  advance(dtMs: number): Vec2 {
    if (this.remainingMs <= 0) return { ...ZERO };
    const amplitude = this.amplitude();
    this.remainingMs = Math.max(0, this.remainingMs - dtMs);
    this.counter += 1;
    if (this.remainingMs === 0) this.peak = 0;
    return {
      x: noise(this.counter * 2) * amplitude,
      y: noise(this.counter * 2 + 1) * amplitude,
    };
  }

  private amplitude(): number {
    return this.peak * (this.remainingMs / DECAY_MS);
  }
}

function noise(seed: number): number {
  let value = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  value = (value ^ (value >>> 13)) >>> 0;
  value = Math.imul(value, 0xc2b2ae35) >>> 0;
  return (((value ^ (value >>> 16)) >>> 0) / 0xffffffff) * 2 - 1;
}
