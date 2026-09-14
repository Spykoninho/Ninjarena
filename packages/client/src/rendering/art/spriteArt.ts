import { treeCanopyCanvas, treeTrunkCanvas } from './volumeArt';
import { Texture } from 'pixi.js';
import type { Animation } from './presentation';
import type { Direction, Layer, Ramp } from './nativeArt';
import { P, ellipse, line, ninja, pen, rect, surface, tile } from './nativeArt';

export type Prop = 'kunai' | 'shuriken' | 'none';

// Déformation d'une pose: cisaillement horizontal du haut du corps et étirement vertical.
interface Deform {
  lean: number;
  stretch: number;
  dx: number;
  dy: number;
}

const RIG_ORIGIN = 16;
const NECK_ROW = 15;
const LAYERS: Layer[] = ['Body', 'Clothes', 'Hair', 'Headgear', 'Accessory', 'Weapon'];

// Textures live for one renderer session and are shared by all actors/afterimages.
export class SpriteArt {
  private readonly textures = new Map<string, Texture>();

  pose(direction: Direction, animation: Animation, frame: number, skin = 0, prop: Prop = 'kunai') {
    return this.cached(`${direction}:${animation}:${frame}:${skin}:${prop}`, () =>
      poseCanvas(direction, animation, frame, skin, prop),
    );
  }

  floor(kind: string, variant: number): Texture {
    return this.cached(`tile:${kind}:${variant}`, () => tile(kind, variant));
  }

  canopy(variant: number): Texture {
    return this.cached(`tree:${variant}`, () => treeCanopyCanvas(variant));
  }
  trunk(): Texture {
    return this.cached('trunk', () => treeTrunkCanvas());
  }

  private cached(key: string, draw: () => HTMLCanvasElement): Texture {
    let texture = this.textures.get(key);
    if (texture === undefined) {
      texture = Texture.from(draw());
      this.textures.set(key, texture);
    }
    return texture;
  }

  dispose(): void {
    for (const texture of this.textures.values()) texture.destroy(true);
    this.textures.clear();
  }
}

// Une pose complète en cellule 64 x 64, pivot au sol en (32, 45), sans mise à l'échelle.
export function poseCanvas(
  direction: Direction,
  animation: Animation,
  frame: number,
  skin = 0,
  prop: Prop = 'kunai',
): HTMLCanvasElement {
  const canvas = surface(64, 64),
    ctx = pen(canvas);
  const cloth = [P.indigo, P.wood, P.green, P.indigo][skin % 4] ?? P.indigo;
  const skinRamp = skin === 1 ? P.darkSkin : P.skin;
  const rig = composeRig(direction, animation, frame, cloth, skinRamp, skin === 1);
  if (animation === 'death' && frame >= 3) {
    // A pixel-grid quarter turn gives a compact fallen silhouette, never scales it.
    ctx.translate(32, 41 + Math.min(3, frame - 3));
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(rig, -24, -16);
    ctx.resetTransform();
    return canvas;
  }
  const deform = deformOf(direction, animation, frame);
  const y = RIG_ORIGIN + deform.dy + (animation === 'death' ? frame * 2 : 0);
  drawDeformed(ctx, rig, RIG_ORIGIN + deform.dx, y, deform);
  drawProps(ctx, direction, animation, frame, prop, cloth, skinRamp, deform);
  return canvas;
}

function composeRig(
  direction: Direction,
  animation: Animation,
  frame: number,
  cloth: Ramp,
  skin: Ramp,
  hat: boolean,
): HTMLCanvasElement {
  const rig = surface(32, 32),
    ctx = pen(rig);
  const step = animation === 'walk' ? ([0, -1, -1, 0, 1, 1][frame % 6] ?? 0) : 0;
  const bob =
    (animation === 'idle' && frame === 2) ||
    (animation === 'walk' && frame % 3 === 1) ||
    (animation === 'cast' && frame === 3)
      ? -1
      : 0;
  for (const layer of LAYERS) {
    const image = ninja({ direction, cloth, skin, step, layer, weapon: true, hat });
    ctx.drawImage(image, 0, layer === 'Body' ? 0 : bob);
  }
  return rig;
}

