import type { Vec2 } from '@ninjarena/core';
import type { Graphics } from 'pixi.js';
import { P } from './art/nativeArt';
import type {
  MeleeArcView,
  ObstacleView,
  ProjectileView,
  TelegraphView,
  ZoneView,
} from './renderer';

const PX = 0.5;
function perimeter(
  g: Graphics,
  r: number,
  color: string,
  progress: number,
  dangerous = true,
): void {
  // The radius is always final; progress occupies the perimeter, never an expanding hitbox.
  g.circle(0, 0, r).fill({ color, alpha: 0.08 }).stroke({ color: P.ink, width: 1 });
  g.circle(0, 0, r).stroke({
    color: dangerous ? P.danger : P.ivory,
    width: PX,
    alpha: dangerous ? 1 : 0.65,
  });
  const count = 16;
  for (let i = 0; i < count; i++) {
    const a = (i * Math.PI * 2) / count;
    if (i / count <= progress)
      g.moveTo(Math.cos(a) * (r - 1), Math.sin(a) * (r - 1))
        .lineTo(Math.cos(a) * (r - 2), Math.sin(a) * (r - 2))
        .stroke({ color, width: PX });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2,
      xx = Math.cos(a),
      yy = Math.sin(a);
    g.moveTo(xx * r - yy, yy * r + xx)
      .lineTo(xx * (r - 2), yy * (r - 2))
      .lineTo(xx * r + yy, yy * r - xx)
      .stroke({ color: dangerous ? P.danger : P.ivory, width: PX });
  }
}

export function drawTelegraph(g: Graphics, v: TelegraphView): void {
  g.clear();
  const family = v.family;
  if (family === 'defense') {
    g.poly([
      { x: -7, y: -11 },
      { x: 0, y: -15 },
      { x: 7, y: -11 },
      { x: 6, y: 0 },
      { x: 0, y: 4 },
      { x: -6, y: 0 },
    ]).stroke({ color: P.mint, width: PX });
    return;
  }
  if (family === 'teleport') {
    for (const dx of [-1, 1])
      for (const dy of [-1, 1])
        g.moveTo(dx * 7, dy * 7)
          .lineTo(dx * 7, dy * 4)
          .moveTo(dx * 7, dy * 7)
          .lineTo(dx * 4, dy * 7)
          .stroke({ color: P.violet, width: PX });
    return;
  }
  if (family === 'wall') {
    const w = v.size / 2,
      h = (v.width ?? 8) / 2,
      dx = v.direction.x,
      dy = v.direction.y;
    // Walls span perpendicular to the aim direction, exactly like the spawned collider.
    const pts = [
      [-w, -h],
      [w, -h],
      [w, h],
      [-w, h],
    ].map(([x = 0, y = 0]) => ({ x: -dy * x + dx * y, y: dx * x + dy * y }));
    g.poly(pts)
      .fill({ color: v.color, alpha: 0.1 })
      .stroke({ color: v.dangerous === false ? P.ivory : P.danger, width: PX });
    return;
  }
  if (family === 'dash' || v.kind === 'charge') {
    const d = v.direction,
      len = v.size,
      w = v.width ?? 5;
    const point = (x: number, y: number) => ({ x: d.x * x - d.y * y, y: d.y * x + d.x * y });
    g.poly([point(0, -w), point(len, -w), point(len + w, 0), point(len, w), point(0, w)]).stroke({
      color: v.dangerous === false ? P.ivory : P.danger,
      width: PX,
      alpha: 0.8,
    });
    for (let i = 1; i <= 3; i++) {
      const x = (len * i) / 4,
        a = point(x - 3, -3),
        b = point(x, 0),
        c = point(x - 3, 3);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).lineTo(c.x, c.y).stroke({ color: P.cyan, width: PX });
    }
    return;
  }
  if (
    v.kind === 'ground-circle' ||
    v.kind === 'ground-mark' ||
    family === 'area' ||
    family === 'trap'
  ) {
    perimeter(g, v.size, v.color, v.progress, v.dangerous ?? true);
    if (v.kind === 'ground-mark') {
      g.moveTo(-3, 0)
        .lineTo(-1, 0)
        .moveTo(1, 0)
        .lineTo(3, 0)
        .moveTo(0, -3)
        .lineTo(0, -1)
        .moveTo(0, 1)
        .lineTo(0, 3)
        .stroke({ color: v.color, width: PX });
    }
    return;
  }
  const radius = Math.min(4, 1 + v.progress * 3);
  g.circle(0, 0, radius + PX).fill(P.ink);
  g.circle(0, 0, radius).fill(v.color);
  g.rect(-0.5, -0.5, 1.5, 1).fill(P.ivory);
  const d = v.direction;
  g.moveTo(d.x * 6 - d.y * 2, d.y * 6 + d.x * 2)
    .lineTo(d.x * 8, d.y * 8)
    .lineTo(d.x * 6 + d.y * 2, d.y * 6 - d.x * 2)
    .stroke({ color: v.color, width: PX });
}

