export interface Vec2 {
  x: number;
  y: number;
}

export const EPSILON = 1e-6;

export function vec2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function lengthSq(v: Vec2): number {
  return v.x * v.x + v.y * v.y;
}

export function length(v: Vec2): number {
  return Math.sqrt(lengthSq(v));
}

export function distanceSq(a: Vec2, b: Vec2): number {
  return lengthSq(sub(a, b));
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.sqrt(distanceSq(a, b));
}

export function normalize(v: Vec2): Vec2 {
  const len = length(v);
  if (len < EPSILON) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function clampLength(v: Vec2, max: number): Vec2 {
  const len = length(v);
  if (len < EPSILON || len <= max) return { x: v.x, y: v.y };
  return scale(v, max / len);
}

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function rotate(v: Vec2, radians: number): Vec2 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

export function fromAngle(radians: number): Vec2 {
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

export function angleOf(v: Vec2): number {
  return Math.atan2(v.y, v.x);
}

export function angleBetween(a: Vec2, b: Vec2): number {
  // Chaque longueur est testée séparément: un opérande long masquerait un opérande dégénéré.
  const lengthA = length(a);
  const lengthB = length(b);
  if (lengthA < EPSILON || lengthB < EPSILON) return 0;
  const cosine = Math.min(1, Math.max(-1, dot(a, b) / (lengthA * lengthB)));
  return Math.acos(cosine);
}

export function isFiniteVec2(v: Vec2): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y);
}

export function isZero(v: Vec2): boolean {
  return length(v) < EPSILON;
}
