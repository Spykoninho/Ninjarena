/* global document */
// Original native pixel recipes, Ninjarena art bible 1.4. Coordinates are art pixels.
export const P = {
  ink: '#172631',
  ui: '#293C49',
  edge: '#49616B',
  indigo: ['#29334F', '#465677', '#7888A0'],
  stone: ['#777B70', '#A7AA8B', '#D1C9A0'],
  green: ['#294F49', '#47705B', '#78916A'],
  water: ['#264956', '#386C78', '#65949A'],
  wood: ['#63463F', '#A16C50', '#CF9565'],
  landscape: {
    soil: '#929780',
    sand: '#B6B293',
    grass: '#5C7D60',
    leaf: '#91A976',
    shade: '#536F67',
    shallows: '#568B88',
    foam: '#A7C7B1',
    deep: '#305D6C',
  },
  skin: ['#A76F59', '#D29A75', '#ECC49A'],
  darkSkin: ['#523C39', '#855844', '#B7805C'],
  ivory: '#F5EDCD',
  danger: '#FF7867',
  gold: '#FFD16A',
  cyan: '#75DCE4',
  violet: '#BEA0EF',
  mint: '#92D8B4',
};
export const teams = [P.cyan, P.danger, P.gold, P.violet, P.mint, '#E6A7C3', P.ivory, '#92B8ED'];
export function surface(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
export function pen(c) {
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return x;
}
export function rect(c, x, y, w, h, color) {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), w, h);
}
export function line(c, x0, y0, x1, y1, color) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  let dx = Math.abs(x1 - x0),
    sx = x0 < x1 ? 1 : -1,
    dy = -Math.abs(y1 - y0),
    sy = y0 < y1 ? 1 : -1,
    err = dx + dy;
  for (;;) {
    rect(c, x0, y0, 1, 1, color);
    if (x0 === x1 && y0 === y1) break;
    let e = 2 * err;
    if (e >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}
export function ellipse(c, cx, cy, rx, ry, color, outline = false) {
  for (let y = -ry; y <= ry; y++)
    for (let x = -rx; x <= rx; x++) {
      let d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      let inside = d <= 1;
      let inner =
        rx > 1 && ry > 1 && (x * x) / ((rx - 1) * (rx - 1)) + (y * y) / ((ry - 1) * (ry - 1)) < 1;
      if (inside && (!outline || !inner)) rect(c, cx + x, cy + y, 1, 1, color);
    }
}
export function poly(c, points, color) {
  let minX = Math.min(...points.map((p) => p[0])),
    maxX = Math.max(...points.map((p) => p[0])),
    minY = Math.min(...points.map((p) => p[1])),
    maxY = Math.max(...points.map((p) => p[1]));
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        let a = points[i],
          b = points[j];
        if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
          inside = !inside;
      }
      if (inside) rect(c, x, y, 1, 1, color);
    }
}
// 5x7 bitmap lettering: UI stays on the native grid, without font antialiasing.
const glyphs = {
  A: [126, 9, 9, 9, 126],
  B: [127, 73, 73, 73, 54],
  C: [62, 65, 65, 65, 34],
  D: [127, 65, 65, 34, 28],
  E: [127, 73, 73, 73, 65],
  F: [127, 9, 9, 9, 1],
  G: [62, 65, 73, 73, 122],
  H: [127, 8, 8, 8, 127],
  I: [65, 65, 127, 65, 65],
  J: [32, 64, 65, 63, 1],
  K: [127, 8, 20, 34, 65],
  L: [127, 64, 64, 64, 64],
  M: [127, 2, 12, 2, 127],
  N: [127, 4, 8, 16, 127],
  O: [62, 65, 65, 65, 62],
  P: [127, 9, 9, 9, 6],
  Q: [62, 65, 81, 33, 94],
  R: [127, 9, 25, 41, 70],
  S: [38, 73, 73, 73, 50],
  T: [1, 1, 127, 1, 1],
  U: [63, 64, 64, 64, 63],
  V: [31, 32, 64, 32, 31],
  W: [63, 64, 56, 64, 63],
  X: [99, 20, 8, 20, 99],
  Y: [7, 8, 112, 8, 7],
  Z: [97, 81, 73, 69, 67],
  0: [62, 81, 73, 69, 62],
  1: [0, 66, 127, 64, 0],
  2: [98, 81, 73, 73, 70],
  3: [34, 65, 73, 73, 54],
  4: [24, 20, 18, 127, 16],
  5: [39, 69, 69, 69, 57],
  6: [62, 73, 73, 73, 50],
  7: [1, 113, 9, 5, 3],
  8: [54, 73, 73, 73, 54],
  9: [38, 73, 73, 73, 62],
  '/': [32, 16, 8, 4, 2],
  ':': [0, 0, 20, 0, 0],
  '.': [0, 64, 0, 0, 0],
  ',': [0, 64, 32, 0, 0],
  '+': [8, 8, 62, 8, 8],
  '-': [8, 8, 8, 8, 8],
  ' ': [0, 0, 0, 0, 0],
};
export function text(c, t, x, y, color = P.ivory) {
  for (const ch of t.toUpperCase()) {
    const glyph = glyphs[ch] || glyphs[' '];
    glyph.forEach((bits, col) => {
      for (let row = 0; row < 7; row++)
        if (bits & (1 << row)) rect(c, x + col, y - 7 + row, 1, 1, color);
    });
    x += 6;
  }
}
export function blit(c, s, x, y, scale = 1) {
  c.drawImage(s, x, y, s.width * scale, s.height * scale);
}
export function ninja({
  direction = 's',
  cloth = P.indigo,
  skin = P.skin,
  step = 0,
  layer = null,
  weapon = false,
  hat = false,
} = {}) {
  const out = surface(32, 32),
    c = pen(out);
  const layers = {};
  for (const k of ['Body', 'Clothes', 'Hair', 'Headgear', 'Accessory', 'Weapon'])
    layers[k] = surface(32, 32);
  const side = direction === 'e' || direction === 'w',
    north = direction === 'n';
  let b = pen(layers.Body),
    v = pen(layers.Clothes),
    h = pen(layers.Hair),
    g = pen(layers.Headgear),
    a = pen(layers.Accessory),
    w = pen(layers.Weapon);
  // Shared body: the two soles stay separated, even on a compressed gait pose.
  rect(b, 11, 22 + step, 5, 7 - step, P.ink);
  rect(b, 18, 22 - step, 5, 7 + step, P.ink);
  rect(b, 11, 26 + step, 5, 2, cloth[2]);
  rect(b, 18, 26 - step, 5, 2, cloth[2]);
  rect(b, 10, 4, 13, 11, P.ink);
  rect(b, 9, 6, 15, 7, P.ink);
  rect(b, 11, 5, 11, 9, skin[1]);
  rect(b, 11, 5, 8, 3, skin[2]);
  rect(b, 8, 15, 18, 8, P.ink);
  rect(b, 8, 18, 3, 4, skin[1]);
  rect(b, 23, 18, 3, 4, skin[1]);
  rect(b, 8, 18, 2, 2, skin[2]);
  // Col and split coat, short blocks of color rather than texture.
  rect(v, 10, 12, 14, 5, P.ink);
  rect(v, 11, 12, 12, 3, cloth[0]);
  rect(v, 11, 14, 8, 2, cloth[1]);
  poly(
    v,
    [
      [10, 15],
      [23, 15],
      [25, 23],
      [21, 25],
      [17, 23],
      [14, 25],
      [9, 23],
    ],
    P.ink,
  );
  rect(v, 11, 16, 12, 6, cloth[1]);
  rect(v, 11, 16, 4, 5, cloth[2]);
  rect(v, 20, 16, 3, 6, cloth[0]);
  rect(v, 10, 22, 6, 2, cloth[1]);
  rect(v, 18, 22, 5, 2, cloth[0]);
  rect(v, 10, 20, 13, 2, P.ink);
  rect(v, 8, 15, 3, 4, cloth[1]);
  rect(v, 23, 15, 3, 4, cloth[0]);
  if (!north) {
    rect(v, 10, 10, 14, 3, cloth[0]);
    rect(v, 11, 10, 11, 1, cloth[1]);
    rect(v, 12, 8, 3, 1, P.ink);
    rect(v, 19, 8, 3, 1, P.ink);
    rect(v, 14, 8, 1, 1, P.ivory);
    rect(v, 20, 8, 1, 1, P.ivory);
  } else {
    rect(v, 10, 6, 14, 8, cloth[0]);
    rect(v, 11, 6, 10, 3, cloth[1]);
    rect(v, 14, 15, 4, 5, cloth[0]);
  }
  // Hair is intentionally a compact cap with two broken locks.
  rect(h, 11, 2, 11, 2, P.ink);
  rect(h, 9, 4, 15, 3, P.ink);
  rect(h, 10, 3, 11, 3, cloth[0]);
  rect(h, 11, 3, 7, 1, cloth[2]);
  rect(h, 9, 6, 2, 4, P.ink);
  rect(h, 22, 6, 2, 3, P.ink);
  rect(h, 13, 6, 4, 1, cloth[0]);
  // Lightweight cloth headgear leaves the crown visible (hairCoverage none).
  rect(g, 10, 6, 13, 1, P.wood[1]);
  rect(g, 10, 7, 4, 1, P.wood[2]);
  rect(g, 23, 7, 3, 2, P.wood[0]);
  if (hat) {
    poly(
      g,
      [
        [6, 7],
        [11, 3],
        [20, 3],
        [27, 7],
        [27, 9],
        [6, 9],
      ],
      P.ink,
    );
    rect(g, 8, 7, 17, 1, P.wood[1]);
    rect(g, 11, 5, 10, 2, P.wood[2]);
  }
  // Two offset copper segments: the recurring split-seal motif.
  rect(a, 15, 19, 2, 2, P.wood[2]);
  rect(a, 18, 21, 2, 2, P.wood[1]);
  rect(a, 24, 20, 2, 5, P.wood[0]);
  rect(a, 24, 20, 2, 1, P.wood[2]);
  if (weapon) {
    rect(w, 26, 14, 2, 8, P.ink);
    rect(w, 26, 14, 1, 5, P.ivory);
    rect(w, 25, 20, 4, 1, P.wood[2]);
    rect(w, 26, 21, 1, 3, P.wood[1]);
  }
  if (side) {
    // Native profile redraw: no anisotropic rescaling of a front sprite.
    for (const z of [b, v, h, g]) z.clearRect(0, 0, 32, 32);
    rect(b, 13, 22 + step, 4, 7 - step, P.ink);
    rect(b, 19, 22 - step, 4, 7 + step, P.ink);
    rect(b, 13, 27 + step, 5, 1, cloth[2]);
    rect(b, 19, 27 - step, 5, 1, cloth[2]);
    rect(b, 12, 4, 12, 10, P.ink);
    rect(b, 13, 5, 10, 8, skin[1]);
    rect(b, 13, 5, 7, 2, skin[2]);
    rect(b, 22, 17, 3, 5, P.ink);
    rect(b, 22, 19, 2, 2, skin[1]);
    rect(v, 12, 11, 12, 4, cloth[0]);
    rect(v, 13, 12, 9, 1, cloth[1]);
    rect(v, 12, 15, 11, 9, P.ink);
    rect(v, 13, 16, 8, 6, cloth[1]);
    rect(v, 13, 16, 2, 4, cloth[2]);
    rect(v, 12, 22, 4, 2, cloth[1]);
    rect(v, 18, 22, 4, 2, cloth[0]);
    rect(v, 13, 20, 10, 2, P.ink);
    rect(v, 21, 8, 3, 1, P.ink);
    rect(v, 23, 8, 1, 1, P.ivory);
    rect(h, 13, 2, 9, 2, P.ink);
    rect(h, 11, 4, 13, 3, P.ink);
    rect(h, 12, 3, 9, 3, cloth[0]);
    rect(h, 13, 3, 6, 1, cloth[2]);
    rect(h, 11, 6, 3, 4, P.ink);
    rect(g, 13, 6, 11, 1, P.wood[1]);
    rect(g, 13, 6, 3, 1, P.wood[2]);
  }
  // v1.1: material detail follows the volume, within the same 32px rig.
  // Small warm skin planes, darker fingertips and separated split-toe sandals.
  if (!side) {
    rect(b, 11, 7, 2, 2, skin[0]);
    rect(b, 21, 9, 2, 1, skin[0]);
    rect(b, 8, 21, 3, 1, skin[0]);
    rect(b, 23, 21, 3, 1, skin[0]);
    for (const [x, off] of [
      [11, step],
      [18, -step],
    ]) {
      rect(b, x + 1, 24 + off, 3, 2, cloth[0]);
      rect(b, x, 26 + off, 4, 1, cloth[1]);
      rect(b, x + 1, 27 + off, 2, 1, cloth[2]);
      rect(b, x + 2, 28, 1, 1, P.ink);
    }
    // Overlapping lapels, shoulder seam, forearm wraps, and lower hem.
    line(v, 11, 14, 16, 18, cloth[2]);
    line(v, 16, 18, 21, 14, cloth[0]);
    line(v, 12, 15, 16, 19, cloth[0]);
    line(v, 18, 17, 20, 15, cloth[1]);
    rect(v, 10, 16, 3, 1, cloth[2]);
    rect(v, 10, 17, 2, 1, cloth[0]);
    rect(v, 22, 16, 2, 1, cloth[1]);
    rect(v, 23, 18, 2, 1, cloth[2]);
    rect(v, 8, 18, 2, 1, cloth[0]);
    rect(v, 9, 19, 2, 1, cloth[2]);
    rect(v, 12, 22, 2, 2, cloth[2]);
    rect(v, 19, 22, 2, 1, cloth[1]);
    rect(v, 11, 23, 4, 1, cloth[0]);
    rect(v, 19, 23, 3, 1, cloth[2]);
    rect(v, 12, 11, 4, 1, cloth[2]);
    rect(v, 15, 12, 5, 1, cloth[1]);
    rect(v, 19, 11, 3, 1, cloth[0]);
    if (north) {
      rect(v, 14, 15, 5, 1, cloth[2]);
      line(v, 13, 16, 15, 19, cloth[0]);
      line(v, 21, 16, 19, 19, cloth[0]);
    }
    // Three broken hair clumps catch light on their upper-left edges.
    h.clearRect(8, 1, 17, 6);
    poly(
      h,
      [
        [9, 6],
        [10, 3],
        [13, 3],
        [14, 1],
        [18, 2],
        [21, 2],
        [23, 5],
        [23, 7],
      ],
      P.ink,
    );
    rect(h, 11, 4, 10, 2, cloth[0]);
    rect(h, 12, 3, 3, 1, cloth[1]);
    rect(h, 15, 2, 3, 2, cloth[1]);
    rect(h, 18, 4, 3, 1, cloth[1]);
    rect(h, 12, 3, 2, 1, cloth[2]);
    rect(h, 15, 2, 2, 1, cloth[2]);
  } else {
    line(v, 13, 14, 18, 18, cloth[2]);
    line(v, 14, 15, 18, 19, cloth[0]);
    rect(v, 20, 16, 3, 1, cloth[2]);
    rect(v, 21, 17, 2, 2, cloth[0]);
    rect(v, 22, 18, 2, 1, cloth[2]);
    rect(v, 13, 22, 2, 1, cloth[2]);
    rect(v, 19, 23, 2, 1, cloth[1]);
    rect(v, 14, 12, 4, 1, cloth[2]);
    rect(b, 22, 10, 1, 1, skin[0]);
    rect(h, 14, 2, 2, 1, cloth[2]);
    rect(h, 17, 4, 2, 1, cloth[1]);
    rect(h, 12, 5, 2, 1, cloth[1]);
    rect(b, 14, 25 + step, 2, 1, cloth[1]);
    rect(b, 20, 25 - step, 2, 1, cloth[1]);
  }
  // The shared accessory is a faceted clasp and a stitched, closed pouch.
  rect(a, 24, 20, 3, 5, P.ink);
  rect(a, 24, 20, 2, 4, P.wood[0]);
  rect(a, 24, 20, 2, 1, P.wood[2]);
  rect(a, 24, 22, 1, 1, P.wood[1]);
  rect(a, 15, 19, 2, 1, P.wood[2]);
  rect(a, 16, 20, 1, 1, P.wood[0]);
  rect(a, 18, 21, 2, 1, P.wood[2]);
  rect(a, 19, 22, 1, 1, P.wood[0]);
  if (hat && !side) {
    line(g, 12, 5, 10, 7, P.wood[0]);
    line(g, 15, 4, 14, 7, P.wood[1]);
    line(g, 18, 4, 20, 7, P.wood[0]);
    line(g, 20, 5, 24, 7, P.wood[1]);
    rect(g, 8, 8, 18, 1, P.wood[2]);
  }
  if (weapon) {
    rect(w, 27, 15, 1, 4, P.indigo[2]);
    rect(w, 26, 22, 1, 1, P.ink);
  }
  for (const [key, img] of Object.entries(layers)) if (!layer || key === layer) blit(c, img, 0, 0);
  if (direction === 'w') {
    const tmp = surface(32, 32);
    pen(tmp).drawImage(out, 0, 0);
    c.clearRect(0, 0, 32, 32);
    c.save();
    c.translate(32, 0);
    c.scale(-1, 1);
    c.drawImage(tmp, 0, 0);
    c.restore(); // study mirror, highlights corrected at left shoulder
    if (!layer) {
      rect(c, 11, 16, 2, 3, cloth[2]);
      rect(c, 18, 16, 2, 3, cloth[1]);
    }
  }
  return out;
}
export function tile(kind, variant = 0) {
  const s = surface(32, 32),
    c = pen(s);
  rect(c, 0, 0, 32, 32, P.stone[1]);
  const flecks = [
    [4, 7],
    [21, 5],
    [14, 19],
    [27, 25],
    [3, 28],
    [23, 14],
  ];
  for (let i = 0; i < 4; i++) {
    let [x, y] = flecks[(i + variant) % flecks.length];
    rect(c, x, y, 2, 1, i % 2 ? P.stone[0] : P.stone[2]);
  }
  if (kind === 'grass') {
    rect(c, 0, 0, 32, 32, P.green[1]);
    for (let i = 0; i < 7; i++) {
      let x = ((i * 11 + variant * 3) % 27) + 2,
        y = ((i * 7 + 3) % 25) + 3;
      line(c, x - 2, y - 2, x, y + 1, P.green[0]);
      line(c, x, y + 1, x + 2, y - 2, P.green[2]);
    }
  }
  if (kind === 'water') {
    rect(c, 0, 0, 32, 32, P.water[1]);
    for (let i = 0; i < 4; i++) {
      let x = ((i * 13 + variant * 2) % 22) + 2,
        y = i * 8 + 3;
      rect(c, x, y, 7, 1, P.water[2]);
      rect(c, x + 3, y + 2, 5, 1, P.water[0]);
    }
  }
  if (kind === 'wall') {
    rect(c, 0, 7, 32, 24, P.ink);
    rect(c, 0, 9, 32, 19, P.stone[0]);
    for (let y = 12; y < 28; y += 7) {
      rect(c, 0, y, 32, 1, P.edge);
      for (let x = (y % 2) * 8; x < 32; x += 16) rect(c, x, y - 6, 1, 6, P.edge);
    }
    rect(c, 0, 0, 32, 10, P.stone[0]);
    rect(c, 1, 1, 30, 7, P.stone[1]);
    rect(c, 1, 1, 30, 2, P.stone[2]);
    rect(c, 15, 2, 1, 5, P.stone[0]);
    rect(c, 0, 28, 32, 3, P.ink);
  }
  if (kind === 'rock') {
    c.clearRect(0, 0, 32, 32);
    ellipse(c, 17, 26, 13, 4, P.stone[0]);
    poly(
      c,
      [
        [5, 23],
        [5, 15],
        [11, 8],
        [23, 9],
        [28, 17],
        [26, 26],
        [9, 27],
      ],
      P.ink,
    );
    poly(
      c,
      [
        [7, 21],
        [7, 15],
        [12, 10],
        [23, 11],
        [26, 17],
        [24, 24],
        [10, 25],
      ],
      P.stone[0],
    );
    poly(
      c,
      [
        [7, 15],
        [13, 10],
        [22, 11],
        [22, 17],
        [15, 21],
        [7, 20],
      ],
      P.stone[1],
    );
    line(c, 9, 14, 14, 11, P.stone[2]);
  }
  if (kind === 'tree') {
    c.clearRect(0, 0, 32, 32);
    rect(c, 13, 19, 7, 10, P.ink);
    rect(c, 14, 20, 3, 8, P.wood[0]);
    rect(c, 14, 21, 1, 5, P.wood[1]);
    poly(
      c,
      [
        [2, 12],
        [5, 5],
        [12, 2],
        [22, 3],
        [29, 10],
        [29, 19],
        [24, 24],
        [8, 23],
        [2, 19],
      ],
      P.green[0],
    );
    poly(
      c,
      [
        [4, 12],
        [7, 6],
        [14, 4],
        [23, 6],
        [27, 12],
        [24, 18],
        [15, 20],
        [6, 17],
      ],
      P.green[1],
    );
    poly(
      c,
      [
        [7, 9],
        [12, 5],
        [20, 6],
        [22, 10],
        [16, 13],
        [8, 12],
      ],
      P.green[2],
    );
  }
  if (kind === 'building') {
    rect(c, 3, 16, 27, 14, P.ink);
    rect(c, 5, 17, 23, 11, P.stone[1]);
    rect(c, 15, 19, 7, 10, P.wood[0]);
    rect(c, 17, 21, 1, 6, P.wood[2]);
    rect(c, 20, 20, 1, 5, P.wood[1]);
    poly(
      c,
      [
        [0, 14],
        [6, 3],
        [24, 3],
        [32, 14],
        [32, 17],
        [0, 17],
      ],
      P.ink,
    );
    poly(
      c,
      [
        [2, 13],
        [7, 4],
        [24, 4],
        [29, 13],
      ],
      P.water[0],
    );
    for (let y = 5; y < 14; y += 3)
      rect(c, 8 - (y - 5) / 3, y, 16 + ((y - 5) / 3) * 2, 1, P.water[1]);
    rect(c, 5, 4, 20, 1, P.water[2]);
    rect(c, 2, 14, 28, 1, P.wood[1]);
  }
  if (kind === 'bridge') {
    rect(c, 0, 0, 32, 32, P.water[1]);
    rect(c, 3, 0, 26, 32, P.wood[0]);
    for (let y = 0; y < 32; y += 6) {
      rect(c, 5, y, 22, 5, P.wood[1]);
      rect(c, 5, y, 22, 1, P.wood[2]);
      rect(c, 20, y + 3, 5, 1, P.wood[0]);
    }
    rect(c, 3, 0, 2, 32, P.ink);
    rect(c, 27, 0, 2, 32, P.ink);
    rect(c, 3, 0, 1, 32, P.wood[2]);
  }
  // v1.1 surface studies: grouped edges and material marks, no random noise.
  if (kind === 'grass') {
    for (const [x, y] of [
      [5, 8],
      [18, 17],
      [8, 27],
    ]) {
      line(c, x - 3, y, x, y - 4, P.green[0]);
      line(c, x, y - 4, x, y + 1, P.green[2]);
      line(c, x + 1, y, x + 4, y - 2, P.green[2]);
      rect(c, x - 2, y + 2, 5, 1, P.green[0]);
    }
  }
  if (kind === 'water') {
    for (const [x, y] of [
      [4, 9],
      [20, 25],
    ]) {
      rect(c, x, y, 6, 1, P.water[0]);
      rect(c, x - 2, y - 1, 3, 1, P.water[2]);
      rect(c, x + 6, y + 1, 2, 1, P.water[2]);
    }
  }
  if (kind === 'wall') {
    for (const [x, y] of [
      [3, 14],
      [20, 21],
      [7, 26],
    ]) {
      rect(c, x, y, 7, 1, P.stone[1]);
      rect(c, x, y + 1, 2, 1, P.stone[1]);
    }
    line(c, 24, 2, 21, 4, P.stone[0]);
    line(c, 21, 4, 22, 6, P.stone[0]);
    rect(c, 2, 6, 8, 1, P.stone[2]);
    rect(c, 18, 7, 5, 1, P.stone[0]);
    rect(c, 3, 27, 5, 2, P.green[0]);
    rect(c, 4, 26, 3, 1, P.green[1]);
  }
  if (kind === 'rock') {
    poly(
      c,
      [
        [14, 10],
        [20, 11],
        [21, 16],
        [17, 18],
        [13, 15],
      ],
      P.stone[2],
    );
    line(c, 20, 18, 23, 20, P.ink);
    line(c, 23, 20, 22, 24, P.ink);
    line(c, 8, 20, 12, 22, P.stone[2]);
    rect(c, 13, 23, 4, 1, P.stone[1]);
    rect(c, 7, 25, 5, 2, P.green[0]);
    rect(c, 8, 24, 3, 1, P.green[1]);
  }
  if (kind === 'tree') {
    // Rebuild a lobed canopy with overlapping leaf masses and exposed roots.
    c.clearRect(0, 0, 32, 32);
    poly(
      c,
      [
        [10, 30],
        [13, 23],
        [13, 17],
        [19, 17],
        [20, 25],
        [24, 30],
        [18, 29],
        [15, 28],
      ],
      P.ink,
    );
    line(c, 15, 21, 14, 28, P.wood[1]);
    line(c, 17, 23, 20, 29, P.wood[0]);
    rect(c, 15, 24, 2, 3, P.wood[2]);
    const lobes = [
      [9, 14, 8, 7],
      [20, 15, 10, 8],
      [23, 8, 6, 6],
      [14, 7, 9, 6],
      [7, 8, 5, 5],
    ];
    for (const [x, y, rx, ry] of lobes) ellipse(c, x, y, rx, ry, P.green[0]);
    for (const [x, y, rx, ry] of lobes) ellipse(c, x - 1, y - 2, rx - 2, ry - 2, P.green[1]);
    for (const [x, y] of [
      [6, 7],
      [13, 4],
      [20, 6],
      [6, 13],
      [16, 11],
      [23, 14],
    ]) {
      rect(c, x, y, 4, 1, P.green[2]);
      rect(c, x - 1, y + 1, 3, 1, P.green[2]);
      rect(c, x + 1, y + 3, 4, 1, P.green[0]);
    }
    rect(c, 10, 18, 3, 1, P.green[2]);
    rect(c, 18, 19, 3, 1, P.green[1]);
  }
  if (kind === 'building') {
    for (let y = 6; y <= 12; y += 3)
      for (let x = 9 - (y % 2); x < 25; x += 5) {
        rect(c, x, y, 1, 2, P.water[0]);
        rect(c, x + 1, y + 1, 2, 1, P.water[2]);
      }
    rect(c, 5, 17, 23, 1, P.wood[0]);
    rect(c, 7, 19, 6, 6, P.wood[0]);
    rect(c, 8, 20, 4, 4, P.water[0]);
    rect(c, 9, 20, 1, 4, P.wood[1]);
    rect(c, 8, 21, 4, 1, P.wood[1]);
    rect(c, 6, 27, 7, 1, P.stone[2]);
    rect(c, 25, 20, 2, 5, P.wood[1]);
    rect(c, 25, 20, 2, 1, P.wood[2]);
    rect(c, 14, 29, 10, 2, P.stone[0]);
    rect(c, 15, 29, 8, 1, P.stone[2]);
  }
  if (kind === 'bridge') {
    for (let y = 1; y < 32; y += 6) {
      rect(c, 7, y + 1, 1, 1, P.ink);
      rect(c, 24, y + 1, 1, 1, P.ink);
      rect(c, 11, y + 2, 6, 1, P.wood[0]);
    }
    rect(c, 3, 5, 3, 3, P.wood[2]);
    rect(c, 26, 23, 3, 3, P.wood[2]);
  }
  return s;
}
export function symbol(c, id, x, y, color) {
  switch (id % 8) {
    case 0:
      ellipse(c, x + 2, y + 2, 2, 2, color, true);
      break;
    case 1:
      line(c, x + 2, y, x, y + 4, color);
      line(c, x + 2, y, x + 4, y + 4, color);
      rect(c, x, y + 4, 5, 1, color);
      break;
    case 2:
      rect(c, x, y, 5, 1, color);
      rect(c, x, y + 4, 5, 1, color);
      rect(c, x, y, 1, 5, color);
      rect(c, x + 4, y, 1, 5, color);
      break;
    case 3:
      line(c, x + 2, y, x + 4, y + 2, color);
      line(c, x + 4, y + 2, x + 2, y + 4, color);
      line(c, x + 2, y + 4, x, y + 2, color);
      line(c, x, y + 2, x + 2, y, color);
      break;
    case 4:
      rect(c, x + 2, y, 1, 5, color);
      rect(c, x, y + 2, 5, 1, color);
      break;
    case 5:
      rect(c, x + 1, y, 1, 5, color);
      rect(c, x + 3, y, 1, 5, color);
      break;
    case 6:
      line(c, x, y, x + 4, y + 4, color);
      line(c, x + 4, y, x, y + 4, color);
      break;
    case 7:
      symbol(c, 2, x, y, color);
      rect(c, x + 2, y + 2, 1, 1, color);
  }
}
export function marker(c, x, y, id, local = false) {
  const col = teams[id];
  line(c, x - 11, y - 1, x - 11, y + 2, col);
  line(c, x + 11, y - 1, x + 11, y + 2, col);
  rect(c, x - 9, y + 3, 3, 1, col);
  rect(c, x + 7, y + 3, 3, 1, col);
  rect(c, x - 4, y + 3, 9, 7, P.ink);
  symbol(c, id, x - 2, y + 4, col);
  if (local) {
    line(c, x - 3, y - 34, x, y - 31, P.ivory);
    line(c, x, y - 31, x + 3, y - 34, P.ivory);
  }
}
export function ring(c, x, y, r, color = P.danger, active = false) {
  ellipse(c, x, y, r + 1, r + 1, P.ink, true);
  ellipse(c, x, y, r, r, color, true);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    line(
      c,
      x + dx * (r - 1) - dy * 2,
      y + dy * (r - 1) + dx * 2,
      x + dx * (r - 4),
      y + dy * (r - 4),
      color,
    );
    line(
      c,
      x + dx * (r - 4),
      y + dy * (r - 4),
      x + dx * (r - 1) + dy * 2,
      y + dy * (r - 1) - dx * 2,
      color,
    );
  }
  if (active) {
    c.globalAlpha = 0.12;
    ellipse(c, x, y, r - 1, r - 1, color);
    c.globalAlpha = 1;
  }
}
export function brackets(c, x, y, color, size = 12) {
  for (const dx of [-1, 1])
    for (const dy of [-1, 1]) {
      line(c, x + dx * size, y + dy * size, x + dx * (size - 4), y + dy * size, color);
      line(c, x + dx * size, y + dy * size, x + dx * size, y + dy * (size - 4), color);
    }
}
export function chevron(c, x, y, color) {
  line(c, x - 3, y - 5, x + 2, y, color);
  line(c, x + 2, y, x - 3, y + 5, color);
}
export function impact(c, x, y, color = P.gold) {
  poly(
    c,
    [
      [x - 2, y - 3],
      [x, y - 12],
      [x + 3, y - 3],
      [x + 11, y - 6],
      [x + 5, y],
      [x + 12, y + 4],
      [x + 3, y + 3],
      [x, y + 11],
      [x - 3, y + 3],
      [x - 10, y + 5],
      [x - 5, y],
      [x - 10, y - 7],
    ],
    color,
  );
  rect(c, x - 1, y - 3, 3, 7, P.ivory);
  rect(c, x - 3, y - 1, 7, 3, P.ivory);
}
export function shield(c, x, y, active = true) {
  const shape = [
    [x - 13, y - 12],
    [x, y - 17],
    [x + 13, y - 12],
    [x + 11, y + 6],
    [x, y + 16],
    [x - 11, y + 6],
  ];
  if (active) {
    c.globalAlpha = 0.1;
    poly(c, shape, P.mint);
    c.globalAlpha = 1;
  }
  for (let i = 0; i < shape.length; i++) {
    const a = shape[i],
      b = shape[(i + 1) % shape.length];
    line(c, a[0], a[1], b[0], b[1], P.ink);
    line(c, a[0] - 1, a[1], b[0] - 1, b[1], P.mint);
  }
  line(c, x - 9, y - 10, x, y - 13, P.ivory);
  line(c, x - 10, y - 9, x - 9, y + 3, P.ivory);
  if (!active) {
    rect(c, x - 3, y - 2, 2, 5, P.mint);
    rect(c, x + 1, y + 1, 2, 4, P.mint);
  }
}
export function portal(c, x, y, active) {
  brackets(c, x, y, P.violet, 11);
  ellipse(c, x, y + 10, 10, 3, P.violet, true);
  if (active) {
    for (const [dx, dy] of [
      [-6, -11],
      [3, -16],
      [7, -5],
      [-3, 1],
      [4, 7],
    ])
      rect(c, x + dx, y + dy, 2, 4, P.ivory);
  } else {
    rect(c, x - 3, y - 3, 2, 5, P.violet);
    rect(c, x + 2, y, 2, 5, P.violet);
  }
}
export function ability(c, id, x, y, active) {
  if (id === 0) {
    if (!active) {
      ellipse(c, x, y, 5, 5, P.danger);
      ellipse(c, x + 1, y, 3, 3, P.gold);
      rect(c, x + 2, y - 1, 2, 2, P.ivory);
      line(c, x - 8, y + 3, x - 6, y + 1, P.gold);
    } else {
      poly(
        c,
        [
          [x - 22, y - 4],
          [x - 12, y - 3],
          [x - 17, y - 8],
          [x - 6, y - 5],
          [x, y - 6],
          [x + 7, y - 2],
          [x + 9, y],
          [x + 5, y + 4],
          [x - 3, y + 6],
          [x - 14, y + 4],
          [x - 20, y + 7],
          [x - 15, y + 1],
        ],
        P.danger,
      );
      poly(
        c,
        [
          [x - 14, y - 2],
          [x - 6, y - 2],
          [x - 10, y - 5],
          [x + 2, y - 3],
          [x + 6, y],
          [x + 1, y + 3],
          [x - 9, y + 3],
          [x - 5, y],
        ],
        P.gold,
      );
      rect(c, x - 1, y - 1, 6, 2, P.ivory);
      rect(c, x - 27, y + 2, 3, 1, P.gold);
      rect(c, x - 23, y - 7, 2, 1, P.danger);
    }
  }
  if (id === 1) {
    ring(c, x, y, 21, P.danger, active);
    if (!active) {
      for (const [dx, dy] of [
        [0, -11],
        [11, 0],
        [0, 11],
        [-11, 0],
      ]) {
        line(c, x + dx, y + dy, x + Math.round(dx * 0.6), y + Math.round(dy * 0.6), P.gold);
      }
    } else {
      for (const [dx, dy] of [
        [-11, 4],
        [0, -3],
        [11, 6],
      ]) {
        poly(
          c,
          [
            [x + dx - 4, y + dy + 4],
            [x + dx - 3, y + dy - 4],
            [x + dx, y + dy - 13],
            [x + dx + 2, y + dy - 3],
            [x + dx + 5, y + dy + 3],
          ],
          P.danger,
        );
        line(c, x + dx, y + dy + 2, x + dx, y + dy - 7, P.gold);
      }
    }
  }
  if (id === 2) {
    line(c, x - 25, y - 9, x + 19, y - 9, P.danger);
    line(c, x - 25, y + 9, x + 19, y + 9, P.danger);
    line(c, x + 19, y - 9, x + 27, y, P.danger);
    line(c, x + 27, y, x + 19, y + 9, P.danger);
    chevron(c, x - 4, y, P.cyan);
    chevron(c, x + 9, y, P.cyan);
    if (active) {
      line(c, x - 28, y - 4, x - 12, y - 4, P.cyan);
      line(c, x - 23, y + 4, x - 10, y + 4, P.ivory);
    } else {
      line(c, x - 23, y - 13, x - 19, y - 8, P.cyan);
      line(c, x - 19, y - 8, x - 23, y - 4, P.cyan);
    }
  }
  if (id === 3) {
    for (const dx of [-1, 1]) {
      line(c, x, y - 11, x + dx * 13, y, P.gold);
      line(c, x + dx * 13, y, x, y + 11, P.gold);
    }
    if (!active) {
      rect(c, x - 3, y - 2, 6, 4, P.wood[0]);
      rect(c, x - 2, y - 2, 2, 2, P.gold);
      rect(c, x + 1, y, 2, 2, P.gold);
    } else {
      ring(c, x, y, 17, P.danger, true);
      for (const dx of [-1, 1]) {
        line(c, x + dx * 12, y + 3, x + dx * 6, y - 5, P.danger);
        line(c, x + dx * 6, y - 5, x + dx * 3, y + 2, P.ivory);
      }
      rect(c, x - 2, y, 5, 2, P.gold);
    }
  }
  if (id === 4) shield(c, x, y, active);
  if (id === 5) {
    portal(c, x - 16, y, !active);
    portal(c, x + 17, y, active);
  }
  if (id === 6) {
    if (!active) {
      brackets(c, x, y, P.violet, 17);
      for (const dx of [-1, 1]) {
        line(c, x + dx * 14, y + 8, x + dx * 5, y + 3, P.violet);
      }
    } else {
      ellipse(c, x, y + 8, 12, 4, P.violet, true);
      for (const dx of [-1, 1]) {
        line(c, x + dx * 13, y + 9, x + dx * 6, y - 1, P.violet);
        rect(c, x + dx * 9, y + 3, 3, 2, P.ivory);
      }
      rect(c, x - 4, y - 22, 9, 7, P.ink);
      rect(c, x - 3, y - 22, 7, 6, P.violet);
      rect(c, x - 2, y - 26, 5, 1, P.violet);
      rect(c, x - 3, y - 25, 1, 4, P.violet);
      rect(c, x + 3, y - 25, 1, 4, P.violet);
      rect(c, x, y - 20, 1, 3, P.ink);
    }
  }
}

