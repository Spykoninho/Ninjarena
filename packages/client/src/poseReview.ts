// Planche de poses pour la revue artistique: chaque colonne rejoue une animation en boucle.
import type { PlayerView, ProjectileView } from './rendering/renderer';
import type { Animation } from './rendering/art/presentation';
import type { Direction } from './rendering/art/nativeArt';
import { poseCanvas } from './rendering/art/spriteArt';
import type { Prop } from './rendering/art/spriteArt';

type Column = 'kunai' | 'shuriken' | 'cast' | 'hit' | 'dash' | 'death';
const COLUMNS: Column[] = ['kunai', 'shuriken', 'cast', 'hit', 'dash', 'death'];
const DIRECTIONS = [
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: -1, y: 0 },
];
const CYCLE_MS = 1600;

function base(id: string, position: { x: number; y: number }, aim: { x: number; y: number }) {
  return {
    id,
    teamId: 'one',
    position,
    aim,
    phase: 'NORMAL' as const,
    isLocal: false,
    visible: true,
    healthRatio: 0.8,
    shieldRatio: 0,
    telegraph: null,
    activeArc: null,
    isDashing: false,
    velocity: { x: 0, y: 0 },
  };
}

export function showcasePlayers(origin: { x: number; y: number }, now: number): PlayerView[] {
  const t = now % CYCLE_MS;
  const players: PlayerView[] = [];
  COLUMNS.forEach((column, cx) => {
    DIRECTIONS.forEach((aim, cy) => {
      const position = { x: origin.x + cx * 28, y: origin.y + cy * 30 };
      const view = base(`pose-${column}-${cy}`, position, aim);
      switch (column) {
        case 'kunai':
        case 'shuriken': {
          const melee = column === 'kunai';
          // Chaque frappe dure 400 ms: 100 ms de préparation puis le coup et sa récupération.
          const local = t % 400;
          if (local < 320) {
            players.push({
              ...view,
              phase: 'CASTING',
              basicCast: true,
              castFamily: melee ? 'melee' : 'projectile',
              castReleased: local >= 100,
              activeArc:
                melee && local >= 100 && local < 180 ? { range: 22, arcDegrees: 100 } : null,
            });
          } else players.push(view);
          break;
        }
        case 'cast':
          players.push(
            t < 1200
              ? {
                  ...view,
                  phase: 'CASTING',
                  basicCast: false,
                  castFamily: 'projectile',
                  castReleased: t >= 900,
                }
              : view,
          );
          break;
        case 'hit':
          players.push(t % 800 < 140 ? { ...view, phase: 'KNOCKBACK' } : view);
          break;
        case 'dash':
          players.push(
            t % 800 < 220
              ? { ...view, phase: 'DASHING', isDashing: true, velocity: { x: aim.x, y: aim.y } }
              : view,
          );
          break;
        case 'death':
          players.push(t < 1300 ? { ...view, phase: 'DEAD' } : view);
          break;
      }
    });
  });
  return players;
}

export function showcaseProjectiles(
  origin: { x: number; y: number },
  now: number,
): ProjectileView[] {
  const p = (now % 900) / 900;
  return [
    {
      id: 'shuriken-demo',
      position: { x: origin.x + p * 120, y: origin.y },
      radius: 3,
      color: '#d8d8e0',
      trail: false,
      direction: { x: 1, y: 0 },
      family: 'shuriken',
    },
    {
      id: 'fireball-demo',
      position: { x: origin.x + p * 120, y: origin.y + 14 },
      radius: 4,
      color: '#ff6a3d',
      trail: true,
      direction: { x: 1, y: 0 },
    },
  ];
}

// Planche statique de toutes les poses: la vérité des textures, sans dépendre du temps.
export function drawPoseSheet(target: HTMLCanvasElement): void {
  const columns: { animation: Animation; frames: number; prop: Prop }[] = [
    { animation: 'idle', frames: 4, prop: 'none' },
    { animation: 'walk', frames: 6, prop: 'none' },
    { animation: 'attack', frames: 4, prop: 'kunai' },
    { animation: 'attack', frames: 4, prop: 'shuriken' },
    { animation: 'cast', frames: 5, prop: 'none' },
    { animation: 'hit', frames: 2, prop: 'none' },
    { animation: 'dash', frames: 3, prop: 'none' },
    { animation: 'death', frames: 6, prop: 'none' },
  ];
  const directions: Direction[] = ['s', 'e', 'n', 'w'];
  const total = columns.reduce((sum, column) => sum + column.frames, 0);
  target.width = total * 48;
  target.height = directions.length * 56;
  const ctx = target.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#5c6a55';
  ctx.fillRect(0, 0, target.width, target.height);
  directions.forEach((direction, row) => {
    let x = 0;
    for (const column of columns) {
      for (let frame = 0; frame < column.frames; frame++) {
        ctx.fillStyle = (x / 48) % 2 ? '#5f6d58' : '#59674f';
        ctx.fillRect(x, row * 56, 48, 56);
        ctx.setTransform(1, 0, 0, 1, x, 0);
        ctx.drawImage(
          poseCanvas(direction, column.animation, frame, row, column.prop),
          -8,
          row * 56 - 8,
        );
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        x += 48;
      }
    }
  });
}