function deformOf(direction: Direction, animation: Animation, frame: number): Deform {
  const none: Deform = { lean: 0, stretch: 0, dx: 0, dy: 0 };
  const side = direction === 'e' || direction === 'w';
  const forward = direction === 'w' ? -1 : 1;
  // Vers l'avant pour une face: un pas vers la caméra descend, un pas vers le fond monte.
  const ahead = direction === 's' ? 1 : direction === 'n' ? -1 : 0;
  switch (animation) {
    case 'dash':
      return side
        ? { lean: 2 * forward, stretch: 1, dx: 0, dy: 0 }
        : { lean: 0, stretch: 3, dx: 0, dy: 0 };
    case 'attack': {
      const lean = [-1, 2, 2, 1][frame] ?? 0,
        stretch = [-1, 1, 0, 0][frame] ?? 0,
        stride = [0, 1, 1, 0][frame] ?? 0;
      return side
        ? { lean: lean * forward, stretch, dx: stride * forward, dy: 0 }
        : { lean: 0, stretch: stretch - (frame === 0 ? 0 : 0), dx: 0, dy: stride * ahead };
    }
    case 'cast': {
      if (frame === 4)
        return side
          ? { lean: 1 * forward, stretch: 0, dx: forward, dy: 0 }
          : { lean: 0, stretch: 1, dx: 0, dy: ahead };
      return { ...none, stretch: frame === 0 ? -1 : 0 };
    }
    case 'hit': {
      const away = side ? -forward : 0;
      return frame === 0
        ? { lean: 2 * away, stretch: -1, dx: away, dy: 0 }
        : { lean: away, stretch: 0, dx: 0, dy: 0 };
    }
    default:
      return none;
  }
}

// Le haut du corps se cisaille par bandes de huit lignes; le cou est doublé pour un étirement.
function drawDeformed(
  ctx: CanvasRenderingContext2D,
  rig: HTMLCanvasElement,
  x: number,
  y: number,
  { lean, stretch }: Deform,
): void {
  for (let row = 0; row < 32; row++) {
    const shear = lean === 0 ? 0 : Math.round((lean * Math.max(0, 29 - row)) / 29);
    const lift = row < NECK_ROW ? -stretch : 0;
    ctx.drawImage(rig, 0, row, 32, 1, x + shear, y + row + lift, 32, 1);
  }
  for (let extra = 1; extra <= stretch; extra++) {
    const shear = lean === 0 ? 0 : Math.round((lean * (29 - NECK_ROW)) / 29);
    ctx.drawImage(rig, 0, NECK_ROW, 32, 1, x + shear, y + NECK_ROW - stretch + extra, 32, 1);
  }
}

interface ArmPose {
  shoulder: [number, number];
  hand: [number, number];
}

// Poses de bras en coordonnées du rig tourné vers l'est ou vers le sud/nord; l'ouest est miroir.
function armPose(direction: Direction, animation: Animation, frame: number): ArmPose | null {
  const east = direction === 'e' || direction === 'w';
  if (animation === 'attack') {
    if (east) {
      const hands: [number, number][] = [
        [20, 13],
        [30, 17],
        [31, 17],
        [27, 18],
      ];
      return { shoulder: [23, 16], hand: hands[frame] ?? [27, 18] };
    }
    if (direction === 's') {
      const hands: [number, number][] = [
        [27, 12],
        [19, 27],
        [18, 28],
        [23, 24],
      ];
      return { shoulder: [24, 16], hand: hands[frame] ?? [23, 24] };
    }
    const hands: [number, number][] = [
      [26, 21],
      [18, 3],
      [18, 2],
      [23, 8],
    ];
    return { shoulder: [24, 16], hand: hands[frame] ?? [23, 8] };
  }
  if (animation === 'cast' && frame === 4) {
    if (east) return { shoulder: [23, 16], hand: [31, 16] };
    if (direction === 's') return { shoulder: [24, 16], hand: [17, 27] };
    return { shoulder: [24, 16], hand: [18, 4] };
  }
  return null;
}

