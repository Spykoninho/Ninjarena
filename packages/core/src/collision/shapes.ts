import type { Vec2 } from '../math/vec2';
import { EPSILON, add, distanceSq, dot, length, lengthSq, scale, sub } from '../math/vec2';

export interface Rect {
  readonly type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Circle {
  readonly type: 'circle';
  x: number;
  y: number;
  radius: number;
}

export interface ConvexPolygon {
  readonly type: 'polygon';
  points: readonly Vec2[];
}

export type Shape = Rect | Circle | ConvexPolygon;

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function circleBounds(center: Vec2, radius: number): AABB {
  return {
    minX: center.x - radius,
    minY: center.y - radius,
    maxX: center.x + radius,
    maxY: center.y + radius,
  };
}

export function shapeBounds(shape: Shape): AABB {
  switch (shape.type) {
    case 'rect':
      return {
        minX: shape.x,
        minY: shape.y,
        maxX: shape.x + shape.width,
        maxY: shape.y + shape.height,
      };
    case 'circle':
      return circleBounds(shape, shape.radius);
    case 'polygon': {
      const bounds: AABB = {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      };
      for (const point of shape.points) {
        bounds.minX = Math.min(bounds.minX, point.x);
        bounds.minY = Math.min(bounds.minY, point.y);
        bounds.maxX = Math.max(bounds.maxX, point.x);
        bounds.maxY = Math.max(bounds.maxY, point.y);
      }
      return bounds;
    }
  }
}

export function aabbOverlaps(a: AABB, b: AABB): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function containsPoint(shape: Shape, point: Vec2): boolean {
  switch (shape.type) {
    case 'rect':
      return (
        point.x >= shape.x &&
        point.x <= shape.x + shape.width &&
        point.y >= shape.y &&
        point.y <= shape.y + shape.height
      );
    case 'circle':
      return distanceSq(point, shape) <= shape.radius * shape.radius;
    case 'polygon': {
      let positive = false;
      let negative = false;
      for (const [a, b] of edgesOf(shape.points)) {
        const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
        if (cross > 0) positive = true;
        else if (cross < 0) negative = true;
        if (positive && negative) return false;
      }
      return true;
    }
  }
}

export function closestPointOnSegment(a: Vec2, b: Vec2, point: Vec2): Vec2 {
  const ab = sub(b, a);
  const lengthSquared = lengthSq(ab);
  if (lengthSquared < EPSILON) return { x: a.x, y: a.y };
  const t = Math.min(1, Math.max(0, dot(sub(point, a), ab) / lengthSquared));
  return add(a, scale(ab, t));
}

export function closestPointOnBoundary(shape: Shape, point: Vec2): Vec2 {
  switch (shape.type) {
    case 'rect': {
      const maxX = shape.x + shape.width;
      const maxY = shape.y + shape.height;
      if (!containsPoint(shape, point)) {
        return {
          x: Math.min(maxX, Math.max(shape.x, point.x)),
          y: Math.min(maxY, Math.max(shape.y, point.y)),
        };
      }
      const side = nearestRectSide(shape, point);
      if (side === 'left') return { x: shape.x, y: point.y };
      if (side === 'right') return { x: maxX, y: point.y };
      if (side === 'top') return { x: point.x, y: shape.y };
      return { x: point.x, y: maxY };
    }
    case 'circle': {
      const toPoint = sub(point, shape);
      const distance = length(toPoint);
      if (distance < EPSILON) return { x: shape.x + shape.radius, y: shape.y };
      return add(shape, scale(toPoint, shape.radius / distance));
    }
    case 'polygon': {
      const nearest = nearestPolygonEdge(shape.points, point);
      return nearest === null ? { x: point.x, y: point.y } : nearest.closest;
    }
  }
}

export function outwardNormalNear(shape: Shape, point: Vec2): Vec2 {
  switch (shape.type) {
    case 'rect': {
      const side = nearestRectSide(shape, point);
      if (side === 'left') return { x: -1, y: 0 };
      if (side === 'right') return { x: 1, y: 0 };
      if (side === 'top') return { x: 0, y: -1 };
      return { x: 0, y: 1 };
    }
    case 'circle': {
      const toPoint = sub(point, shape);
      const distance = length(toPoint);
      if (distance < EPSILON) return { x: 1, y: 0 };
      return scale(toPoint, 1 / distance);
    }
    case 'polygon': {
      const nearest = nearestPolygonEdge(shape.points, point);
      if (nearest === null) return { x: 1, y: 0 };
      const edge = sub(nearest.b, nearest.a);
      const edgeLength = length(edge);
      if (edgeLength < EPSILON) return { x: 1, y: 0 };
      const normal = { x: edge.y / edgeLength, y: -edge.x / edgeLength };
      const centroid = polygonCentroid(shape.points);
      const midpoint = scale(add(nearest.a, nearest.b), 0.5);
      return dot(normal, sub(midpoint, centroid)) < 0 ? scale(normal, -1) : normal;
    }
  }
}

type RectSide = 'left' | 'right' | 'top' | 'bottom';

function nearestRectSide(rect: Rect, point: Vec2): RectSide {
  const toLeft = Math.abs(point.x - rect.x);
  const toRight = Math.abs(rect.x + rect.width - point.x);
  const toTop = Math.abs(point.y - rect.y);
  const toBottom = Math.abs(rect.y + rect.height - point.y);
  const nearest = Math.min(toLeft, toRight, toTop, toBottom);
  if (nearest === toLeft) return 'left';
  if (nearest === toRight) return 'right';
  if (nearest === toTop) return 'top';
  return 'bottom';
}

interface PolygonEdge {
  a: Vec2;
  b: Vec2;
  closest: Vec2;
  distanceSquared: number;
}

function nearestPolygonEdge(points: readonly Vec2[], point: Vec2): PolygonEdge | null {
  let nearest: PolygonEdge | null = null;
  for (const [a, b] of edgesOf(points)) {
    const closest = closestPointOnSegment(a, b, point);
    const distanceSquared = distanceSq(point, closest);
    if (nearest === null || distanceSquared < nearest.distanceSquared) {
      nearest = { a, b, closest, distanceSquared };
    }
  }
  return nearest;
}

function polygonCentroid(points: readonly Vec2[]): Vec2 {
  if (points.length === 0) return { x: 0, y: 0 };
  let sum: Vec2 = { x: 0, y: 0 };
  for (const point of points) sum = add(sum, point);
  return scale(sum, 1 / points.length);
}

function edgesOf(points: readonly Vec2[]): [Vec2, Vec2][] {
  const edges: [Vec2, Vec2][] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a === undefined || b === undefined) continue;
    edges.push([a, b]);
  }
  return edges;
}