const L = P.landscape;
export function hash(x, y) {
  let n = Math.imul(x + 71, 374761393) ^ Math.imul(y + 37, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}
export function slab(ctx, x, y, w, h, variant = 0) {
  poly(
    ctx,
    [
      [x + 2, y],
      [x + w - 2, y],
      [x + w, y + 2],
      [x + w, y + h - 2],
      [x + w - 2, y + h],
      [x, y + h - 1],
      [x, y + 2],
    ],
    P.stone[0],
  );
  rect(ctx, x + 1, y + 1, w - 2, h - 3, P.stone[1]);
  rect(ctx, x + 3, y + 1, w - 7, 1, P.stone[2]);
  if (variant % 3 === 0) {
    line(ctx, x + w - 7, y + 2, x + w - 9, y + 5, P.stone[0]);
    line(ctx, x + w - 9, y + 5, x + w - 7, y + 7, P.stone[0]);
  }
  if (variant % 4 === 0) rect(ctx, x + 3, y + h - 4, 3, 1, L.soil);
}
export function tuft(ctx, x, y, tone = P.green[2]) {
  line(ctx, x - 3, y, x - 5, y - 4, P.green[0]);
  line(ctx, x - 2, y, x - 2, y - 6, tone);
  line(ctx, x, y, x + 3, y - 5, tone);
  line(ctx, x + 2, y, x + 5, y - 2, P.green[1]);
}
export function bush(ctx, x, y, size = 12) {
  ellipse(ctx, x + 4, y + 5, size + 3, 5, L.shade);
  ellipse(ctx, x, y, size, Math.round(size * 0.55), P.green[0]);
  ellipse(ctx, x - 2, y - 3, size - 2, Math.round(size * 0.5), P.green[1]);
  for (let i = 0; i < 8; i++) {
    let a = (hash(i, x) % Math.max(1, size * 2 - 6)) - size + 3,
      b = (hash(i, y) % 7) - 6;
    rect(ctx, x + a, y + b, 3, 1, P.green[2]);
  }
}
export function tree(ctx, x, y, variant = 0) {
  // Full-size 64px object, drawn natively, not a doubled 32px tile.
  const shadow = [
    [x - 18, y + 2],
    [x + 15, y - 5],
    [x + 35, y + 12],
    [x + 22, y + 21],
    [x - 8, y + 14],
  ];
  poly(ctx, shadow, L.shade);
  poly(
    ctx,
    [
      [x - 7, y + 7],
      [x - 5, y - 19],
      [x + 4, y - 25],
      [x + 8, y + 4],
      [x + 14, y + 11],
      [x + 4, y + 9],
      [x, y + 4],
      [x - 6, y + 11],
      [x - 13, y + 12],
    ],
    P.wood[0],
  );
  rect(ctx, x - 4, y - 15, 3, 19, P.wood[1]);
  line(ctx, x - 3, y - 12, x - 5, y + 7, P.wood[2]);
  line(ctx, x + 2, y - 6, x + 4, y + 6, P.ink);
  line(ctx, x - 2, y + 1, x - 8, y + 9, P.wood[1]);
  const clusters = [
    [-15, -24, 15, 11],
    [12, -27, 18, 13],
    [0, -41, 19, 14],
    [-20, -36, 12, 10],
    [23, -39, 10, 11],
    [13, -48, 13, 9],
  ];
  for (const [dx, dy, rx, ry] of clusters) ellipse(ctx, x + dx, y + dy, rx, ry, P.green[0]);
  for (let i = 0; i < clusters.length; i++) {
    const [dx, dy, rx, ry] = clusters[i];
    ellipse(ctx, x + dx - 2, y + dy - 3, rx - 2, ry - 3, P.green[1]);
    ellipse(ctx, x + dx - 4, y + dy - 5, Math.max(3, rx - 7), Math.max(2, ry - 7), P.green[2]);
    for (let j = 0; j < 8; j++) {
      const xx = x + dx - 9 + (hash(i + j, variant + 3) % 18),
        yy = y + dy - 6 + (hash(j, variant + i) % 10);
      rect(ctx, xx, yy, 3 + (j % 2), 1, j % 3 ? P.green[2] : L.leaf);
      if (j % 3 === 0) rect(ctx, xx - 1, yy + 1, 2, 1, P.green[2]);
    }
    line(ctx, x + dx + 2, y + dy + ry - 4, x + dx + 6, y + dy + ry - 5, P.green[0]);
  }
  tuft(ctx, x - 10, y + 10);
  tuft(ctx, x + 12, y + 10, P.green[1]);
}
export function lantern(ctx, x, y) {
  ellipse(ctx, x + 5, y + 4, 9, 3, L.shade);
  rect(ctx, x - 3, y - 16, 7, 18, P.wood[0]);
  rect(ctx, x - 1, y - 11, 3, 13, P.stone[1]);
  rect(ctx, x - 5, y - 23, 11, 10, P.wood[0]);
  rect(ctx, x - 3, y - 21, 7, 6, P.wood[2]);
  rect(ctx, x - 2, y - 21, 4, 4, P.stone[2]);
  rect(ctx, x, y - 21, 1, 6, P.wood[0]);
  poly(
    ctx,
    [
      [x - 7, y - 23],
      [x - 3, y - 27],
      [x + 3, y - 27],
      [x + 8, y - 23],
    ],
    P.water[0],
  );
  rect(ctx, x - 4, y - 26, 7, 1, P.water[2]);
  rect(ctx, x - 5, y + 1, 11, 2, P.stone[0]);
}