function drawProps(
  ctx: CanvasRenderingContext2D,
  direction: Direction,
  animation: Animation,
  frame: number,
  prop: Prop,
  cloth: Ramp,
  skin: Ramp,
  deform: Deform,
): void {
  if (animation !== 'attack' && animation !== 'cast') return;
  const layer = surface(64, 64),
    c = pen(layer);
  const facing = direction === 'w' ? 'e' : direction;
  const ox = RIG_ORIGIN + Math.abs(deform.dx),
    oy = RIG_ORIGIN + deform.dy;
  if (animation === 'cast' && frame < 4) drawSeal(c, facing, frame, ox, oy, skin);
  const pose = armPose(direction, animation, frame);
  if (pose) {
    const [sx, sy] = pose.shoulder,
      [hx, hy] = pose.hand;
    drawArm(c, ox + sx, oy + sy - deform.stretch, ox + hx, oy + hy, cloth, skin);
    if (animation === 'attack') drawWeapon(c, facing, frame, prop, ox + hx, oy + hy);
    else drawCastRelease(c, facing, ox + hx, oy + hy);
  }
  if (direction === 'w') {
    ctx.save();
    ctx.translate(64, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  } else ctx.drawImage(layer, 0, 0);
}

function drawArm(
  c: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  hx: number,
  hy: number,
  cloth: Ramp,
  skin: Ramp,
): void {
  const mx = Math.round((sx + hx) / 2),
    my = Math.round((sy + hy) / 2);
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const)
    line(c, sx + dx, sy + dy, hx + dx, hy + dy, P.ink);
  line(c, sx, sy, mx, my, cloth[1]);
  line(c, mx, my, hx, hy, skin[1]);
  rect(c, hx - 1, hy - 1, 4, 4, P.ink);
  rect(c, hx, hy, 2, 2, skin[2]);
}

function drawWeapon(
  c: CanvasRenderingContext2D,
  facing: Direction,
  frame: number,
  prop: Prop,
  hx: number,
  hy: number,
): void {
  if (prop === 'shuriken') {
    if (frame !== 0) return;
    // Étoile tenue avant le lancer: quatre branches d'encre et un moyeu ivoire.
    rect(c, hx - 3, hy, 8, 2, P.ink);
    rect(c, hx, hy - 3, 2, 8, P.ink);
    rect(c, hx, hy, 2, 2, P.ivory);
    return;
  }
  if (prop === 'none') return;
  if (frame === 0) {
    // Prise inversée, lame vers l'arrière et le haut pendant la préparation.
    const dir = facing === 'n' ? [1, 1] : facing === 's' ? [1, -1] : [-1, -1];
    for (let i = 1; i <= 5; i++)
      rect(c, hx + dir[0]! * i, hy + dir[1]! * i, 2, 2, i > 3 ? P.ivory : P.ink);
    return;
  }
  const length = frame === 3 ? 4 : 6;
  if (facing === 'e') {
    rect(c, hx - 2, hy, 2, 2, P.wood[2]);
    rect(c, hx + 2, hy, length, 2, P.ink);
    rect(c, hx + 2, hy, length - 1, 1, P.ivory);
  } else if (facing === 's') {
    rect(c, hx, hy - 2, 2, 2, P.wood[2]);
    rect(c, hx, hy + 2, 2, length, P.ink);
    rect(c, hx, hy + 2, 1, length - 1, P.ivory);
  } else {
    rect(c, hx, hy + 2, 2, 2, P.wood[2]);
    rect(c, hx, hy - length - 1, 2, length, P.ink);
    rect(c, hx + 1, hy - length - 1, 1, length - 1, P.ivory);
  }
  if (frame === 2) {
    // Trait de coupe court devant la lame: le croissant complet vit dans la couche des effets.
    const streak =
      facing === 'e'
        ? [
            [hx + 9, hy - 4],
            [hx + 11, hy - 1],
            [hx + 11, hy + 2],
            [hx + 9, hy + 5],
          ]
        : facing === 's'
          ? [
              [hx - 4, hy + 9],
              [hx - 1, hy + 11],
              [hx + 2, hy + 11],
              [hx + 5, hy + 9],
            ]
          : [
              [hx - 4, hy - 9],
              [hx - 1, hy - 11],
              [hx + 2, hy - 11],
              [hx + 5, hy - 9],
            ];
    streak.forEach(([x = 0, y = 0], i) => rect(c, x, y, 2, 1, i % 2 ? P.ivory : P.cyan));
  }
}

