import type { Ramp } from '../rendering/art/nativeArt';
import { P, ellipse, ninja, pen, rect, surface, symbol, teams } from '../rendering/art/nativeArt';

const PORTRAIT_SIZE = 48;
const PORTRAIT_SCALE = 2;
const CROP = PORTRAIT_SIZE / PORTRAIT_SCALE;
const CROP_X = 4;
const CROP_Y = 1;
const PLATE_SIZE = 9;

const portraits = new Map<number, HTMLCanvasElement>();
const plates = new Map<number, HTMLCanvasElement>();

export function teamColor(code: number): string {
  return teams[((code % teams.length) + teams.length) % teams.length] ?? P.ivory;
}

// Le portrait réutilise le rig du monde: même tenue, même teint, cadrés sur la tête et le buste.
export function portraitCanvas(skin: number): HTMLCanvasElement {
  const key = ((skin % 4) + 4) % 4;
  const cached = portraits.get(key);
  if (cached !== undefined) return cached;
  const cloth: Ramp = [P.indigo, P.wood, P.green, P.indigo][key] ?? P.indigo;
  const rig = ninja({
    direction: 's',
    cloth,
    skin: key === 1 ? P.darkSkin : P.skin,
    weapon: true,
    hat: key === 1,
  });
  const canvas = surface(PORTRAIT_SIZE, PORTRAIT_SIZE);
  const context = pen(canvas);
  rect(context, 0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE, P.ink);
  for (let y = 0; y < PORTRAIT_SIZE; y += 4) rect(context, 0, y, PORTRAIT_SIZE, 1, '#101C24');
  context.drawImage(rig, CROP_X, CROP_Y, CROP, CROP, 0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
  portraits.set(key, canvas);
  return canvas;
}

export function teamPlateCanvas(code: number): HTMLCanvasElement {
  const cached = plates.get(code);
  if (cached !== undefined) return cached;
  const canvas = surface(PLATE_SIZE, PLATE_SIZE);
  const context = pen(canvas);
  rect(context, 0, 0, PLATE_SIZE, PLATE_SIZE, P.ink);
  rect(context, 0, 0, PLATE_SIZE, 1, P.edge);
  rect(context, 0, PLATE_SIZE - 1, PLATE_SIZE, 1, P.edge);
  rect(context, 0, 0, 1, PLATE_SIZE, P.edge);
  rect(context, PLATE_SIZE - 1, 0, 1, PLATE_SIZE, P.edge);
  symbol(context, code, 2, 2, teamColor(code));
  plates.set(code, canvas);
  return canvas;
}

export function lockCanvas(): HTMLCanvasElement {
  const canvas = surface(8, 10);
  const context = pen(canvas);
  rect(context, 2, 0, 4, 2, P.ivory);
  rect(context, 2, 2, 1, 2, P.ivory);
  rect(context, 5, 2, 1, 2, P.ivory);
  rect(context, 0, 3, 8, 7, P.ink);
  rect(context, 1, 4, 6, 5, P.ivory);
  rect(context, 3, 5, 2, 3, P.ink);
  return canvas;
}

export function shieldGlyphCanvas(): HTMLCanvasElement {
  const canvas = surface(7, 8);
  const context = pen(canvas);
  for (let y = 0; y < 8; y++) {
    const inset = Math.max(0, y - 4);
    rect(context, inset, y, 7 - inset * 2, 1, y === 0 ? P.ivory : P.mint);
  }
  return canvas;
}

export function gearCanvas(): HTMLCanvasElement {
  const canvas = surface(11, 11);
  const context = pen(canvas);
  rect(context, 4, 0, 3, 11, P.ivory);
  rect(context, 0, 4, 11, 3, P.ivory);
  ellipse(context, 5, 5, 4, 4, P.ivory, true);
  ellipse(context, 5, 5, 2, 2, P.ink, false);
  return canvas;
}
