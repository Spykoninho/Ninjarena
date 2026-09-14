import { materialRelief, lawn, earth } from './landscapeArt';
import { P, ellipse, hash, line, pen, rect, slab, surface } from './nativeArt';

// Cardinal and diagonal neighbors; a bank never changes the simulated terrain boundary.
export const OFFSETS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;
export function neighborMask(
  x: number,
  y: number,
  same: (x: number, y: number) => boolean,
): number {
  return OFFSETS.reduce((mask, [dx, dy], i) => mask | (same(x + dx, y + dy) ? 1 << i : 0), 0);
}

export function terrainCanvas(
  kind: string,
  variant: number,
  neighbors = 255,
  phase = 0,
  fallback = P.stone[1],
  worldX = variant * 32,
  worldY = 0,
): HTMLCanvasElement {
  const canvas = surface(32, 32),
    c = pen(canvas),
    L = P.landscape;
  rect(c, 0, 0, 32, 32, kind === 'water' ? P.water[1] : kind === 'grass' ? L.grass : fallback);
  if (kind === 'bridge') {
    rect(c, 0, 0, 32, 32, P.wood[0]);
    for (let x = 0; x < 32; x += 8) {
      rect(c, x + 1, 0, 7, 32, P.wood[1]);
      rect(c, x + 1, 0, 1, 32, P.wood[2]);
      line(c, x + 4, 5, x + 4, 16, P.wood[0]);
      line(c, x + 5, 22, x + 5, 28, P.wood[0]);
    }
    for (const [side, y] of [
      [0, 0],
      [2, 28],
    ])
      if (!(neighbors & (1 << side!))) {
        rect(c, 0, y!, 32, 4, P.wood[0]);
        rect(c, 0, y!, 32, 1, P.wood[2]);
        rect(c, 4, y! + 1, 2, 2, P.stone[0]);
        rect(c, 24, y! + 1, 2, 2, P.stone[0]);
      }
    return canvas;
  }
  if (kind === 'paving') {
    pavingTile(c, variant, neighbors, hash(worldX, worldY));
    return canvas;
  }
  if (kind === 'ground' || kind === 'grass') {
    materialRelief(c, kind, worldX, worldY);
  } else if (kind === 'water') {
    c.globalAlpha = 0.35;
    ellipse(c, 22, 15, 20, 16, L.deep);
    c.globalAlpha = 1;
    for (let i = 0; i < 4; i++) {
      const x = (((hash(variant, i) % 24) + phase * (i % 2 ? 1 : -1) + 24) % 24) + 2,
        y = 4 + i * 7;
      rect(c, x, y, 5 + (i % 4), 1, i % 2 ? P.water[2] : L.shallows);
      rect(c, x + 4, y + 1, 3, 1, P.water[1]);
    }
    if (variant % 4 === 0) {
      ellipse(c, 16, 20, 7, 2, P.water[2], true);
      rect(c, 12 + phase, 18, 3, 1, L.foam);
    }
  }
  if (kind === 'water' || kind === 'grass') {
    for (let side = 0; side < 4; side++) {
      if (neighbors & (1 << side)) continue;
      c.save();
      c.translate(16, 16);
      c.rotate((side * Math.PI) / 2);
      c.translate(-16, -16);
      if (kind === 'water') {
        if (side === 0) {
          // Berge nord en surplomb: la terre porte une ombre sur l'eau avant le reflet clair.
          rect(c, 0, 0, 32, 1, earth[1]!);
          rect(c, 0, 1, 32, 1, P.ink);
          rect(c, 0, 2, 32, 3, L.deep);
          rect(c, 0, 5, 32, 1, P.water[2]);
          for (let i = 0; i < 3; i++) rect(c, 3 + i * 10 + (phase % 2), 6, 4, 1, L.foam);
        } else {
          // Berge basse: une frange de sable mouillé puis les hauts-fonds.
          rect(c, 0, 0, 32, 1, earth[0]!);
          rect(c, 0, 1, 32, 2, L.shallows);
          rect(c, 0, 3, 32, 1, P.water[2]);
          for (let i = 0; i < 3; i++) {
            const x = 2 + i * 10;
            rect(c, x + (phase % 2), 2, 5, 1, L.foam);
            rect(c, x + 3, 4, 6, 1, P.water[2]);
          }
        }
      } else {
        // Lisière tramée sur deux pixels: la pelouse mord sur la terre sans ligne dure.
        rect(c, 0, 0, 32, side === 2 ? 4 : 2, side === 0 ? lawn[4]! : lawn[0]!);
        rect(c, 0, side === 2 ? 4 : 2, 32, 1, lawn[3]!);
        for (let x = 0; x < 32; x += 2) {
          rect(c, x + (side % 2), 0, 1, 1, earth[2]!);
          if ((x >> 1) % 3 === 0) rect(c, x, 1, 1, 1, earth[3]!);
        }
        for (let x = 4; x < 30; x += 9) rect(c, x, 2, 2, 1, P.green[2]);
      }
      c.restore();
    }
    // Missing diagonal in an otherwise connected patch needs a concave corner too.
    for (let corner = 0; corner < 4; corner++) {
      const sides = [
        [3, 0],
        [0, 1],
        [1, 2],
        [2, 3],
      ][corner];
      if (!sides) continue;
      if (
        neighbors & (1 << sides[0]!) &&
        neighbors & (1 << sides[1]!) &&
        !(neighbors & (1 << (corner + 4)))
      ) {
        const x = corner === 0 || corner === 3 ? 0 : 29,
          y = corner < 2 ? 0 : 29;
        rect(c, x, y, 3, 3, kind === 'water' ? P.water[2] : P.green[2]);
      }
    }
  }
  return canvas;
}

