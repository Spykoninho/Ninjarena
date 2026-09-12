import type { Vec2 } from '@ninjarena/core';
import type { Graphics } from 'pixi.js';
import type { MeleeArcView, ObstacleView, TelegraphView, ZoneView } from './renderer';

const OUTLINE_WIDTH = 1;
const CHARGE_WIDTH = 2;
const MIN_VISIBLE_RADIUS = 0.5;
const PULSES_PER_CAST = 3;
const ARC_COLOR = '#f5f5f5';
const WALL_BORDER_BRIGHTNESS = 0.5;

// Les télégraphes se dessinent autour de l'origine: le nœud est déjà posé sur leur ancre.
export function drawTelegraph(g: Graphics, view: TelegraphView): void {
  g.clear();
  switch (view.kind) {
    case 'orb':
      return drawOrb(g, view);
    case 'ring':
      return drawRing(g, view);
    case 'flash':
      return drawFlash(g, view);
    case 'ground-circle':
      return drawGroundCircle(g, view);
    case 'ground-mark':
      return drawGroundMark(g, view);
    case 'charge':
      return drawCharge(g, view);
  }
}

export function drawZone(g: Graphics, view: ZoneView): void {
  g.clear();
  g.circle(0, 0, view.radius).stroke({ color: view.color, width: OUTLINE_WIDTH, alpha: 0.8 });
  const filled = view.radius * view.progress;
  if (filled < MIN_VISIBLE_RADIUS) return;
  g.circle(0, 0, filled).fill({ color: view.color, alpha: 0.25 + 0.35 * view.progress });
}

// Le polygone est en coordonnées monde: le nœud reste à l'origine, seule son alpha suit l'usure.
export function drawWall(g: Graphics, view: ObstacleView): void {
  g.clear();
  if (view.points.length < 3) return;
  const points = view.points.map((point: Vec2) => ({ x: point.x, y: point.y }));
  g.poly(points).fill({ color: view.color, alpha: 0.95 });
  g.poly(points).stroke({
    color: darken(view.color, WALL_BORDER_BRIGHTNESS),
    width: OUTLINE_WIDTH,
    alignment: 1,
  });
}

export function drawMeleeArc(g: Graphics, view: MeleeArcView): void {
  g.clear();
  const half = (view.arcDegrees * Math.PI) / 360;
  g.moveTo(0, 0)
    .arc(0, 0, view.range, -half, half)
    .lineTo(0, 0)
    .fill({ color: ARC_COLOR, alpha: 0.28 });
}

function drawOrb(g: Graphics, view: TelegraphView): void {
  const radius = view.size * view.progress;
  g.circle(0, 0, view.size).stroke({ color: view.color, width: OUTLINE_WIDTH, alpha: 0.35 });
  if (radius < MIN_VISIBLE_RADIUS) return;
  g.circle(0, 0, radius).fill({ color: view.color, alpha: 0.85 });
}

function drawRing(g: Graphics, view: TelegraphView): void {
  const radius = Math.max(MIN_VISIBLE_RADIUS, view.size * view.progress);
  g.circle(0, 0, radius).stroke({
    color: view.color,
    width: OUTLINE_WIDTH,
    alpha: 1 - 0.6 * view.progress,
  });
}

function drawFlash(g: Graphics, view: TelegraphView): void {
  g.circle(0, 0, view.size).fill({ color: view.color, alpha: 0.7 * (1 - view.progress) });
}

function drawGroundCircle(g: Graphics, view: TelegraphView): void {
  g.circle(0, 0, view.size).stroke({ color: view.color, width: OUTLINE_WIDTH, alpha: 0.9 });
  const filled = view.size * view.progress;
  if (filled < MIN_VISIBLE_RADIUS) return;
  g.circle(0, 0, filled).fill({ color: view.color, alpha: 0.3 + 0.3 * view.progress });
}

function drawGroundMark(g: Graphics, view: TelegraphView): void {
  const pulse = Math.abs(Math.sin(view.progress * Math.PI * PULSES_PER_CAST));
  g.circle(0, 0, view.size).stroke({
    color: view.color,
    width: OUTLINE_WIDTH,
    alpha: 0.3 + 0.6 * pulse,
  });
  g.circle(0, 0, view.size * 0.2).fill({ color: view.color, alpha: 0.4 + 0.4 * pulse });
}

function drawCharge(g: Graphics, view: TelegraphView): void {
  const length = view.size * view.progress;
  if (length < MIN_VISIBLE_RADIUS) return;
  const tip = { x: view.direction.x * length, y: view.direction.y * length };
  g.moveTo(0, 0)
    .lineTo(tip.x, tip.y)
    .stroke({ color: view.color, width: CHARGE_WIDTH, alpha: 0.9 });
  g.circle(tip.x, tip.y, CHARGE_WIDTH).fill({ color: view.color, alpha: 0.9 });
}

function darken(color: string, factor: number): string {
  const value = Number.parseInt(color.slice(1), 16);
  const red = Math.round(((value >> 16) & 0xff) * factor);
  const green = Math.round(((value >> 8) & 0xff) * factor);
  const blue = Math.round((value & 0xff) * factor);
  return `#${(((red << 16) | (green << 8) | blue) >>> 0).toString(16).padStart(6, '0')}`;
}
