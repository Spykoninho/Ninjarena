import type { CombatPhaseKind, Vec2 } from '@ninjarena/core';
import type { Direction } from './nativeArt';

export const ART_SCALE = 2;
export const VIEW_WIDTH = 640;
export const VIEW_HEIGHT = 360;
export type Animation = 'idle' | 'walk' | 'dash' | 'attack' | 'cast' | 'hit' | 'death';

export function facing(aim: Vec2, previous: Direction): Direction {
  if (aim.x === 0 && aim.y === 0) return previous;
  const horizontal = Math.abs(aim.x),
    vertical = Math.abs(aim.y);
  // Retain a sector close to its diagonal boundary, avoiding rapid layer flips.
  if (Math.abs(horizontal - vertical) < 0.12) return previous;
  return horizontal > vertical ? (aim.x > 0 ? 'e' : 'w') : aim.y > 0 ? 's' : 'n';
}

export function animationOf(
  phase: CombatPhaseKind,
  moving: boolean,
  basic: boolean,
  hit: boolean,
): Animation {
  if (phase === 'DEAD') return 'death';
  if (phase === 'DASHING') return 'dash';
  if (phase === 'CASTING') return basic ? 'attack' : 'cast';
  if (phase === 'STUNNED' || phase === 'KNOCKBACK' || hit) return 'hit';
  return moving ? 'walk' : 'idle';
}

export function poseFrame(animation: Animation, ageMs: number, distance: number): number {
  switch (animation) {
    case 'walk':
      return Math.floor(distance / 3) % 6;
    case 'idle':
      return Math.floor(ageMs / 200) % 4;
    case 'dash':
      return Math.min(2, Math.floor(ageMs / 50));
    case 'attack':
      return Math.min(3, Math.floor(ageMs / 60));
    case 'cast':
      return ageMs < 160 ? Math.floor(ageMs / 80) : 2 + (Math.floor(ageMs / 130) % 2);
    case 'hit':
      return Math.min(1, Math.floor(ageMs / 60));
    case 'death':
      return Math.min(5, Math.floor(ageMs / 95));
  }
}

export function viewport(width: number, height: number, maxZoom: number) {
  const zoom = Math.max(
    1,
    Math.min(maxZoom, Math.floor(Math.min(width / VIEW_WIDTH, height / VIEW_HEIGHT))),
  );
  return {
    zoom,
    x: Math.floor((width - VIEW_WIDTH * zoom) / 2),
    y: Math.floor((height - VIEW_HEIGHT * zoom) / 2),
  };
}

export function teamCodes(ids: readonly string[]): Map<string, number> {
  return new Map([...new Set(ids)].sort().map((id, index) => [id, index]));
}

// Un identifiant donne toujours la même tenue, du sprite du monde au portrait du HUD.
export function skinIndex(id: string): number {
  let n = 0;
  for (const ch of id) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return n % 4;
}