export function drawZone(g: Graphics, v: ZoneView): void {
  g.clear();
  perimeter(g, v.radius, v.color, v.progress, v.dangerous ?? true);
}
export function drawWall(g: Graphics, v: ObstacleView): void {
  g.clear();
  if (v.points.length < 3) return;
  const pts = v.points.map((p: Vec2) => ({ ...p }));
  g.poly(pts).fill(P.stone[0]).stroke({ color: P.ink, width: 1 });
  g.poly(pts).stroke({ color: P.stone[2], width: PX });
}
export function drawMeleeArc(g: Graphics, v: MeleeArcView): void {
  g.clear();
  const half = (v.arcDegrees * Math.PI) / 360;
  g.moveTo(0, 0).arc(0, 0, v.range, -half, half).lineTo(0, 0).fill({ color: P.ivory, alpha: 0.13 });
  g.arc(0, 0, v.range, -half, half).stroke({ color: P.ivory, width: PX });
}
export function drawProjectile(g: Graphics, v: ProjectileView, time: number): void {
  g.clear();
  const angle = Math.atan2(v.direction.y, v.direction.x),
    r = v.radius;
  // Quantized art direction preserves clusters; collision/trajectory still use the free angle.
  const a = Math.round(angle / (Math.PI / 8)) * (Math.PI / 8);
  const points = (list: number[][]) =>
    list.map(([x = 0, y = 0]) => ({
      x: Math.round((Math.cos(a) * x - Math.sin(a) * y) * 2) / 2,
      y: Math.round((Math.sin(a) * x + Math.cos(a) * y) * 2) / 2,
    }));
  if (v.family === 'control') {
    g.poly(
      points([
        [0, -r],
        [r, 0],
        [0, r],
        [-r, 0],
      ]),
    )
      .fill(P.ink)
      .stroke({ color: P.violet, width: PX });
    g.rect(-1, -1, 2, 2).fill(P.ivory);
    g.moveTo(-r - 2, -2)
      .lineTo(-r - 2, 2)
      .stroke({ color: P.violet, width: PX });
    return;
  }
  if (v.family === 'shuriken') {
    // Étoile à quatre branches qui tourne à quatre poses; le cercle de collision reste la vérité.
    const spin = (Math.floor(time / 45) % 4) * (Math.PI / 8);
    const star = (list: number[][]) =>
      list.map(([x = 0, y = 0]) => ({
        x: Math.round((Math.cos(spin) * x - Math.sin(spin) * y) * 2) / 2,
        y: Math.round((Math.sin(spin) * x + Math.cos(spin) * y) * 2) / 2,
      }));
    const tip = r + 1.5,
      waist = r * 0.35;
    g.poly(
      star([
        [0, -tip],
        [waist, -waist],
        [tip, 0],
        [waist, waist],
        [0, tip],
        [-waist, waist],
        [-tip, 0],
        [-waist, -waist],
      ]),
    )
      .fill(P.ink)
      .stroke({ color: P.edge, width: PX });
    g.poly(
      star([
        [0, -tip + 1],
        [waist * 0.6, -waist * 0.6],
        [tip - 1, 0],
        [waist * 0.6, waist * 0.6],
        [0, tip - 1],
        [-waist * 0.6, waist * 0.6],
        [-tip + 1, 0],
        [-waist * 0.6, -waist * 0.6],
      ]),
    ).fill(v.color);
    g.rect(-0.5, -0.5, 1, 1).fill(P.ivory);
    g.moveTo(-r - 1, 0)
      .lineTo(-r - 5, 0)
      .stroke({ color: P.ivory, width: PX, alpha: 0.5 });
    return;
  }
  if (v.trail) {
    // Ruban discontinu: trois segments qui s'éloignent et pâlissent, la tête garde la collision.
    const flicker = Math.floor(time / 70) % 2;
    for (let i = 0; i < 3; i++) {
      const start = r + 1 + i * 3 + flicker,
        width = r * (0.9 - i * 0.25);
      g.poly(
        points([
          [-start, -width],
          [-start - 2.5, 0],
          [-start, width],
          [-start + 1, 0],
        ]),
      ).fill({ color: i === 0 ? v.color : P.gold, alpha: 0.85 - i * 0.25 });
    }
    g.poly(
      points([
        [-r - 1, -r * 0.9],
        [-r * 0.2, -r],
        [r, 0],
        [-r * 0.2, r],
        [-r - 1, r * 0.9],
        [-r + 0.5, 0],
      ]),
    )
      .fill(v.color)
      .stroke({ color: P.ink, width: PX });
    g.circle(r * 0.15, 0, Math.max(0.5, r * 0.55)).fill(P.gold);
    g.rect(r * 0.2, -0.5, 1, 1).fill(P.ivory);
    return;
  }
  g.circle(0, 0, r).fill(P.ink);
  g.circle(0, 0, Math.max(0.5, r - 0.5)).fill(v.color);
  g.poly(
    points([
      [-r * 0.7, -r * 0.45],
      [r * 0.8, 0],
      [-r * 0.7, r * 0.45],
    ]),
  ).fill(P.ivory);
}