// Cour surélevée: dalles de tailles mêlées, joints de terre moussus et rebord ombré au sud.
function pavingTile(
  c: CanvasRenderingContext2D,
  variant: number,
  neighbors: number,
  seed: number,
): void {
  const L = P.landscape;
  rect(c, 0, 0, 32, 32, L.soil);
  const layouts: number[][][] = [
    [[1, 1, 30, 30]],
    [
      [1, 1, 30, 14],
      [1, 17, 30, 14],
    ],
    [
      [1, 1, 14, 30],
      [17, 1, 14, 30],
    ],
    [
      [1, 1, 30, 14],
      [1, 17, 14, 14],
      [17, 17, 14, 14],
    ],
    [
      [1, 1, 14, 14],
      [17, 1, 14, 14],
      [1, 17, 30, 14],
    ],
  ];
  const index = seed % 5,
    layout = layouts[index] ?? layouts[0]!;
  layout.forEach(([x = 0, y = 0, w = 0, h = 0], i) => slab(c, x, y, w, h, variant + i));
  // Mousse dans quelques joints, jamais sur la face des dalles.
  const joints = [
    { h: false, v: null },
    { h: true, v: null },
    { h: false, v: [1, 30] },
    { h: true, v: [17, 30] },
    { h: true, v: [1, 14] },
  ][index] ?? { h: false, v: null };
  for (let i = 0; i < 3; i++) {
    const along = hash(seed, i) % 28;
    if ((seed + i) % 3 === 0 && joints.h) rect(c, along + 1, 16, 2 + (i % 2), 1, P.green[1]);
    else if ((seed + i) % 3 === 1 && joints.v) {
      const y = Math.max(joints.v[0]!, Math.min(joints.v[1]! - 2, along + 1));
      rect(c, 16, y, 1, 2 + (i % 2), P.green[1]);
    }
  }
  if (seed % 7 === 0) {
    line(c, 6, 5, 11, 12, P.stone[0]);
    line(c, 11, 12, 10, 18, P.stone[0]);
  }
  if (!(neighbors & 1)) rect(c, 0, 0, 32, 1, P.stone[2]);
  if (!(neighbors & 8)) rect(c, 0, 0, 1, 32, P.stone[2]);
  if (!(neighbors & 2)) rect(c, 31, 0, 1, 32, P.stone[0]);
  if (!(neighbors & 4)) {
    rect(c, 0, 28, 32, 1, P.stone[2]);
    rect(c, 0, 29, 32, 2, P.stone[0]);
    rect(c, 0, 31, 32, 1, P.edge);
    for (let x = 3; x < 32; x += 9) rect(c, x, 30, 1, 1, P.edge);
  }
}