// Mains jointes en signe: deux blocs de peau, deux doigts levés puis une lueur qui alterne.
function drawSeal(
  c: CanvasRenderingContext2D,
  facing: Direction,
  frame: number,
  ox: number,
  oy: number,
  skin: Ramp,
): void {
  const glow = [
    [
      [-5, 1],
      [6, 4],
      [-2, 7],
      [4, -3],
    ],
    [
      [-4, 5],
      [7, 0],
      [1, -4],
      [5, 7],
    ],
  ];
  if (facing === 'n') {
    if (frame >= 2)
      for (const [dx = 0, dy = 0] of glow[frame % 2] ?? [])
        rect(c, ox + 16 + dx, oy + 12 + dy, 1, 1, P.cyan);
    return;
  }
  const [hx, hy] = facing === 'e' ? [24, 18] : [15, 19];
  const x = ox + hx,
    y = oy + hy;
  rect(c, x - 1, y - 1, 6, 5, P.ink);
  rect(c, x, y, 2, 3, skin[1]);
  rect(c, x + 2, y, 2, 3, skin[2]);
  if (frame >= 1) {
    rect(c, x + 1, y - 4, 1, 3, P.ink);
    rect(c, x + 2, y - 4, 1, 3, P.ink);
    rect(c, x + 1, y - 4, 1, 2, P.ivory);
    rect(c, x + 2, y - 3, 1, 1, skin[2]);
  }
  if (frame >= 2)
    for (const [dx = 0, dy = 0] of glow[frame % 2] ?? [])
      rect(c, x + 2 + dx, y + 1 + dy, 1, 1, P.cyan);
}

function drawCastRelease(
  c: CanvasRenderingContext2D,
  facing: Direction,
  hx: number,
  hy: number,
): void {
  const ahead = facing === 'e' ? [1, 0] : facing === 's' ? [0, 1] : [0, -1];
  for (let i = 3; i <= 7; i += 2) {
    const x = hx + ahead[0]! * i,
      y = hy + ahead[1]! * i;
    rect(c, x, y, 2, 2, i === 5 ? P.ivory : P.cyan);
  }
  ellipse(c, hx + ahead[0]! * 2, hy + ahead[1]! * 2, 2, 2, P.cyan, true);
}

export function iconCanvas(family: string): HTMLCanvasElement {
  const canvas = surface(24, 24),
    ctx = pen(canvas);
  // Small icons use the same palette and shape grammar, with no text baked into the asset.
  if (family === 'dash') {
    for (const x of [6, 13]) {
      rect(ctx, x, 5, 2, 3, P.cyan);
      rect(ctx, x + 2, 8, 2, 3, P.cyan);
      rect(ctx, x + 4, 11, 2, 3, P.ivory);
      rect(ctx, x + 2, 14, 2, 3, P.cyan);
      rect(ctx, x, 17, 2, 2, P.cyan);
    }
  } else if (family === 'defense') {
    for (let y = 4; y < 18; y++) {
      const inset = Math.max(0, y - 12);
      rect(ctx, 4 + inset, y, 2, 1, P.mint);
      rect(ctx, 18 - inset, y, 2, 1, P.mint);
    }
    rect(ctx, 5, 3, 14, 2, P.mint);
  } else if (family === 'wall') {
    for (let y = 5; y < 20; y += 5)
      for (let x = 3; x < 20; x += 8) {
        rect(ctx, x, y, 7, 4, P.stone[1]);
        rect(ctx, x, y, 7, 1, P.stone[2]);
      }
  } else if (family === 'control') {
    rect(ctx, 6, 10, 13, 10, P.violet);
    rect(ctx, 8, 5, 2, 6, P.violet);
    rect(ctx, 16, 5, 2, 6, P.violet);
    rect(ctx, 9, 4, 8, 2, P.violet);
    rect(ctx, 12, 13, 2, 4, P.ink);
  } else if (family === 'area' || family === 'trap') {
    ellipse(ctx, 12, 13, 9, 8, P.danger, true);
    rect(ctx, 10, 7, 3, 10, P.gold);
    rect(ctx, 7, 11, 9, 3, P.gold);
  } else if (family === 'teleport') {
    rect(ctx, 4, 5, 2, 13, P.violet);
    rect(ctx, 6, 4, 5, 2, P.violet);
    rect(ctx, 6, 18, 5, 2, P.violet);
    rect(ctx, 17, 5, 2, 13, P.ivory);
    rect(ctx, 12, 4, 5, 2, P.ivory);
    rect(ctx, 12, 18, 5, 2, P.ivory);
  } else if (family === 'projectile') {
    for (let x = 4; x < 20; x++) {
      const h = Math.max(1, 5 - Math.abs(x - 14));
      rect(ctx, x, 12 - h, 1, h * 2, P.danger);
    }
    rect(ctx, 11, 11, 8, 2, P.gold);
  } else {
    for (let i = 0; i < 13; i++) {
      rect(ctx, 5 + i, 18 - i, 3, 2, i < 4 ? P.wood[2] : P.ivory);
    }
    rect(ctx, 6, 14, 5, 2, P.wood[2]);
  }
  return canvas;
}
