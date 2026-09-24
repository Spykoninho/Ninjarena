import { add, rotate, scale } from '@ninjarena/core';
import type { Vec2 } from '@ninjarena/core';
import type { AimShape } from '../input/touchAim';
import { P, rect } from '../rendering/art/nativeArt';
import { ART_SCALE } from '../rendering/art/presentation';

// Le guide part du bord du corps: la flèche ne cache pas le ninja qui vise.
const BODY_CLEARANCE = 8;
const DOT_SPACING = 6;
const WALL_SPACING = 3;
const RADIANS_PER_DEGREE = Math.PI / 180;

// En pixels d'art, comme le décor: le monde en compte ART_SCALE par unité.
export function paintAimGuide(
  context: CanvasRenderingContext2D,
  origin: Vec2,
  shape: AimShape,
  direction: Vec2,
  reach: number,
): void {
  switch (shape.kind) {
    case 'self':
      return;
    case 'line': {
      const length = shape.reach * ART_SCALE;
      const half = (shape.spreadDegrees / 2) * RADIANS_PER_DEGREE;
      if (half > 0) {
        for (const side of [-half, half]) ray(context, origin, rotate(direction, side), length);
      }
      ray(context, origin, direction, length);
      arrowHead(context, at(origin, direction, length), direction);
      return;
    }
    case 'cone': {
      const length = shape.reach * ART_SCALE;
      const half = (shape.arcDegrees / 2) * RADIANS_PER_DEGREE;
      for (const side of [-half, half]) ray(context, origin, rotate(direction, side), length);
      arc(context, origin, direction, length, half);
      return;
    }
    case 'wall': {
      const center = at(origin, direction, shape.offset * ART_SCALE);
      const across = { x: -direction.y, y: direction.x };
      const half = (shape.width * ART_SCALE) / 2;
      for (let offset = -half; offset <= half; offset += WALL_SPACING) {
        dot(context, at(center, across, offset));
      }
      return;
    }
    case 'area': {
      const distance = (shape.free ? reach * shape.range : shape.range) * ART_SCALE;
      const center = at(origin, direction, distance);
      const radius = shape.radius * ART_SCALE;
      ray(context, origin, direction, distance - radius);
      circle(context, center, radius);
      dot(context, center);
      return;
    }
  }
}

function ray(context: CanvasRenderingContext2D, origin: Vec2, direction: Vec2, length: number) {
  for (let step = BODY_CLEARANCE * ART_SCALE; step <= length; step += DOT_SPACING) {
    dot(context, at(origin, direction, step));
  }
}

function arrowHead(context: CanvasRenderingContext2D, tip: Vec2, direction: Vec2): void {
  for (const back of [4, 8]) {
    for (const side of [-1, 1]) {
      dot(
        context,
        add(at(tip, direction, -back), scale({ x: -direction.y, y: direction.x }, side * back)),
      );
    }
  }
  dot(context, tip);
}

function arc(
  context: CanvasRenderingContext2D,
  origin: Vec2,
  direction: Vec2,
  radius: number,
  half: number,
): void {
  const steps = Math.max(2, Math.ceil((2 * half * radius) / DOT_SPACING));
  for (let index = 0; index <= steps; index++) {
    dot(context, at(origin, rotate(direction, -half + (2 * half * index) / steps), radius));
  }
}

function circle(context: CanvasRenderingContext2D, center: Vec2, radius: number): void {
  const steps = Math.max(8, Math.ceil((2 * Math.PI * radius) / DOT_SPACING));
  for (let index = 0; index < steps; index++) {
    dot(context, at(center, rotate({ x: 1, y: 0 }, (2 * Math.PI * index) / steps), radius));
  }
}

function at(origin: Vec2, direction: Vec2, distance: number): Vec2 {
  return add(origin, scale(direction, distance));
}

function dot(context: CanvasRenderingContext2D, point: Vec2): void {
  rect(context, point.x - 2, point.y - 2, 4, 4, P.ink);
  rect(context, point.x - 1, point.y - 1, 2, 2, P.ivory);
}
