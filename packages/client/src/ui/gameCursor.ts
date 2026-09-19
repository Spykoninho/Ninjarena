import { P, pen, rect, surface } from '../rendering/art/nativeArt';

const SIZE = 15;
const SCALE = 2;
const CENTER = (SIZE - 1) / 2;
const GAP = 2;
const TICK = 4;

let cached: string | null = null;

// Un réticule dessiné pixel par pixel, à la place de la flèche du système pendant le combat.
function reticleCanvas(): HTMLCanvasElement {
  const base = surface(SIZE, SIZE);
  const context = pen(base);
  const arms = [
    { x: CENTER, y: CENTER - GAP - TICK, w: 1, h: TICK },
    { x: CENTER, y: CENTER + GAP + 1, w: 1, h: TICK },
    { x: CENTER - GAP - TICK, y: CENTER, w: TICK, h: 1 },
    { x: CENTER + GAP + 1, y: CENTER, w: TICK, h: 1 },
  ];
  for (const arm of arms) rect(context, arm.x - 1, arm.y - 1, arm.w + 2, arm.h + 2, P.ink);
  rect(context, CENTER - 1, CENTER - 1, 3, 3, P.ink);
  for (const arm of arms) rect(context, arm.x, arm.y, arm.w, arm.h, P.ivory);
  rect(context, CENTER, CENTER, 1, 1, P.gold);
  const scaled = surface(SIZE * SCALE, SIZE * SCALE);
  const output = pen(scaled);
  output.imageSmoothingEnabled = false;
  output.drawImage(base, 0, 0, SIZE * SCALE, SIZE * SCALE);
  return scaled;
}

export function gameCursorStyle(): string {
  if (cached === null) {
    const hotspot = CENTER * SCALE;
    cached = `url(${reticleCanvas().toDataURL()}) ${hotspot} ${hotspot}, crosshair`;
  }
  return cached;
}
