/* Native material relief, shared by the game and its art reference. */
import { P, ellipse, hash, line, pen, poly, rect, surface } from './nativeArt.js';

export const earth = ['#96977A', '#A4A184', '#B1AC8C', '#BBB392', '#C6BC9A'];
export const lawn = ['#486A50', '#527758', '#60835D', '#6D8C63', '#829B6E'];

// Coordinates are global art pixels: broad contours continue across tiles and chunks.
export function materialRelief(c, kind, worldX, worldY) {
  const grass = kind === 'grass',
    colors = grass ? lawn : earth;
  for (let y = 0; y < 32; y += 2)
    for (let x = 0; x < 32; x += 2) {
      const gx = worldX + x,
        gy = worldY + y;
      const wave = Math.sin(gx / 47 + Math.sin(gy / 39)) + 0.55 * Math.sin(gy / 23 + gx / 89);
      const level = Math.max(0, Math.min(4, Math.floor(2 + wave * 1.12)));
      rect(c, x, y, 2, 2, colors[level]);
    }
  const seed = hash(worldX, worldY);
  if (grass) {
    for (let i = 0; i < 8; i++) {
      const x = 3 + (hash(seed, i) % 26),
        y = 4 + (hash(i, seed) % 24);
      // Compact leaf masses with a shaded underside, not uniform needle noise.
      rect(c, x - 2, y + 1, 6, 2, lawn[1]);
      rect(c, x - 2, y - 1, 3, 2, lawn[3]);
      rect(c, x, y - 3, 2, 4, lawn[4]);
      rect(c, x + 2, y - 1, 2, 2, lawn[3]);
      if (i % 4 === 0) line(c, x - 1, y + 1, x - 3, y - 3, lawn[0]);
    }
    // Une fleur rare par massif: deux pixels clairs sur une tige sombre, jamais en semis.
    if (seed % 5 === 0) {
      const fx = 6 + (seed % 19),
        fy = 8 + ((seed >> 3) % 15);
      rect(c, fx, fy, 1, 3, lawn[0]);
      rect(c, fx - 1, fy - 1, 3, 1, seed % 10 === 0 ? P.danger : P.ivory);
      rect(c, fx, fy - 2, 1, 1, seed % 10 === 0 ? P.danger : P.ivory);
      rect(c, fx, fy - 1, 1, 1, P.gold);
    }
    if (seed % 3 === 0) {
      line(c, 5, 25, 13, 27, P.wood[0]);
      line(c, 6, 24, 12, 26, P.wood[1]);
      rect(c, 10, 22, 3, 2, P.landscape.soil);
    }
  } else {
    for (let i = 0; i < 11; i++) {
      const x = 2 + (hash(seed, i) % 27),
        y = 3 + (hash(i, seed) % 27);
      rect(c, x, y, 2 + (i % 3), 1, i % 3 ? earth[1] : earth[3]);
      if (i % 3 === 0) rect(c, x + 1, y + 1, 2, 1, earth[4]);
    }
    // Wind-combed sand: short ridges have a shaded lip and an illuminated lower edge.
    if (seed % 4 === 0)
      for (let i = 0; i < 3; i++) {
        const y = 9 + i * 4,
          x = 5 + (i % 2) * 2;
        line(c, x, y, x + 8 + i * 2, y - 1, earth[1]);
        line(c, x + 1, y + 1, x + 8 + i * 2, y, earth[3]);
      }
  }
}

export function shallowHollow(c, x, y, radius = 12) {
  // A shallow, walkable depression: no black cavity, hazard ring or hard outline.
  ellipse(c, x, y, radius, 5, earth[1]);
  ellipse(c, x - 1, y - 1, radius - 3, 3, earth[0]);
  ellipse(c, x + 1, y + 1, radius - 4, 3, earth[1]);
  line(c, x - radius + 3, y + 3, x - 3, y + 5, earth[3]);
  line(c, x - 3, y + 5, x + radius - 3, y + 3, earth[4]);
  rect(c, x + radius - 1, y, 2, 2, earth[2]);
}

export function shrubCanvas(variant = 0) {
  const cv = surface(40, 48),
    c = pen(cv);
  // Footprint is 32px wide; foliage may overhang by four art pixels.
  poly(
    c,
    [
      [8, 43],
      [4, 39],
      [4, 29],
      [9, 20],
      [30, 20],
      [36, 30],
      [36, 38],
      [31, 43],
      [22, 45],
      [13, 44],
    ],
    P.green[0],
  );
  for (const [x, y, r] of [
    [12, 26, 11],
    [27, 25, 12],
    [20, 15, 12],
  ]) {
    ellipse(c, x, y, r, 10, P.green[0]);
    ellipse(c, x - 1, y - 3, r - 2, 8, P.green[1]);
    ellipse(c, x - 3, y - 5, r - 5, 4, P.green[2]);
    for (let i = 0; i < 9; i++) {
      const xx = x - 7 + (hash(i + x, variant) % 14),
        yy = y - 6 + (hash(i + y, variant) % 10);
      rect(c, xx, yy, 3, 2, i % 3 ? P.green[2] : P.landscape.leaf);
      if (i % 3 === 0) rect(c, xx + 1, yy + 2, 3, 1, P.green[0]);
    }
  }
  for (const x of [9, 17, 25, 31]) {
    const y = 35 + (x % 3);
    ellipse(c, x, y, 7, 6, P.green[0]);
    ellipse(c, x - 1, y - 2, 6, 4, P.green[1]);
    rect(c, x - 4, y - 4, 4, 1, P.green[2]);
    rect(c, x + 1, y - 1, 3, 1, P.green[2]);
  }
  return cv;
}

export function windCanvas(kind, phase, variant = 0) {
  const cv = surface(32, 32),
    c = pen(cv),
    shift = [0, 1, 1, 0][phase % 4];
  if (kind === 'grass') {
    for (const [x, y] of [
      [9, 17],
      [21, 24],
      [25, 10],
    ]) {
      line(c, x, y, x - 2 + shift, y - 5, lawn[1]);
      line(c, x, y - 1, x + 1 + shift, y - 6, lawn[4]);
      line(c, x + 1, y, x + 4 + shift, y - 3, lawn[3]);
    }
  } else {
    // Rare moving grains, never whole tiles scrolling below the player's feet.
    for (let i = 0; i < 3; i++) {
      const x = 3 + ((variant + i * 7 + phase * 2) % 23),
        y = 13 + i * 3;
      rect(c, x, y, 3, 1, earth[4]);
    }
  }
  return cv;
}
